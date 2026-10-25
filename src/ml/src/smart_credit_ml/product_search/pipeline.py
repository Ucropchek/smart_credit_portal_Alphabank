from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Any
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

from smart_credit_ml.product_search.config import SearchSettings
from smart_credit_ml.product_search.extract import compact_digits, extract_page, is_rub, parse_price
from smart_credit_ml.product_search.llm import JsonLlm, LlmError
from smart_credit_ml.product_search.models import (
    Offer,
    PageFacts,
    PriceSource,
    ProductSearchResult,
    SearchHit,
    SearchStats,
)
from smart_credit_ml.product_search.web import PageFetcher, WebSearch

_TRACKING = ("utm_", "yclid", "gclid", "fbclid", "_openstat")
_LOWER_BOUND = re.compile(r"\bот\s*\d|\d\s*[-–—]\s*\d", re.IGNORECASE)

PLAN_SYSTEM = (
    "Ты помогаешь предпринимателю найти товар, который он купит на кредит. "
    "Составь короткие поисковые запросы на русском языке, которые приведут на страницы интернет-магазинов "
    "с этим товаром и ценой. Правила:\n"
    "1. Тип товара строго как в ключевых словах. Не заменяй его другим товаром и не расширяй до категории: "
    "для «компьютер» нельзя писать «ноутбук», «моноблок» или «компьютерная техника».\n"
    "2. Не добавляй уточнений, которых нет в ключевых словах и цели: «игровой», «для работы», бренды, модели.\n"
    "3. Цену указывай только как верхнюю границу: «до N рублей», где N — бюджет. "
    "Никогда не пиши нижнюю границу («от N»), диапазоны и другие суммы.\n"
    "4. Добавляй слова «купить» или «цена». Не пиши ссылки и названия сайтов.\n"
    "5. Запросы должны отличаться формулировкой, а не товаром."
)

JUDGE_SYSTEM = (
    "Ты проверяешь результаты поиска товаров. Для каждой страницы реши:\n"
    "is_offer — это страница конкретного товара, который можно купить (не каталог, не статья, не форум, не обзор);\n"
    "relevant — товар соответствует ключевым словам;\n"
    "name — краткое название товара;\n"
    "price_rub — цена в рублях ровно так, как она указана на странице или в описании; null, если цены нет;\n"
    "relevance — от 1 до 5, насколько товар подходит под запрос;\n"
    "reason — одна короткая фраза по-русски.\n"
    "Ничего не придумывай. Отвечай только по переданным данным, используя index страницы."
)

CARD_SYSTEM = (
    "Ты проверяешь товары из каталогов интернет-магазинов. Название и цена уже известны. "
    "Для каждого товара по названию реши:\n"
    "relevant — это тот же тип товара, что в ключевых словах, а не аксессуар, комплектующая или другой тип товара;\n"
    "relevance — от 1 до 5: 5 — точно тот товар, 3 — подходит частично, 1 — почти не подходит.\n"
    "Отвечай только по переданным данным, используя index товара."
)

CARD_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "index": {"type": "integer"},
                    "relevant": {"type": "boolean"},
                    "relevance": {"type": "integer"},
                },
                "required": ["index", "relevant", "relevance"],
            },
        }
    },
    "required": ["items"],
}

PLAN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"queries": {"type": "array", "items": {"type": "string"}}},
    "required": ["queries"],
}

JUDGE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "index": {"type": "integer"},
                    "is_offer": {"type": "boolean"},
                    "relevant": {"type": "boolean"},
                    "name": {"type": "string"},
                    "price_rub": {"type": ["number", "null"]},
                    "relevance": {"type": "integer"},
                    "reason": {"type": "string"},
                },
                "required": ["index", "is_offer", "relevant", "name", "price_rub", "relevance", "reason"],
            },
        }
    },
    "required": ["items"],
}


@dataclass
class _Candidate:
    hit: SearchHit
    facts: PageFacts | None = None
    catalog_url: str | None = None


@dataclass(frozen=True)
class _Verdict:
    is_offer: bool
    relevant: bool
    name: str
    price: Decimal | None
    relevance: int
    reason: str


def canonical_url(url: str) -> str:
    parts = urlsplit(url)
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if not k.lower().startswith(_TRACKING)]
    return urlunsplit((parts.scheme, parts.netloc.lower(), parts.path or "/", urlencode(query), ""))


def domain_of(url: str) -> str:
    host = (urlsplit(url).hostname or "").lower()
    return host.removeprefix("www.")


