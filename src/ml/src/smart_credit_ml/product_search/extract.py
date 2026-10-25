from __future__ import annotations

import json
import re
from decimal import Decimal, InvalidOperation
from html.parser import HTMLParser
from typing import Any

from smart_credit_ml.product_search.models import ListedProduct, PageFacts

_SKIP_TEXT = {"script", "style", "noscript", "svg", "template", "head"}
_SPACES = re.compile(r"[\s   ]+")
_PRICE_NUMBER = re.compile(r"\d[\d\s   ]*(?:[.,]\d{1,2})?")
_RUB = {"RUB", "RUR", "₽", "РУБ", "Р"}


def parse_price(value: Any) -> Decimal | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float, Decimal)):
        number = Decimal(str(value))
        return number if number > 0 else None
    match = _PRICE_NUMBER.search(str(value))
    if not match:
        return None
    raw = _SPACES.sub("", match.group(0)).replace(",", ".")
    try:
        number = Decimal(raw)
    except InvalidOperation:
        return None
    return number if number > 0 else None


def is_rub(currency: str | None) -> bool:
    return currency is None or currency.strip().upper() in _RUB


def compact_digits(text: str) -> str:
    return _SPACES.sub("", text)


class _PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title: str | None = None
        self.json_ld: list[str] = []
        self.meta: dict[str, str] = {}
        self.itemprop: dict[str, str] = {}
        self.text: list[str] = []
        self._stack: list[str] = []
        self._in_ld = False
        self._in_title = False
        self._ld_buffer: list[str] = []
        self._itemprop_open: str | None = None
        self.microdata_products = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {name: value or "" for name, value in attrs}
        if "schema.org/product" in values.get("itemtype", "").lower():
            self.microdata_products += 1
        if tag == "script" and values.get("type", "").lower() == "application/ld+json":
            self._in_ld = True
            self._ld_buffer = []
        if tag == "title":
            self._in_title = True
        if tag == "meta":
            key = (values.get("property") or values.get("name") or values.get("itemprop") or "").lower()
            if key and "content" in values:
                self.meta.setdefault(key, values["content"])
        prop = values.get("itemprop", "").lower()
        if prop in {"price", "pricecurrency", "name"}:
            content = values.get("content")
            if content:
                self.itemprop.setdefault(prop, content)
            elif tag != "meta":
                self._itemprop_open = prop
        if tag not in {"meta", "link", "br", "img", "input", "hr", "source"}:
            self._stack.append(tag)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._in_ld:
            self.json_ld.append("".join(self._ld_buffer))
            self._in_ld = False
        if tag == "title":
            self._in_title = False
        if tag in self._stack:
            while self._stack and self._stack.pop() != tag:
                pass

    def handle_data(self, data: str) -> None:
        if self._in_ld:
            self._ld_buffer.append(data)
            return
        if self._in_title:
            self.title = (self.title or "") + data
            return
        if self._itemprop_open and data.strip():
            self.itemprop.setdefault(self._itemprop_open, data.strip())
            self._itemprop_open = None
        if not any(tag in _SKIP_TEXT for tag in self._stack) and data.strip():
            self.text.append(data.strip())


def _types(node: dict[str, Any]) -> set[str]:
    kind = node.get("@type")
    kinds = kind if isinstance(kind, list) else [kind]
    return {str(item).lower() for item in kinds if item}


def _walk(node: Any):
    if isinstance(node, list):
        for item in node:
            yield from _walk(item)
    elif isinstance(node, dict):
        yield node
        for value in node.values():
            if isinstance(value, (list, dict)):
                yield from _walk(value)


def _offer_price(offers: Any) -> tuple[Decimal | None, str | None]:
    best: tuple[Decimal | None, str | None] = (None, None)
    for node in _walk(offers):
        kinds = _types(node)
        if kinds and not kinds & {"offer", "aggregateoffer"}:
            continue
        price = parse_price(node.get("price") or node.get("lowPrice"))
        if price is None:
            spec = node.get("priceSpecification")
            if isinstance(spec, dict):
                price = parse_price(spec.get("price"))
        currency = node.get("priceCurrency")
        if price is not None and (best[0] is None or price < best[0]):
            best = (price, str(currency) if currency else None)
    return best


def _json_ld_products(blocks: list[str]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    own: list[dict[str, Any]] = []
    listed: list[dict[str, Any]] = []

    def visit(node: Any, in_list: bool, in_product: bool) -> None:
        if isinstance(node, list):
            for item in node:
                visit(item, in_list, in_product)
            return
        if not isinstance(node, dict):
            return
        kinds = _types(node)
        if "product" in kinds:
            if not in_product:
                (listed if in_list else own).append(node)
            for value in node.values():
                visit(value, in_list, True)
            return
        for value in node.values():
            visit(value, in_list or "itemlist" in kinds, in_product)

    for block in blocks:
        try:
            visit(json.loads(block.strip()), False, False)
        except (json.JSONDecodeError, ValueError):
            continue
    return own, listed


def _product_url(node: dict[str, Any]) -> str | None:
    for key in ("url", "@id"):
        value = node.get(key)
        if isinstance(value, str) and value.strip() and not value.startswith("#"):
            return value.strip()
    return None


def _listed(nodes: list[dict[str, Any]]) -> tuple[ListedProduct, ...]:
    cards: list[ListedProduct] = []
    for node in nodes:
        url = _product_url(node)
        name = node.get("name")
        price, currency = _offer_price(node.get("offers"))
        if url and name and price is not None:
            cards.append(ListedProduct(_SPACES.sub(" ", str(name)).strip(), url, price, currency))
    return tuple(cards)


def extract_page(html: str, text_limit: int = 4000) -> PageFacts:
    parser = _PageParser()
    try:
        parser.feed(html)
        parser.close()
    except Exception:
        pass

    own, listed = _json_ld_products(parser.json_ld)
    distinct_own = {(_product_url(node), str(node.get("name") or "")) for node in own}
    catalog_nodes = listed if len(listed) >= 2 else own if len(distinct_own) >= 2 else []
    is_catalog = bool(catalog_nodes) or parser.microdata_products >= 2

    text = " ".join(parser.text)
    title = _SPACES.sub(" ", parser.title).strip() if parser.title else None
    if is_catalog:
        return PageFacts(
            title=title,
            text=_SPACES.sub(" ", text)[:text_limit],
            is_catalog=True,
            listed=_listed(catalog_nodes),
        )

    name: str | None = None
    price: Decimal | None = None
    currency: str | None = None
    if own:
        price, currency = _offer_price(own[0].get("offers"))
        raw_name = own[0].get("name")
        name = str(raw_name).strip() if raw_name else None

    if price is None:
        price = parse_price(parser.itemprop.get("price"))
        currency = parser.itemprop.get("pricecurrency")
    if price is None:
        for key in ("product:price:amount", "og:price:amount"):
            price = parse_price(parser.meta.get(key))
            if price is not None:
                currency = parser.meta.get(key.replace("amount", "currency"))
                break
    if not name:
        name = parser.itemprop.get("name") or parser.meta.get("og:title")

    return PageFacts(
        title=title,
        product_name=name,
        price=price,
        currency=currency,
        text=_SPACES.sub(" ", text)[:text_limit],
    )
