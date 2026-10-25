from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from smart_credit_ml.product_search.config import SearchSettings
from smart_credit_ml.product_search.llm import OllamaLlm
from smart_credit_ml.product_search.models import Offer, ProductSearchResult
from smart_credit_ml.product_search.pipeline import ProductSearcher
from smart_credit_ml.product_search.web import HttpPageFetcher, SearxngSearch, make_client

__all__ = ["Offer", "ProductSearchResult", "ProductSearcher", "SearchSettings", "open_searcher"]


@asynccontextmanager
async def open_searcher(settings: SearchSettings | None = None) -> AsyncIterator[ProductSearcher]:
    settings = settings or SearchSettings.from_env()
    async with make_client(settings.fetch_timeout) as client:
        yield ProductSearcher(
            settings,
            search=SearxngSearch(settings.searxng_url, client),
            fetcher=HttpPageFetcher(client, settings.fetch_max_bytes),
            llm=OllamaLlm(settings.ollama_url, settings.llm_model, client, settings.llm_timeout),
        )
