from __future__ import annotations

import asyncio
import ipaddress
import socket
from typing import Protocol
from urllib.parse import urljoin, urlsplit

import httpx

from smart_credit_ml.product_search.models import SearchHit

USER_AGENT = "SmartCreditPortal-ProductSearch/0.1 (+hackathon prototype)"


class WebSearch(Protocol):
    async def search(self, query: str, limit: int) -> list[SearchHit]: ...


class PageFetcher(Protocol):
    async def fetch(self, url: str) -> str | None: ...


class SearxngSearch:
    def __init__(self, base_url: str, client: httpx.AsyncClient) -> None:
        self.base_url = base_url
        self.client = client

    async def search(self, query: str, limit: int) -> list[SearchHit]:
        response = await self.client.get(
            f"{self.base_url}/search",
            params={"q": query, "format": "json", "language": "ru-RU", "categories": "general", "safesearch": 1},
        )
        response.raise_for_status()
        hits: list[SearchHit] = []
        for item in response.json().get("results", []):
            url = item.get("url")
            if not isinstance(url, str) or urlsplit(url).scheme not in {"http", "https"}:
                continue
            hits.append(
                SearchHit(url=url, title=str(item.get("title") or ""), snippet=str(item.get("content") or ""), query=query)
            )
            if len(hits) >= limit:
                break
        return hits


async def is_public_host(host: str) -> bool:
    if not host or host.lower() in {"localhost", "localhost.localdomain"} or host.lower().endswith(".local"):
        return False
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return False
    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if not address.is_global:
            return False
    return True


class HttpPageFetcher:
    def __init__(self, client: httpx.AsyncClient, max_bytes: int, max_redirects: int = 3) -> None:
        self.client = client
        self.max_bytes = max_bytes
        self.max_redirects = max_redirects

    async def fetch(self, url: str) -> str | None:
        current = url
        for _ in range(self.max_redirects + 1):
            parts = urlsplit(current)
            if parts.scheme not in {"http", "https"} or not await is_public_host(parts.hostname or ""):
                return None
            try:
                async with self.client.stream("GET", current, follow_redirects=False) as response:
                    if response.is_redirect:
                        location = response.headers.get("location")
                        if not location:
                            return None
                        current = urljoin(current, location)
                        continue
                    if response.status_code != 200:
                        return None
                    if "html" not in response.headers.get("content-type", "html").lower():
                        return None
                    body = bytearray()
                    async for chunk in response.aiter_bytes():
                        body.extend(chunk)
                        if len(body) >= self.max_bytes:
                            break
                    return body.decode(response.encoding or "utf-8", errors="replace")
            except httpx.HTTPError:
                return None
        return None


def make_client(timeout: float) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=timeout,
        headers={"User-Agent": USER_AGENT, "Accept-Language": "ru-RU,ru;q=0.9"},
    )
