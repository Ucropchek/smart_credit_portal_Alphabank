import asyncio
import time
from contextlib import asynccontextmanager
from decimal import Decimal

from fastapi.testclient import TestClient

from smart_credit_ml.api import Services, create_app
from smart_credit_ml.goods_store import MemoryGoodsStore
from smart_credit_ml.goods_worker import GoodsWorker
from smart_credit_ml.product_search.models import Offer, ProductSearchResult, SearchStats

BACKEND_BODY = {
    "applicationId": 42,
    "amount": 500000.0,
    "category": {
        "matches": [
            {"code": "laptop", "title": "Ноутбук", "keywords": ["ноутбук"]},
            {"code": "mfu", "title": "МФУ", "keywords": ["мфу"]},
        ]
    },
}


class FakeSearcher:
    def __init__(self, delay=0.0, fail_on=(), engine_down=False):
        self.delay = delay
        self.fail_on = set(fail_on)
        self.engine_down = engine_down
        self.calls = []

    async def run(self, keywords, budget_rub, purpose=None, max_results=10):
        self.calls.append((keywords, budget_rub))
        await asyncio.sleep(self.delay)
        if keywords in self.fail_on:
            raise RuntimeError("search engine down")
        if self.engine_down:
            return ProductSearchResult(keywords, budget_rub, [keywords], [], [], SearchStats(), search_unavailable=True)
        offer = Offer(f"{keywords} X", f"https://shop.ru/{keywords}", "shop.ru", Decimal("45000"), "catalog", 3, "", keywords)
        return ProductSearchResult(keywords, budget_rub, [keywords], [offer], [], SearchStats())


def make_client(searcher, store=None):
    store = store or MemoryGoodsStore()

    @asynccontextmanager
    async def services():
        yield Services(searcher, store, GoodsWorker(store, searcher))

    return TestClient(create_app(services)), store


def wait_for(client, application_id, statuses=("done", "failed"), timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        body = client.get(f"/applications/{application_id}/goods").json()
        if body.get("status") in statuses:
            return body
        time.sleep(0.02)
    raise AssertionError(f"job {application_id} did not finish: {body}")


def test_backend_handoff_is_accepted_fast_and_searched_in_background():
    searcher = FakeSearcher(delay=0.3)
    client, _ = make_client(searcher)
    with client:
        started = time.monotonic()
        response = client.post("/", json=BACKEND_BODY)
        assert time.monotonic() - started < 0.25
        assert response.status_code == 202
        assert response.json() == {"applicationId": 42, "status": "queued", "results": "/applications/42/goods"}

        body = wait_for(client, 42)

    assert body["status"] == "done"
    assert body["amount"] == 500000.0
    assert [entry["code"] for entry in body["results"]] == ["laptop", "mfu"]
    assert body["results"][0]["search"]["offers"][0]["url"] == "https://shop.ru/Ноутбук"
    assert searcher.calls == [("Ноутбук", Decimal("500000.0")), ("МФУ", Decimal("500000.0"))]


def test_repeated_handoff_does_not_search_twice():
    searcher = FakeSearcher()
    client, _ = make_client(searcher)
    with client:
        client.post("/", json=BACKEND_BODY)
        wait_for(client, 42)
        again = client.post("/", json=BACKEND_BODY)
        assert again.status_code == 202
        assert again.json()["status"] == "done"
    assert len(searcher.calls) == 2


def test_no_matched_categories_is_stored_without_search():
    searcher = FakeSearcher()
    client, _ = make_client(searcher)
    with client:
        response = client.post("/", json={"applicationId": 7, "amount": 100000, "category": {"matches": []}})
        assert response.status_code == 202
        assert response.json()["status"] == "no_categories"
        assert client.get("/applications/7/goods").json()["status"] == "no_categories"
    assert searcher.calls == []


def test_one_failed_category_keeps_the_other_and_full_failure_can_be_retried():
    client, store = make_client(FakeSearcher(fail_on={"МФУ"}))
    with client:
        client.post("/", json=BACKEND_BODY)
        body = wait_for(client, 42)
    assert body["status"] == "done"
    assert "search" in body["results"][0]
    assert body["results"][1]["error"] == "RuntimeError: search engine down"

    failing = FakeSearcher(fail_on={"Ноутбук", "МФУ"})
    client, store = make_client(failing)
    with client:
        client.post("/", json=BACKEND_BODY)
        assert wait_for(client, 42)["status"] == "failed"
        failing.fail_on.clear()
        assert client.post("/", json=BACKEND_BODY).json()["status"] == "queued"
        assert wait_for(client, 42)["status"] == "done"


def test_unreachable_search_engine_fails_the_job_instead_of_an_empty_done():
    client, _ = make_client(FakeSearcher(engine_down=True))
    with client:
        client.post("/", json=BACKEND_BODY)
        body = wait_for(client, 42)
    assert body["status"] == "failed"
    assert body["results"][0]["error"].startswith("Поисковик недоступен")


def test_unfinished_jobs_restart_with_the_service():
    store = MemoryGoodsStore()
    asyncio.run(store.accept(9, Decimal("80000"), [{"code": "desktop-computer", "title": "Настольный компьютер", "keywords": ["компьютер"]}]))
    searcher = FakeSearcher()
    client, _ = make_client(searcher, store)
    with client:
        assert wait_for(client, 9)["status"] == "done"
    assert searcher.calls == [("Настольный компьютер", Decimal("80000"))]


def test_bad_handoff_and_unknown_application():
    client, _ = make_client(FakeSearcher())
    with client:
        assert client.post("/", json={"applicationId": 0, "amount": 1}).status_code == 422
        assert client.post("/", json={"applicationId": 1, "amount": -5}).status_code == 422
        assert client.get("/applications/404/goods").status_code == 404
