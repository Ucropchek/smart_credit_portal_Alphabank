from __future__ import annotations

import json
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Literal, Protocol

import psycopg
from psycopg.rows import dict_row

Status = Literal["queued", "running", "done", "failed", "no_categories"]
UNFINISHED: tuple[Status, ...] = ("queued", "running")


@dataclass(frozen=True)
class GoodsJob:
    application_id: int
    amount: Decimal
    categories: list[dict[str, Any]]
    status: Status
    results: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class GoodsStore(Protocol):
    async def ensure(self) -> None: ...

    async def accept(self, application_id: int, amount: Decimal, categories: list[dict[str, Any]]) -> tuple[GoodsJob, bool]:
        ...

    async def save(self, job: GoodsJob) -> None: ...

    async def get(self, application_id: int) -> GoodsJob | None: ...

    async def unfinished(self) -> list[GoodsJob]: ...


def _initial_status(categories: list[dict[str, Any]]) -> Status:
    return "queued" if categories else "no_categories"


def _must_restart(existing: GoodsJob) -> bool:
    return existing.status == "failed"


class MemoryGoodsStore:
    def __init__(self) -> None:
        self.jobs: dict[int, GoodsJob] = {}

    async def ensure(self) -> None:
        return None

    async def accept(self, application_id, amount, categories):
        existing = self.jobs.get(application_id)
        if existing is not None and not _must_restart(existing):
            return existing, False
        job = GoodsJob(application_id, amount, categories, _initial_status(categories))
        self.jobs[application_id] = job
        return job, job.status == "queued"

    async def save(self, job):
        self.jobs[job.application_id] = replace(job, updated_at=datetime.now(timezone.utc))

    async def get(self, application_id):
        return self.jobs.get(application_id)

    async def unfinished(self):
        return [job for job in self.jobs.values() if job.status in UNFINISHED]


_DDL = """
create schema if not exists ml;

create table if not exists ml.goods_searches (
    application_id bigint primary key,
    amount numeric(15, 2) not null,
    categories jsonb not null,
    status text not null,
    results jsonb not null default '[]'::jsonb,
    error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint ck_goods_searches_amount check (amount > 0),
    constraint ck_goods_searches_status check (status in ('queued', 'running', 'done', 'failed', 'no_categories'))
);
"""


class PostgresGoodsStore:
    def __init__(self, conninfo: dict[str, str]) -> None:
        self.conninfo = conninfo

    async def _connect(self) -> psycopg.AsyncConnection:
        return await psycopg.AsyncConnection.connect(**self.conninfo, autocommit=True, row_factory=dict_row)

    async def ensure(self) -> None:
        async with await self._connect() as connection:
            await connection.execute(_DDL)

    async def accept(self, application_id, amount, categories):
        status = _initial_status(categories)
        async with await self._connect() as connection:
            row = await (
                await connection.execute(
                    """
                    insert into ml.goods_searches (application_id, amount, categories, status)
                    values (%(id)s, %(amount)s, %(categories)s, %(status)s)
                    on conflict (application_id) do update
                        set amount = excluded.amount,
                            categories = excluded.categories,
                            status = excluded.status,
                            results = '[]'::jsonb,
                            error = null,
                            updated_at = now()
                        where ml.goods_searches.status = 'failed'
                    returning *
                    """,
                    {"id": application_id, "amount": amount, "categories": json.dumps(categories, ensure_ascii=False), "status": status},
                )
            ).fetchone()
            if row is None:
                existing = await self.get(application_id)
                assert existing is not None
                return existing, False
            return _job(row), row["status"] == "queued"

    async def save(self, job):
        async with await self._connect() as connection:
            await connection.execute(
                """
                update ml.goods_searches
                set status = %(status)s, results = %(results)s, error = %(error)s, updated_at = now()
                where application_id = %(id)s
                """,
                {
                    "id": job.application_id,
                    "status": job.status,
                    "results": json.dumps(job.results, ensure_ascii=False),
                    "error": job.error,
                },
            )

    async def get(self, application_id):
        async with await self._connect() as connection:
            row = await (
                await connection.execute("select * from ml.goods_searches where application_id = %s", (application_id,))
            ).fetchone()
        return _job(row) if row else None

    async def unfinished(self):
        async with await self._connect() as connection:
            rows = await (
                await connection.execute(
                    "select * from ml.goods_searches where status = any(%s) order by created_at", (list(UNFINISHED),)
                )
            ).fetchall()
        return [_job(row) for row in rows]


def _job(row: dict[str, Any]) -> GoodsJob:
    return GoodsJob(
        application_id=row["application_id"],
        amount=row["amount"],
        categories=row["categories"],
        status=row["status"],
        results=row["results"],
        error=row["error"],
        updated_at=row["updated_at"],
    )
