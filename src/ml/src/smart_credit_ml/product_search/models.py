from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Literal

PriceSource = Literal["structured", "catalog", "page_text", "snippet"]


@dataclass(frozen=True)
class SearchHit:
    url: str
    title: str
    snippet: str
    query: str


@dataclass(frozen=True)
class ListedProduct:
    name: str
    url: str
    price: Decimal
    currency: str | None


@dataclass(frozen=True)
class PageFacts:
    title: str | None = None
    product_name: str | None = None
    price: Decimal | None = None
    currency: str | None = None
    text: str = ""
    is_catalog: bool = False
    listed: tuple[ListedProduct, ...] = ()


@dataclass(frozen=True)
class Offer:
    name: str
    url: str
    domain: str
    price_rub: Decimal
    price_source: PriceSource
    relevance: int
    reason: str
    query: str


@dataclass
class SearchStats:
    candidates: int = 0
    fetched: int = 0
    catalogs: int = 0
    listed: int = 0
    duplicates: int = 0
    not_offer: int = 0
    no_price: int = 0
    over_budget: int = 0


@dataclass
class ProductSearchResult:
    keywords: str
    budget_rub: Decimal
    queries: list[str]
    offers: list[Offer]
    over_budget: list[Offer]
    stats: SearchStats
    warnings: list[str] = field(default_factory=list)
    search_unavailable: bool = False
