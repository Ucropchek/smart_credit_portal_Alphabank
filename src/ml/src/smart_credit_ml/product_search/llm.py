from __future__ import annotations

import json
from typing import Any, Protocol

import httpx


class LlmError(RuntimeError):
    pass


class JsonLlm(Protocol):
    async def ask_json(self, system: str, user: str, schema: dict[str, Any]) -> dict[str, Any]: ...


class OllamaLlm:
    def __init__(self, base_url: str, model: str, client: httpx.AsyncClient, timeout: float) -> None:
        self.base_url = base_url
        self.model = model
        self.client = client
        self.timeout = timeout

    async def ask_json(self, system: str, user: str, schema: dict[str, Any]) -> dict[str, Any]:
        try:
            response = await self.client.post(
                f"{self.base_url}/api/chat",
                json={
                    "model": self.model,
                    "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                    "format": schema,
                    "think": False,
                    "stream": False,
                    "options": {"temperature": 0},
                },
                timeout=self.timeout,
            )
            response.raise_for_status()
            content = response.json()["message"]["content"]
            answer = json.loads(content)
        except (httpx.HTTPError, KeyError, TypeError, json.JSONDecodeError) as error:
            raise LlmError(f"{self.model}: {error}") from error
        if not isinstance(answer, dict):
            raise LlmError(f"{self.model}: answer is not a JSON object")
        return answer
