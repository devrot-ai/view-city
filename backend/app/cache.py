"""Lightweight cache abstraction.

Uses Redis if available and configured via `REDIS_URL`, otherwise falls back
to a process-local in-memory TTL cache. Provides simple `get`/`set` helpers
with optional TTL in seconds.
"""
import os
import time
import json
from typing import Any, Optional

_local_cache: dict[str, tuple[Any, float]] = {}

_redis_client = None
try:
    import redis
    redis_url = os.environ.get("REDIS_URL")
    if redis_url:
        _redis_client = redis.from_url(redis_url)
except Exception:
    _redis_client = None


def _make_key(key: str) -> str:
    return f"viewcity:{key}"


def get(key: str) -> Optional[Any]:
    """Get value from cache or None if missing/expired."""
    k = _make_key(key)
    if _redis_client:
        try:
            val = _redis_client.get(k)
            if val is None:
                return None
            return json.loads(val)
        except Exception:
            pass

    # Fallback: local in-memory dict with timestamp
    entry = _local_cache.get(k)
    if not entry:
        return None
    value, expires_at = entry
    if time.time() > expires_at:
        del _local_cache[k]
        return None
    return value


def set(key: str, value: Any, ttl: float = 2.0) -> None:
    """Set value into cache with TTL seconds."""
    k = _make_key(key)
    if _redis_client:
        try:
            _redis_client.setex(k, int(ttl), json.dumps(value))
            return
        except Exception:
            pass

    _local_cache[k] = (value, time.time() + float(ttl))
