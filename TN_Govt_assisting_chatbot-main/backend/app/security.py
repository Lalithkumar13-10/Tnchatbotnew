"""Security primitives: bounded OTP store, rate limiter, RBAC guards, and HTTP headers.

Encapsulates authentication state inside thread-safe classes rather than naked
module globals so lifecycle, eviction, and testing remain clean and predictable.
"""
from __future__ import annotations

import hmac
import secrets
import threading
import time
from collections import OrderedDict, deque
from dataclasses import dataclass

from fastapi import Header, HTTPException, Request, Response

from . import config


CSP_HEADER: str = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; "
    "img-src 'self' data:; "
    "connect-src 'self'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "object-src 'none'"
)


@dataclass
class OtpRecord:
    """State for a single phone verification challenge/session."""

    code: str
    verified: bool
    expires_at: float
    attempts: int = 0
    token: str | None = None


class OtpStore:
    """Thread-safe, TTL-bounded in-memory OTP and citizen session store."""

    def __init__(self) -> None:
        self._records: OrderedDict[str, OtpRecord] = OrderedDict()
        self._lock = threading.Lock()

    def _prune(self, now_ts: float) -> None:
        expired = [p for p, rec in self._records.items() if rec.expires_at < now_ts]
        for phone in expired:
            self._records.pop(phone, None)
        while len(self._records) > config.MAX_OTP_RECORDS:
            self._records.popitem(last=False)

    def issue(self, phone: str) -> str:
        """Create or replace an OTP challenge for a phone number."""
        now_ts = time.monotonic()
        code = config.MOCK_OTP
        with self._lock:
            self._prune(now_ts)
            self._records[phone] = OtpRecord(
                code=code,
                verified=False,
                expires_at=now_ts + config.OTP_TTL_SECONDS,
            )
            self._records.move_to_end(phone)
        return code

    def verify(self, phone: str, code: str) -> str:
        """Verify an OTP code with constant-time comparison and attempt lockouts."""
        now_ts = time.monotonic()
        with self._lock:
            self._prune(now_ts)
            rec = self._records.get(phone)
            if rec is None or rec.expires_at < now_ts:
                raise HTTPException(400, "OTP expired or not requested")
            if rec.attempts >= config.OTP_MAX_ATTEMPTS:
                raise HTTPException(
                    429, "Too many failed OTP attempts. Request a new OTP."
                )
            if not hmac.compare_digest(rec.code, code):
                rec.attempts += 1
                raise HTTPException(400, "Invalid code")

            token = secrets.token_urlsafe(32)
            rec.verified = True
            rec.attempts = 0
            rec.token = token
            rec.expires_at = now_ts + config.OTP_SESSION_TTL_SECONDS
            self._records.move_to_end(phone)
            return token

    def require_verified(self, phone: str, authorization: str | None = None) -> None:
        """Ensure phone is verified and (when supplied) the Bearer token matches."""
        now_ts = time.monotonic()
        with self._lock:
            self._prune(now_ts)
            rec = self._records.get(phone)
            if rec is None or not rec.verified or rec.expires_at < now_ts:
                raise HTTPException(401, "Phone not verified")
            if authorization:
                scheme, _, supplied = authorization.partition(" ")
                if (
                    scheme.lower() != "bearer"
                    or not rec.token
                    or not hmac.compare_digest(rec.token, supplied.strip())
                ):
                    raise HTTPException(401, "Invalid session token")

    def clear(self) -> None:
        """Remove all OTP records (used by tests)."""
        with self._lock:
            self._records.clear()


class RateLimiter:
    """Thread-safe sliding-window in-memory rate limiter."""

    def __init__(self) -> None:
        self._buckets: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def check(self, bucket_key: str, max_requests: int, window_seconds: int) -> None:
        """Record a request or raise HTTP 429 when the sliding window is saturated."""
        now_ts = time.monotonic()
        cutoff = now_ts - window_seconds
        with self._lock:
            timestamps = self._buckets.setdefault(bucket_key, deque())
            while timestamps and timestamps[0] < cutoff:
                timestamps.popleft()
            if len(timestamps) >= max_requests:
                raise HTTPException(429, "Too many requests. Please try again shortly.")
            timestamps.append(now_ts)

    def clear(self) -> None:
        """Clear all rate-limit buckets (used by tests)."""
        with self._lock:
            self._buckets.clear()


otp_store = OtpStore()
rate_limiter = RateLimiter()


def require_admin_role(
    x_role: str = Header(default="cm_cell"),
    x_admin_key: str | None = Header(default=None),
) -> str:
    """FastAPI dependency enforcing valid RBAC roles and optional admin API key."""
    if config.ADMIN_API_KEY:
        if not x_admin_key or not hmac.compare_digest(config.ADMIN_API_KEY, x_admin_key):
            raise HTTPException(401, "Valid X-Admin-Key header required")

    normalized = (x_role or "").strip().lower()
    if normalized not in config.VALID_ROLES:
        raise HTTPException(403, "Unknown or unauthorized role")
    return normalized


async def apply_security_headers(request: Request, call_next) -> Response:
    """HTTP middleware applying defense-in-depth browser security headers."""
    response: Response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault(
        "Permissions-Policy", "geolocation=(self), camera=(), microphone=()"
    )
    response.headers.setdefault("Content-Security-Policy", CSP_HEADER)
    if request.url.path.startswith("/app/") and request.url.path.endswith((".css", ".js")):
        response.headers.setdefault("Cache-Control", "public, max-age=3600")
    return response
