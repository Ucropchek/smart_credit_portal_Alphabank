import asyncio
import json
from decimal import Decimal

from smart_credit_ml.product_search.config import SearchSettings
from smart_credit_ml.product_search.llm import LlmError
from smart_credit_ml.product_search.models import SearchHit
from smart_credit_ml.product_search.pipeline import ProductSearcher, canonical_url

SETTINGS = SearchSettings(judge_batch=10)
Q1 = "холодильная витрина купить"
Q2 = "холодильная витрина цена"


class FakeSearch:
    def __init__(self, hits: dict[str, list[tuple[str, str, str]]], fail: set[str] = frozenset()):
        self.hits = hits
        self.fail = fail
        self.queries: list[str] = []

    async def search(self, query, limit):
        self.queries.append(query)
        if query in self.fail:
            raise RuntimeError("engine down")
        return [SearchHit(url, title, snippet, query) for url, title, snippet in self.hits.get(query, [])][:limit]


class FakeFetcher:
    def __init__(self, pages: dict[str, str]):
        self.pages = pages

    async def fetch(self, url):
        return self.pages.get(url)


class FakeLlm:
    def __init__(self, queries, verdicts, fail_judge=False, fail_plan=False, irrelevant_cards=()):
        self.queries = queries
        self.verdicts = verdicts
        self.fail_judge = fail_judge
        self.fail_plan = fail_plan
        self.irrelevant_cards = set(irrelevant_cards)
        self.calls: list[tuple[str, list[int]]] = []
        self.prompts: list[str] = []

    async def ask_json(self, system, user, schema):
        if "queries" in schema["properties"]:
            self.calls.append(("plan", []))
            if self.fail_plan:
                raise LlmError("offline")
            return {"queries": self.queries}
        if self.fail_judge:
            raise LlmError("offline")
        self.prompts.append(user)
        is_card_check = "is_offer" not in schema["properties"]["items"]["items"]["properties"]
        listed = json.loads(user[user.index("\n[") + 1 :])
        indices = [item["index"] for item in listed]
        if is_card_check:
            self.calls.append(("cards", indices))
            return {
                "items": [
                    {"index": index, "relevant": index not in self.irrelevant_cards, "relevance": 3} for index in indices
                ]
            }
        self.calls.append(("judge", indices))
        return {"items": self.verdicts}


def verdict(index, price=None, offer=True, relevant=True, relevance=4, name="Товар"):
    return {
        "index": index,
        "is_offer": offer,
        "relevant": relevant,
        "name": name,
        "price_rub": price,
        "relevance": relevance,
        "reason": "Подходит",
    }


def product_page(price, currency="RUB"):
    return (
        '<script type="application/ld+json">'
        f'{{"@type":"Product","name":"Витрина","offers":{{"@type":"Offer","price":"{price}","priceCurrency":"{currency}"}}}}'
        "</script><p>Витрина холодильная</p>"
    )


def run(searcher, budget=500_000, **kwargs):
    return asyncio.run(searcher.run("холодильная витрина", Decimal(budget), "оборудование", **kwargs))


def test_offers_fit_budget_and_urls_come_from_search():
    search = FakeSearch(
        {
            Q1: [
                ("https://shop-a.ru/vitrina-1", "Витрина 1", ""),
                ("https://shop-b.ru/vitrina-2", "Витрина 2", ""),
                ("https://shop-c.ru/catalog", "Каталог витрин", ""),
                ("https://shop-d.ru/vitrina-3", "Витрина 3", "Цена 420 000 ₽"),
            ]
        }
    )
    fetcher = FakeFetcher(
        {
            "https://shop-a.ru/vitrina-1": product_page("350000"),
            "https://shop-b.ru/vitrina-2": product_page("780000"),
            "https://shop-c.ru/catalog": "<p>Каталог</p>",
        }
    )
    llm = FakeLlm(
        [Q1],
        [
            verdict(0, relevance=3),
            verdict(1, relevance=5),
            verdict(2, offer=False),
            verdict(99, price=1000),
            verdict(3, price=420000, relevance=5),
        ],
    )

    result = run(ProductSearcher(SETTINGS, search, fetcher, llm))

    assert [offer.url for offer in result.offers] == ["https://shop-d.ru/vitrina-3", "https://shop-a.ru/vitrina-1"]
    assert [offer.price_source for offer in result.offers] == ["snippet", "structured"]
    assert [offer.url for offer in result.over_budget] == ["https://shop-b.ru/vitrina-2"]
    assert result.stats.candidates == 4
    assert result.stats.fetched == 3
    assert result.stats.not_offer == 1
    assert result.stats.over_budget == 1


