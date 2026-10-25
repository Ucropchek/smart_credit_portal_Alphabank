from __future__ import annotations

from typing import Any

from smart_credit_ml.product_search.models import Offer, ProductSearchResult


def offer_json(offer: Offer) -> dict[str, Any]:
    return {
        "name": offer.name,
        "url": offer.url,
        "domain": offer.domain,
        "priceRub": float(offer.price_rub),
        "priceSource": offer.price_source,
        "relevance": offer.relevance,
        "reason": offer.reason,
        "query": offer.query,
    }


def result_json(result: ProductSearchResult) -> dict[str, Any]:
    return {
        "keywords": result.keywords,
        "budgetRub": float(result.budget_rub),
        "queries": result.queries,
        "offers": [offer_json(offer) for offer in result.offers],
        "overBudget": [offer_json(offer) for offer in result.over_budget],
        "stats": {
            "candidates": result.stats.candidates,
            "fetched": result.stats.fetched,
            "catalogs": result.stats.catalogs,
            "listed": result.stats.listed,
            "duplicates": result.stats.duplicates,
            "notOffer": result.stats.not_offer,
            "noPrice": result.stats.no_price,
            "overBudget": result.stats.over_budget,
        },
        "warnings": result.warnings,
        "searchUnavailable": result.search_unavailable,
    }
