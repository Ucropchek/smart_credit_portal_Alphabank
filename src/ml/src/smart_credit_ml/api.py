from __future__ import annotations

import os
from contextlib import AbstractAsyncContextManager, AsyncExitStack, asynccontextmanager
from dataclasses import dataclass
from decimal import Decimal
from typing import AsyncIterator, Callable

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from smart_credit_ml.goods_store import GoodsJob, GoodsStore, MemoryGoodsStore, PostgresGoodsStore
from smart_credit_ml.goods_worker import GoodsWorker, Searcher
from smart_credit_ml.main import database_settings
from smart_credit_ml.product_search import open_searcher
from smart_credit_ml.product_search.serialize import result_json


@dataclass
class Services:
    searcher: Searcher
    store: GoodsStore
    worker: GoodsWorker


@asynccontextmanager
async def default_services() -> AsyncIterator[Services]:
    async with AsyncExitStack() as stack:
        searcher = await stack.enter_async_context(open_searcher())
        store: GoodsStore = (
            MemoryGoodsStore() if os.environ.get("ML_GOODS_STORE") == "memory" else PostgresGoodsStore(database_settings())
        )
        yield Services(
            searcher,
            store,
            GoodsWorker(store, searcher, max_categories=int(os.environ.get("ML_HANDOFF_MAX_CATEGORIES", "3"))),
        )


class Match(BaseModel):
    code: str = Field(max_length=40)
    title: str = Field(max_length=200)
    keywords: list[str] = Field(default_factory=list, max_length=50)


class Category(BaseModel):
    matches: list[Match] = Field(default_factory=list, max_length=50)


class HandoffRequest(BaseModel):
    applicationId: int = Field(gt=0)
    amount: Decimal = Field(gt=0, max_digits=15, decimal_places=2)
    category: Category = Field(default_factory=Category)


class ProductSearchRequest(BaseModel):
    keywords: str = Field(min_length=2, max_length=200, examples=["холодильная витрина"])
    budgetRub: Decimal = Field(gt=0, max_digits=15, decimal_places=2, examples=[1_500_000])
    purpose: str | None = Field(default=None, max_length=500, examples=["Покупка оборудования"])
    maxResults: int = Field(default=10, ge=1, le=30)


def job_json(job: GoodsJob) -> dict:
    return {
        "applicationId": job.application_id,
        "amount": float(job.amount),
        "status": job.status,
        "categories": job.categories,
        "results": job.results,
        "error": job.error,
        "updatedAt": job.updated_at.isoformat(),
    }


def create_app(services: Callable[[], AbstractAsyncContextManager[Services]] = default_services) -> FastAPI:
    state: dict[str, Services] = {}

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        async with services() as ready:
            await ready.store.ensure()
            await ready.worker.start()
            state["services"] = ready
            try:
                yield
            finally:
                await ready.worker.stop()
                state.clear()

    app = FastAPI(title="smart-credit-ml", version="0.2.0", lifespan=lifespan)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/", status_code=202)
    async def handoff(request: HandoffRequest) -> JSONResponse:
        ready = state["services"]
        categories = [match.model_dump() for match in request.category.matches]
        job, queue = await ready.store.accept(request.applicationId, request.amount, categories)
        if queue:
            ready.worker.enqueue(job.application_id)
        return JSONResponse(
            status_code=202,
            content={
                "applicationId": job.application_id,
                "status": job.status,
                "results": f"/applications/{job.application_id}/goods",
            },
        )

    @app.get("/applications/{application_id}/goods")
    async def goods(application_id: int) -> dict:
        job = await state["services"].store.get(application_id)
        if job is None:
            raise HTTPException(status_code=404, detail="no goods search for this application")
        return job_json(job)

    @app.post("/product-search")
    async def product_search(request: ProductSearchRequest) -> dict:
        result = await state["services"].searcher.run(
            request.keywords, request.budgetRub, request.purpose, request.maxResults
        )
        return result_json(result)

    return app


app = create_app()