def test_model_price_not_on_page_is_dropped():
    search = FakeSearch({Q1: [("https://shop.ru/p", "Витрина", "Лучшая витрина")]})
    fetcher = FakeFetcher({"https://shop.ru/p": "<p>Витрина холодильная, цена 199 900 руб.</p>"})

    confirmed = run(ProductSearcher(SETTINGS, search, fetcher, FakeLlm([Q1], [verdict(0, price=199900)])))
    assert confirmed.offers[0].price_rub == Decimal("199900")
    assert confirmed.offers[0].price_source == "page_text"

    invented = run(ProductSearcher(SETTINGS, search, fetcher, FakeLlm([Q1], [verdict(0, price=150000)])))
    assert invented.offers == []
    assert invented.stats.no_price == 1


def test_foreign_currency_markup_is_not_taken_as_roubles():
    search = FakeSearch({Q1: [("https://shop.com/p", "Showcase", "")]})
    fetcher = FakeFetcher({"https://shop.com/p": product_page("3000", currency="USD")})
    result = run(ProductSearcher(SETTINGS, search, fetcher, FakeLlm([Q1], [verdict(0)])))
    assert result.offers == []
    assert result.stats.no_price == 1


def test_model_offline_falls_back_to_keywords_and_markup():
    search = FakeSearch(
        {
            "холодильная витрина купить цена": [
                ("https://shop.ru/a", "Витрина", ""),
                ("https://shop.ru/b", "Статья о витринах", ""),
            ]
        }
    )
    fetcher = FakeFetcher({"https://shop.ru/a": product_page("120000"), "https://shop.ru/b": "<p>Статья</p>"})
    llm = FakeLlm([], [], fail_judge=True, fail_plan=True)

    result = run(ProductSearcher(SETTINGS, search, fetcher, llm))

    assert search.queries == ["холодильная витрина купить цена"]
    assert [offer.url for offer in result.offers] == ["https://shop.ru/a"]
    assert result.offers[0].relevance == 1
    assert len(result.warnings) == 2


def test_duplicates_domain_limit_and_failed_query():
    settings = SearchSettings(judge_batch=10, per_domain_limit=2)
    search = FakeSearch(
        {
            Q1: [
                ("https://big.ru/1?utm_source=x", "1", ""),
                ("https://big.ru/1", "1 again", ""),
                ("https://big.ru/2", "2", ""),
                ("https://big.ru/3", "3", ""),
            ]
        },
        fail={Q2},
    )
    result = run(ProductSearcher(settings, search, FakeFetcher({}), FakeLlm([Q1, Q2, Q1], [])))
    assert result.queries == [Q1, Q2]
    assert result.stats.candidates == 2
    assert any(Q2 in warning for warning in result.warnings)
    assert not result.search_unavailable


def test_engine_down_for_every_query_is_reported():
    search = FakeSearch({}, fail={Q1, Q2})
    result = run(ProductSearcher(SETTINGS, search, FakeFetcher({}), FakeLlm([Q1, Q2], [])))
    assert result.search_unavailable
    assert result.offers == []


def catalog_page(cards):
    items = ",".join(
        f'{{"@type":"ListItem","item":{{"@type":"Product","name":"{name}","url":"{url}",'
        f'"offers":{{"@type":"Offer","price":{price},"priceCurrency":"RUB"}}}}}}'
        for name, url, price in cards
    )
    return f'<script type="application/ld+json">{{"@type":"ItemList","itemListElement":[{items}]}}</script>'


