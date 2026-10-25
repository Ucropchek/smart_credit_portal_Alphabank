from __future__ import annotations

import os
from dataclasses import dataclass


def _int(name: str, default: int) -> int:
    value = os.environ.get(name)
    return int(value) if value else default


def _float(name: str, default: float) -> float:
    value = os.environ.get(name)
    return float(value) if value else default


@dataclass(frozen=True)
class SearchSettings:
    searxng_url: str = "http://localhost:8888"
    ollama_url: str = "http://localhost:11434"
    llm_model: str = "qwen3.5:4b"
    llm_timeout: float = 180.0
    max_queries: int = 3
    results_per_query: int = 8
    max_candidates: int = 16
    fetch_timeout: float = 8.0
    fetch_concurrency: int = 5
    fetch_max_bytes: int = 1_500_000
    judge_batch: int = 4
    card_batch: int = 20
    per_domain_limit: int = 3
    per_catalog_limit: int = 10
    max_listed: int = 40

    @classmethod
    def from_env(cls) -> SearchSettings:
        return cls(
            searxng_url=os.environ.get("ML_SEARXNG_URL", cls.searxng_url).rstrip("/"),
            ollama_url=os.environ.get("ML_OLLAMA_URL", cls.ollama_url).rstrip("/"),
            llm_model=os.environ.get("ML_LLM_MODEL", cls.llm_model),
            llm_timeout=_float("ML_LLM_TIMEOUT", cls.llm_timeout),
            max_queries=_int("ML_SEARCH_MAX_QUERIES", cls.max_queries),
            results_per_query=_int("ML_SEARCH_RESULTS_PER_QUERY", cls.results_per_query),
            max_candidates=_int("ML_SEARCH_MAX_CANDIDATES", cls.max_candidates),
            fetch_timeout=_float("ML_FETCH_TIMEOUT", cls.fetch_timeout),
            fetch_concurrency=_int("ML_FETCH_CONCURRENCY", cls.fetch_concurrency),
        )
