from __future__ import annotations

import asyncio
import logging
from dataclasses import replace
from decimal import Decimal
from typing import Any, Protocol

from smart_credit_ml.goods_store import GoodsJob, GoodsStore
from smart_credit_ml.product_search.models import ProductSearchResult
from smart_credit_ml.product_search.serialize import result_json

log = logging.getLogger(__name__)


class Searcher(Protocol):
    async def run(
        self, keywords: str, budget_rub: Decimal, purpose: str | None = None, max_results: int = 10
    ) -> ProductSearchResult: ...


class GoodsWorker:
    def __init__(self, store: GoodsStore, searcher: Searcher, max_categories: int = 3, max_results: int = 10) -> None:
        self.store = store
        self.searcher = searcher
        self.max_categories = max_categories
        self.max_results = max_results
        self.queue: asyncio.Queue[int] = asyncio.Queue()
        self._task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        for job in await self.store.unfinished():
            self.queue.put_nowait(job.application_id)
        self._task = asyncio.create_task(self._loop(), name="goods-worker")

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    def enqueue(self, application_id: int) -> None:
        self.queue.put_nowait(application_id)

    async def _loop(self) -> None:
        while True:
            application_id = await self.queue.get()
            try:
                job = await self.store.get(application_id)
                if job is not None and job.status in ("queued", "running"):
                    await self._process(job)
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("goods job %s crashed", application_id)
            finally:
                self.queue.task_done()

    async def _process(self, job: GoodsJob) -> None:
        await self.store.save(replace(job, status="running"))
        results: list[dict[str, Any]] = []
        for match in job.categories[: self.max_categories]:
            entry = {"code": match.get("code"), "title": match.get("title"), "keywords": match.get("keywords", [])}
            query = str(match.get("title") or " ".join(entry["keywords"]) or "").strip()
            try:
                result = await self.searcher.run(query, job.amount, None, self.max_results)
                entry["search"] = result_json(result)
                if result.search_unavailable:
                    entry["error"] = "Поисковик недоступен: ни один запрос не выполнился."
            except Exception as error:
                log.warning("goods job %s, category %s: %s", job.application_id, entry["code"], error)
                entry["error"] = f"{type(error).__name__}: {error}"[:500]
            results.append(entry)

        failed = bool(results) and all("error" in entry for entry in results)
        await self.store.save(
            replace(
                job,
                status="failed" if failed else "done",
                results=results,
                error="Поиск не удался ни по одной категории." if failed else None,
            )
        )
