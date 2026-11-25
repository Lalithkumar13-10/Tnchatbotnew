"""LLM gateway.

Calls go through LiteLLM to Gemini, with rate-aware rotation on TOP of LiteLLM
because Gemini's hard limits include a PER-DAY cap (RPD) that LiteLLM's Router
does not track natively — only per-minute (rpm/tpm). So this pool:

  * picks the highest-priority model in a group that is under ALL of its
    rpm / tpm / rpd limits right now,
  * tracks rolling 60-second tokens in O(1) with thread-safe locking,
  * calls it via litellm.completion(...) with a Pydantic response_format,
  * on 429 / error, cools that model down and falls through to the next,
  * if every model is exhausted, raises GatewayExhausted so the caller can
    degrade to a plain guided form (a citizen is never turned away).

With no GEMINI_API_KEY, it runs in deterministic MOCK mode so the whole app is
demoable offline.
"""
from __future__ import annotations

import datetime as dt
import logging
import threading
import time
from collections import deque

from . import config
from .mock_llm import mock_intake
from .schemas import IntakeResult

logger = logging.getLogger(__name__)


class GatewayExhausted(RuntimeError):
    """Raised when every configured model in a group is unavailable or throttled."""


def _today() -> str:
    return dt.datetime.now(dt.UTC).date().isoformat()


class _ModelState:
    def __init__(self, cfg: config.ModelCfg):
        self.cfg = cfg
        self.minute_reqs: deque[float] = deque()              # timestamps in the last 60s
        self.minute_tokens: deque[tuple[float, int]] = deque()
        self._minute_token_sum: int = 0
        self.day: str = _today()
        self.day_reqs: int = 0
        self.cooldown_until: float = 0.0
        self._lock = threading.Lock()

    def _roll(self, now_ts: float) -> None:
        cutoff = now_ts - 60.0
        while self.minute_reqs and self.minute_reqs[0] < cutoff:
            self.minute_reqs.popleft()
        while self.minute_tokens and self.minute_tokens[0][0] < cutoff:
            _, tokens = self.minute_tokens.popleft()
            self._minute_token_sum = max(0, self._minute_token_sum - tokens)
        today = _today()
        if self.day != today:
            self.day = today
            self.day_reqs = 0

    def available(self, est_tokens: int) -> bool:
        now_ts = time.time()
        with self._lock:
            self._roll(now_ts)
            if now_ts < self.cooldown_until:
                return False
            if len(self.minute_reqs) >= self.cfg.rpm:
                return False
            if self._minute_token_sum + est_tokens > self.cfg.tpm:
                return False
            if self.day_reqs >= self.cfg.rpd:
                return False
            return True

    def record(self, tokens: int) -> None:
        now_ts = time.time()
        safe_tokens = max(0, int(tokens))
        with self._lock:
            self._roll(now_ts)
            self.minute_reqs.append(now_ts)
            self.minute_tokens.append((now_ts, safe_tokens))
            self._minute_token_sum += safe_tokens
            self.day_reqs += 1

    def cooldown(self, seconds: int = 30) -> None:
        with self._lock:
            self.cooldown_until = time.time() + seconds

    def snapshot(self) -> dict:
        now_ts = time.time()
        with self._lock:
            self._roll(now_ts)
            is_cooling = now_ts < self.cooldown_until
            is_avail = (
                not is_cooling
                and len(self.minute_reqs) < self.cfg.rpm
                and self._minute_token_sum + 500 <= self.cfg.tpm
                and self.day_reqs < self.cfg.rpd
            )
            return {
                "model": self.cfg.name,
                "group": self.cfg.group,
                "rpm": f"{len(self.minute_reqs)}/{self.cfg.rpm}",
                "rpd": f"{self.day_reqs}/{self.cfg.rpd}",
                "cooling_down": is_cooling,
                "available": is_avail,
            }


class GeminiPool:
    def __init__(self) -> None:
        self.states: list[_ModelState] = [_ModelState(c) for c in config.GEMINI_POOL]

    def status(self) -> list[dict]:
        return [s.snapshot() for s in self.states]

    def _candidates(self, group: str, est_tokens: int) -> list[_ModelState]:
        cands = [
            s for s in self.states if s.cfg.group == group and s.available(est_tokens)
        ]
        return sorted(cands, key=lambda s: s.cfg.order)

    def generate(
        self,
        *,
        group: str,
        system: str,
        user: str,
        schema: type[IntakeResult] = IntakeResult,
    ) -> IntakeResult:
        est = (len(system) + len(user)) // 4 + 512
        if not config.llm_is_live():
            return mock_intake(user)  # offline deterministic path

        import litellm  # lazy import so the app runs without litellm installed

        last_err: Exception | None = None
        for state in self._candidates(group, est):
            try:
                resp = litellm.completion(
                    model=state.cfg.name,
                    api_key=config.GEMINI_API_KEY,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    response_format=schema,  # LiteLLM -> Gemini response_schema
                    timeout=20,
                )
                content = resp.choices[0].message.content
                used = getattr(getattr(resp, "usage", None), "total_tokens", est)
                state.record(used)
                return schema.model_validate_json(_strip(content))
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                logger.warning("LLM model %s failed: %s", state.cfg.name, type(exc).__name__)
                if "429" in str(exc) or "rate" in str(exc).lower():
                    state.cooldown(30)
                continue
        raise GatewayExhausted(
            f"All '{group}' models unavailable ({type(last_err).__name__ if last_err else 'none'})"
        )


def _strip(text: str) -> str:
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        brace_idx = cleaned.find("{")
        if brace_idx != -1:
            cleaned = cleaned[brace_idx:]
    return cleaned


POOL = GeminiPool()
