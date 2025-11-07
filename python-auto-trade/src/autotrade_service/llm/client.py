from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Any, Mapping

import httpx

from ..config import get_settings


class DeepSeekError(RuntimeError):
    """Raised when the DeepSeek API responds with an error or invalid payload."""


@dataclass(slots=True)
class DeepSeekClientConfig:
    base_url: str
    model: str
    timeout_seconds: float
    max_retries: int
    backoff_seconds: float
    backoff_max_seconds: float


@dataclass(slots=True)
class DeepSeekResponse:
    prompt: str
    system_prompt: str | None
    raw_response: Mapping[str, Any]
    content: str
    parsed_json: Any | None
    latency_ms: float
    retry_count: int


class AsyncDeepSeekClient:
    """
    Minimal DeepSeek chat completion client with retry/backoff and JSON enforcement.
    """

    def __init__(
        self,
        *,
        config: DeepSeekClientConfig | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        settings = get_settings()
        if config:
            self._config = config
        else:
            self._config = DeepSeekClientConfig(
                base_url=settings.deepseek_base_url,
                model=settings.deepseek_model,
                timeout_seconds=settings.deepseek_timeout_seconds,
                max_retries=settings.deepseek_max_retries,
                backoff_seconds=settings.deepseek_backoff_seconds,
                backoff_max_seconds=settings.deepseek_backoff_max_seconds,
            )
        headers = {
            "Authorization": f"Bearer {settings.deepseek_api_key}",
            "Content-Type": "application/json",
        }
        timeout = httpx.Timeout(self._config.timeout_seconds)
        self._client = http_client or httpx.AsyncClient(
            base_url=self._config.base_url,
            headers=headers,
            timeout=timeout,
        )
        self._logger = logging.getLogger("autotrade.llm.deepseek")

    async def close(self) -> None:
        await self._client.aclose()

    async def generate_completion(
        self,
        *,
        prompt: str,
        system_prompt: str | None = None,
        response_format: Mapping[str, Any] | None = None,
        temperature: float = 0.2,
        top_p: float = 0.95,
    ) -> DeepSeekResponse:
        if not prompt:
            raise DeepSeekError("Prompt must be non-empty")

        payload: dict[str, Any] = {
            "model": self._config.model,
            "messages": [
                {"role": "system", "content": system_prompt or "You are an autonomy trading assistant."},
                {"role": "user", "content": prompt},
            ],
            "temperature": temperature,
            "top_p": top_p,
        }
        if response_format:
            payload["response_format"] = response_format

        attempt = 0
        backoff = self._config.backoff_seconds
        start = asyncio.get_event_loop().time()
        last_exception: Exception | None = None
        while attempt <= self._config.max_retries:
            try:
                response = await self._client.post("/chat/completions", json=payload)
                latency_ms = (asyncio.get_event_loop().time() - start) * 1000
                if response.status_code >= 500:
                    raise DeepSeekError(f"DeepSeek server error {response.status_code}: {response.text}")
                if response.status_code >= 400:
                    raise DeepSeekError(
                        f"DeepSeek request error {response.status_code}: {response.text}"
                    )
                data = response.json()
                content = self._extract_content(data)
                # Only parse JSON if response_format was specified
                parsed = self._parse_json(content) if response_format else None
                return DeepSeekResponse(
                    prompt=prompt,
                    system_prompt=system_prompt,
                    raw_response=data,
                    content=content,
                    parsed_json=parsed,
                    latency_ms=latency_ms,
                    retry_count=attempt,
                )
            except (httpx.TimeoutException, httpx.TransportError, DeepSeekError, json.JSONDecodeError) as exc:
                last_exception = exc
                attempt += 1
                if attempt > self._config.max_retries:
                    break
                sleep_seconds = min(backoff, self._config.backoff_max_seconds)
                self._logger.warning(
                    "DeepSeek request failed (attempt %s/%s): %s; retrying in %.2fs",
                    attempt,
                    self._config.max_retries,
                    exc,
                    sleep_seconds,
                )
                await asyncio.sleep(sleep_seconds)
                backoff *= 2
        raise DeepSeekError(f"DeepSeek completion failed after retries: {last_exception}") from last_exception

    @staticmethod
    def _extract_content(data: Mapping[str, Any]) -> str:
        choices = data.get("choices")
        if not choices:
            raise DeepSeekError("DeepSeek response missing choices")
        message = choices[0].get("message")
        if not message or "content" not in message:
            raise DeepSeekError("DeepSeek response missing message content")
        return str(message["content"])

    @staticmethod
    def _parse_json(content: str) -> Any | None:
        if not content:
            return None
        content = content.strip()
        if not content:
            return None
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            raise DeepSeekError("DeepSeek response was not valid JSON")