class ProductSearcher:
    def __init__(self, settings: SearchSettings, search: WebSearch, fetcher: PageFetcher, llm: JsonLlm) -> None:
        self.settings = settings
        self.search = search
        self.fetcher = fetcher
        self.llm = llm

    async def run(
        self, keywords: str, budget_rub: Decimal, purpose: str | None = None, max_results: int = 10
    ) -> ProductSearchResult:
        keywords = keywords.strip()
        if not keywords:
            raise ValueError("keywords must not be empty")
        if budget_rub <= 0:
            raise ValueError("budget_rub must be positive")

        warnings: list[str] = []
        stats = SearchStats()

        queries = await self._plan_queries(keywords, budget_rub, purpose, warnings)
        failures_before = len(warnings)
        candidates = await self._collect(queries, warnings)
        stats.candidates = len(candidates)
        search_unavailable = len(warnings) - failures_before == len(queries)

        await self._fetch_all(candidates)
        stats.fetched = sum(1 for candidate in candidates if candidate.facts is not None)
        candidates = self._expand_catalogs(candidates, stats)

        verdicts = await self._judge_all(keywords, candidates, warnings)

        priced: list[Offer] = []
        for index, candidate in enumerate(candidates):
            verdict = verdicts.get(index)
            if verdict is None or not verdict.is_offer or not verdict.relevant:
                stats.not_offer += 1
                continue
            picked = _pick_price(candidate, verdict)
            if picked is None:
                stats.no_price += 1
                continue
            price, source = picked
            offer = Offer(
                name=(candidate.facts and candidate.facts.product_name) or verdict.name or candidate.hit.title,
                url=candidate.hit.url,
                domain=domain_of(candidate.hit.url),
                price_rub=price,
                price_source=source,
                relevance=verdict.relevance,
                reason=verdict.reason,
                query=candidate.hit.query,
            )
            priced.append(offer)

        unique = _dedupe(priced)
        stats.duplicates += len(priced) - len(unique)
        offers = [offer for offer in unique if offer.price_rub <= budget_rub]
        over_budget = [offer for offer in unique if offer.price_rub > budget_rub]
        stats.over_budget = len(over_budget)

        offers.sort(key=lambda offer: (-offer.relevance, offer.price_rub))
        over_budget.sort(key=lambda offer: offer.price_rub)
        if not offers:
            warnings.append("Подходящих предложений в пределах суммы кредита не найдено.")
        return ProductSearchResult(
            keywords=keywords,
            budget_rub=budget_rub,
            queries=queries,
            offers=offers[:max_results],
            over_budget=over_budget[:3],
            stats=stats,
            warnings=warnings,
            search_unavailable=search_unavailable,
        )

    async def _plan_queries(
        self, keywords: str, budget: Decimal, purpose: str | None, warnings: list[str]
    ) -> list[str]:
        fallback = [f"{keywords} купить цена"]
        prompt = (
            f"Ключевые слова: {keywords}\n"
            f"Цель кредита: {purpose or 'не указана'}\n"
            f"Бюджет: до {budget:.0f} рублей\n"
            f"Нужно не больше {self.settings.max_queries} запросов."
        )
        try:
            answer = await self.llm.ask_json(PLAN_SYSTEM, prompt, PLAN_SCHEMA)
        except LlmError as error:
            warnings.append(f"Модель не составила запросы, взят запрос по ключевым словам ({error}).")
            return fallback
        stems = _stems(keywords)
        queries: list[str] = []
        rejected: list[str] = []
        for query in answer.get("queries", []):
            if not isinstance(query, str) or not query.strip() or "://" in query:
                continue
            query = query.strip()[:200]
            if query in queries:
                continue
            if _LOWER_BOUND.search(query) or not all(stem in query.lower().replace("ё", "е") for stem in stems):
                rejected.append(query)
                continue
            queries.append(query)
        if rejected:
            warnings.append(f"Отброшены запросы модели, уходящие от товара или с нижней границей цены: {rejected}")
        return queries[: self.settings.max_queries] or fallback

    async def _collect(self, queries: list[str], warnings: list[str]) -> list[_Candidate]:
        results = await asyncio.gather(
            *(self.search.search(query, self.settings.results_per_query) for query in queries), return_exceptions=True
        )
        seen: set[str] = set()
        per_domain: dict[str, int] = {}
        candidates: list[_Candidate] = []
        lists = []
        for query, result in zip(queries, results):
            if isinstance(result, BaseException):
                warnings.append(f"Поиск по запросу «{query}» не ответил: {result}")
                continue
            lists.append(list(result))
        while any(lists) and len(candidates) < self.settings.max_candidates:
            for hits in lists:
                if not hits or len(candidates) >= self.settings.max_candidates:
                    continue
                hit = hits.pop(0)
                key = canonical_url(hit.url)
                domain = domain_of(hit.url)
                if key in seen or per_domain.get(domain, 0) >= self.settings.per_domain_limit:
                    continue
                seen.add(key)
                per_domain[domain] = per_domain.get(domain, 0) + 1
                candidates.append(_Candidate(hit))
        return candidates

    async def _fetch_all(self, candidates: list[_Candidate]) -> None:
        gate = asyncio.Semaphore(self.settings.fetch_concurrency)

        async def load(candidate: _Candidate) -> None:
            async with gate:
                html = await self.fetcher.fetch(candidate.hit.url)
            if html:
                candidate.facts = extract_page(html)

        await asyncio.gather(*(load(candidate) for candidate in candidates))

    def _expand_catalogs(self, candidates: list[_Candidate], stats: SearchStats) -> list[_Candidate]:
        seen = {canonical_url(c.hit.url) for c in candidates if not (c.facts and c.facts.is_catalog)}
        expanded: list[_Candidate] = []
        for candidate in candidates:
            facts = candidate.facts
            if not (facts and facts.is_catalog):
                expanded.append(candidate)
                continue
            stats.catalogs += 1
            site = domain_of(candidate.hit.url)
            taken = 0
            for card in facts.listed:
                if taken >= self.settings.per_catalog_limit or stats.listed >= self.settings.max_listed:
                    break
                url = urljoin(candidate.hit.url, card.url)
                if urlsplit(url).scheme not in {"http", "https"} or not _same_site(domain_of(url), site):
                    continue
                key = canonical_url(url)
                if key in seen:
                    stats.duplicates += 1
                    continue
                seen.add(key)
                taken += 1
                stats.listed += 1
                expanded.append(
                    _Candidate(
                        hit=SearchHit(url=url, title=card.name, snippet="", query=candidate.hit.query),
                        facts=PageFacts(title=card.name, product_name=card.name, price=card.price, currency=card.currency),
                        catalog_url=candidate.hit.url,
                    )
                )
        return expanded

    async def _judge_all(
        self, keywords: str, candidates: list[_Candidate], warnings: list[str]
    ) -> dict[int, _Verdict]:
        cards = [index for index, candidate in enumerate(candidates) if _is_priced_card(candidate)]
        card_set = set(cards)
        pages = [index for index in range(len(candidates)) if index not in card_set]

        verdicts: dict[int, _Verdict] = {}
        size = max(1, self.settings.judge_batch)
        for start in range(0, len(pages), size):
            batch = pages[start : start + size]
            try:
                verdicts.update(await self._judge(keywords, candidates, batch))
            except LlmError as error:
                warnings.append(f"Модель не разобрала страницы {batch[0]}–{batch[-1]}, взята только разметка ({error}).")
                verdicts.update(_markup_verdicts(candidates, batch))

        size = max(1, self.settings.card_batch)
        for start in range(0, len(cards), size):
            batch = cards[start : start + size]
            try:
                verdicts.update(await self._check_cards(keywords, candidates, batch))
            except LlmError as error:
                warnings.append(f"Модель не проверила карточки каталогов, взяты все по разметке ({error}).")
                verdicts.update(_markup_verdicts(candidates, batch))
        return verdicts

    async def _check_cards(self, keywords: str, candidates: list[_Candidate], batch: list[int]) -> dict[int, _Verdict]:
        cards = [{"index": index, "name": candidates[index].facts.product_name} for index in batch]
        prompt = f"Ключевые слова: {keywords}\nТовары:\n{json.dumps(cards, ensure_ascii=False)}"
        answer = await self.llm.ask_json(CARD_SYSTEM, prompt, CARD_SCHEMA)

        allowed = set(batch)
        verdicts: dict[int, _Verdict] = {}
        for item in answer.get("items", []):
            if not isinstance(item, dict) or item.get("index") not in allowed:
                continue
            index = item["index"]
            facts = candidates[index].facts
            relevance = item.get("relevance")
            verdicts[index] = _Verdict(
                is_offer=True,
                relevant=item.get("relevant") is True,
                name=facts.product_name or "",
                price=None,
                relevance=min(5, max(1, relevance)) if isinstance(relevance, int) else 1,
                reason=f"Карточка из каталога {domain_of(candidates[index].catalog_url)}: название и цена из разметки.",
            )
        return verdicts

    async def _judge(self, keywords: str, candidates: list[_Candidate], batch: list[int]) -> dict[int, _Verdict]:
        pages = []
        for index in batch:
            candidate = candidates[index]
            facts = candidate.facts
            pages.append(
                {
                    "index": index,
                    "site": domain_of(candidate.hit.url),
                    "search_title": candidate.hit.title,
                    "search_snippet": candidate.hit.snippet[:400],
                    "page_title": facts.title if facts else None,
                    "markup_name": facts.product_name if facts else None,
                    "markup_price": str(facts.price) if facts and facts.price is not None else None,
                    "page_text": facts.text[:1200]
                    if facts and facts.text
                    else f"карточка товара из каталога {domain_of(candidate.catalog_url)}"
                    if candidate.catalog_url
                    else "страница не загрузилась",
                }
            )
        prompt = f"Ключевые слова: {keywords}\nСтраницы:\n{json.dumps(pages, ensure_ascii=False)}"
        answer = await self.llm.ask_json(JUDGE_SYSTEM, prompt, JUDGE_SCHEMA)

        allowed = set(batch)
        verdicts: dict[int, _Verdict] = {}
        for item in answer.get("items", []):
            if not isinstance(item, dict) or item.get("index") not in allowed:
                continue
            relevance = item.get("relevance")
            verdicts[item["index"]] = _Verdict(
                is_offer=item.get("is_offer") is True,
                relevant=item.get("relevant") is True,
                name=str(item.get("name") or "").strip()[:300],
                price=parse_price(item.get("price_rub")),
                relevance=min(5, max(1, relevance)) if isinstance(relevance, int) else 1,
                reason=str(item.get("reason") or "").strip()[:300],
            )
        return verdicts