CATALOG_HITS = {
    "компьютеры купить цена": [
        ("https://market.ru/category/pc", "Компьютеры", ""),
        ("https://market.ru/category/desktops", "Системные блоки", ""),
        ("https://market.ru/card/office-3", "ПК Office 3", ""),
    ]
}

CATALOG_PAGES = {
    "https://market.ru/category/pc": catalog_page(
        [
            ("ПК Office 1", "/card/office-1", 39483),
            ("ПК Gamer", "/card/gamer?utm_source=list", 53282),
            ("Рабочая станция", "/card/station", 120000),
            ("Реклама партнёра", "https://ads.example.com/pc", 1000),
        ]
    ),
    "https://market.ru/category/desktops": catalog_page(
        [
            ("ПК Office 1", "/card/office-1", 39483),
            ("ПК gamer", "https://market.ru/card/gamer-2", 51000),
            ("ПК Office 3", "/card/office-3", 45000),
        ]
    ),
    "https://market.ru/card/office-3": product_page("45000"),
}


def test_catalog_pages_become_cards_with_own_urls():
    searcher = ProductSearcher(SETTINGS, FakeSearch(CATALOG_HITS), FakeFetcher(CATALOG_PAGES), FakeLlm([], [], True, True))

    result = asyncio.run(searcher.run("компьютеры", Decimal(80_000)))

    urls = [offer.url for offer in result.offers]
    assert not any("/category/" in url for url in urls)
    assert sorted(urls) == [
        "https://market.ru/card/gamer-2",
        "https://market.ru/card/office-1",
        "https://market.ru/card/office-3",
    ]
    by_url = {offer.url: offer for offer in result.offers}
    assert by_url["https://market.ru/card/office-1"].price_source == "catalog"
    assert by_url["https://market.ru/card/office-3"].price_source == "structured"
    assert by_url["https://market.ru/card/gamer-2"].price_rub == Decimal("51000")
    assert [offer.url for offer in result.over_budget] == ["https://market.ru/card/station"]
    assert result.stats.catalogs == 2
    assert result.stats.listed == 4
    assert result.stats.duplicates == 3


def test_catalog_without_linked_cards_gives_nothing():
    hits = {Q1: [("https://shop.ru/catalog", "Каталог", "Цены от 25 000 ₽")]}
    pages = {
        "https://shop.ru/catalog": """
        <div itemscope itemtype="http://schema.org/Product"><span itemprop="price">25000</span></div>
        <div itemscope itemtype="http://schema.org/Product"><span itemprop="price">31000</span></div>
        <p>Цены от 25 000 ₽</p>"""
    }
    llm = FakeLlm([Q1], [verdict(0, price=25000)])
    result = run(ProductSearcher(SETTINGS, FakeSearch(hits), FakeFetcher(pages), llm))
    assert result.offers == []
    assert result.stats.catalogs == 1


def test_markup_name_wins_over_the_model_name():
    search = FakeSearch({Q1: [("https://shop.ru/p", "Витрина", "")]})
    fetcher = FakeFetcher({"https://shop.ru/p": product_page("200000")})
    llm = FakeLlm([Q1], [verdict(0, name="Витрина Polair ШХ-0,7 (придумано)")])
    result = run(ProductSearcher(SETTINGS, search, fetcher, llm))
    assert result.offers[0].name == "Витрина"


def test_catalog_cards_get_a_light_check_not_the_full_page_review():
    hits = {
        "компьютер купить": [
            ("https://market.ru/category/pc", "Компьютеры", ""),
            ("https://shop.ru/pc-1", "ПК в магазине", "Цена 41 000 ₽"),
        ]
    }
    pages = {
        "https://market.ru/category/pc": catalog_page(
            [("ПК Office 1", "/card/office-1", 39483), ("Мышь беспроводная", "/card/mouse", 900), ("ПК Gamer", "/card/gamer", 53282)]
        )
    }
    llm = FakeLlm(["компьютер купить"], [verdict(3, price=41000, name="ПК")], irrelevant_cards={1})
    searcher = ProductSearcher(SETTINGS, FakeSearch(hits), FakeFetcher(pages), llm)

    result = asyncio.run(searcher.run("компьютер", Decimal(80_000)))

    assert llm.calls == [("plan", []), ("judge", [3]), ("cards", [0, 1, 2])]
    assert sorted(offer.url for offer in result.offers) == [
        "https://market.ru/card/gamer",
        "https://market.ru/card/office-1",
        "https://shop.ru/pc-1",
    ]
    card = next(offer for offer in result.offers if offer.url.endswith("office-1"))
    assert card.name == "ПК Office 1"
    assert card.price_source == "catalog"
    assert card.relevance == 3
    assert "market.ru" in card.reason


