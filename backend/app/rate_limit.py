import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.config import get_settings

_lock = threading.Lock()
_hits: dict[str, deque[float]] = defaultdict(deque)


def enforce_auth_rate_limit(request: Request) -> None:
    settings = get_settings()
    limit = settings.auth_rate_limit
    window = settings.auth_rate_window_seconds
    if limit <= 0:
        return
    host = request.client.host if request.client else "unknown"
    key = f"{host}:{request.url.path}"
    now = time.monotonic()
    with _lock:
        bucket = _hits[key]
        while bucket and now - bucket[0] > window:
            bucket.popleft()
        if len(bucket) >= limit:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many attempts. Try again shortly.")
        bucket.append(now)


def reset_rate_limits() -> None:
    with _lock:
        _hits.clear()