def _markup_verdicts(candidates: list[_Candidate], batch: list[int]) -> dict[int, _Verdict]:
    verdicts: dict[int, _Verdict] = {}
    for index in batch:
        facts = candidates[index].facts
        if facts and facts.price is not None and is_rub(facts.currency):
            verdicts[index] = _Verdict(
                is_offer=True,
                relevant=True,
                name=facts.product_name or candidates[index].hit.title,
                price=None,
                relevance=1,
                reason="Модель недоступна: товар и цена взяты из разметки страницы.",
            )
    return verdicts


def _stems(keywords: str) -> list[str]:
    words = re.findall(r"\w+", keywords.lower().replace("ё", "е"))
    return [word[: max(4, len(word) - 3)] if len(word) > 4 else word for word in words if len(word) >= 3] or [
        keywords.lower()
    ]


def _is_priced_card(candidate: _Candidate) -> bool:
    facts = candidate.facts
    return bool(
        candidate.catalog_url and facts and facts.product_name and facts.price is not None and is_rub(facts.currency)
    )


def _same_site(host: str, site: str) -> bool:
    return bool(host) and (host == site or host.endswith("." + site) or site.endswith("." + host))


def _product_key(offer: Offer) -> tuple[str, str]:
    name = re.sub(r"[^\w]+", " ", offer.name.lower().replace("ё", "е")).strip()
    return (offer.domain, name or canonical_url(offer.url))


def _dedupe(offers: list[Offer]) -> list[Offer]:
    best: dict[tuple[str, str], Offer] = {}
    for offer in offers:
        key = _product_key(offer)
        kept = best.get(key)
        if kept is None or (offer.price_rub, -offer.relevance) < (kept.price_rub, -kept.relevance):
            best[key] = offer
    return list(best.values())


def _pick_price(candidate: _Candidate, verdict: _Verdict) -> tuple[Decimal, PriceSource] | None:
    facts = candidate.facts
    if facts and facts.price is not None and is_rub(facts.currency):
        return facts.price, "catalog" if candidate.catalog_url else "structured"
    if verdict.price is None:
        return None
    number = compact_digits(f"{verdict.price.normalize():f}".split(".")[0])
    if len(number) < 3:
        return None
    if facts and number in compact_digits(facts.text):
        return verdict.price, "page_text"
    if number in compact_digits(candidate.hit.snippet):
        return verdict.price, "snippet"
    return None