def test_loan_purpose_reaches_both_model_checks():
    hits = {
        "зерноуборочный комбайн купить": [
            ("https://market.ru/category/combines", "Комбайны", ""),
            ("https://agro.ru/combine-1", "Комбайн Акрос", "Цена 1 450 000 ₽"),
        ]
    }
    pages = {
        "https://market.ru/category/combines": catalog_page(
            [("Кухонный комбайн Bosch", "/card/kitchen", 27316), ("Комбайн зерноуборочный Нива", "/card/niva", 1400000)]
        )
    }
    llm = FakeLlm(["зерноуборочный комбайн купить"], [verdict(2, price=1450000)], irrelevant_cards={0})
    searcher = ProductSearcher(SETTINGS, FakeSearch(hits), FakeFetcher(pages), llm)

    result = asyncio.run(searcher.run("зерноуборочный комбайн", Decimal(1_500_000), "уборка подсолнечника на своих полях"))

    assert [kind for kind, _ in llm.calls] == ["plan", "judge", "cards"]
    assert all("Цель покупки: уборка подсолнечника на своих полях" in prompt for prompt in llm.prompts)
    assert sorted(offer.url for offer in result.offers) == ["https://agro.ru/combine-1", "https://market.ru/card/niva"]


def test_prompts_have_no_purpose_line_without_a_purpose():
    hits = {Q1: [("https://shop.ru/p", "Витрина", "")]}
    llm = FakeLlm([Q1], [verdict(0)])
    asyncio.run(
        ProductSearcher(SETTINGS, FakeSearch(hits), FakeFetcher({"https://shop.ru/p": product_page("1000")}), llm).run(
            "холодильная витрина", Decimal(500_000)
        )
    )
    assert llm.prompts and not any("Цель покупки" in prompt for prompt in llm.prompts)


def test_model_queries_that_change_the_product_or_add_a_floor_are_dropped():
    llm = FakeLlm(
        [
            "ноутбук для работы купить",
            "холодильная витрина купить от 100000 рублей",
            "холодильная витрина 50000-80000 рублей",
            "холодильник купить",
            "покупка холодильной витрины в кредит",
            "холодильная витрина в рассрочку",
            "холодильная витрина лизинг",
            "витрина холодильная цена до 500000 рублей",
        ],
        [],
    )
    search = FakeSearch({})
    result = run(ProductSearcher(SETTINGS, search, FakeFetcher({}), llm))
    assert result.queries == ["витрина холодильная цена до 500000 рублей"]
    rejected = next(warning for warning in result.warnings if "Отброшены" in warning)
    assert "ноутбук" in rejected and "в кредит" in rejected and "рассрочку" in rejected and "лизинг" in rejected

    only_bad = FakeLlm(["ноутбук купить", "витрина от 1000 рублей"], [])
    result = run(ProductSearcher(SETTINGS, FakeSearch({}), FakeFetcher({}), only_bad))
    assert result.queries == ["холодильная витрина купить цена"]


def test_canonical_url_drops_tracking_and_fragment():
    assert canonical_url("https://Shop.ru/item?id=5&utm_source=ya&yclid=1#reviews") == "https://shop.ru/item?id=5"


def test_rejects_bad_input():
    searcher = ProductSearcher(SETTINGS, FakeSearch({}), FakeFetcher({}), FakeLlm([], []))
    for keywords, budget in (("  ", 100), ("витрина", 0)):
        try:
            asyncio.run(searcher.run(keywords, Decimal(budget)))
        except ValueError:
            continue
        raise AssertionError("expected ValueError")
