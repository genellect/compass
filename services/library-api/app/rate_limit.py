from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from threading import Lock
from time import monotonic


@dataclass
class _Window:
    started_at: float
    count: int


class FixedWindowRateLimiter:
    """Small bounded limiter for the initial max-instance=1 deployment."""

    def __init__(self, *, max_entries: int = 4096) -> None:
        self._entries: OrderedDict[str, _Window] = OrderedDict()
        self._max_entries = max_entries
        self._lock = Lock()

    def allow(self, key: str, *, limit: int, window_seconds: int) -> tuple[bool, int]:
        now = monotonic()
        with self._lock:
            current = self._entries.get(key)
            if current is None or now - current.started_at >= window_seconds:
                current = _Window(started_at=now, count=0)
                self._entries[key] = current
            current.count += 1
            self._entries.move_to_end(key)
            while len(self._entries) > self._max_entries:
                self._entries.popitem(last=False)
            elapsed = max(0, int(now - current.started_at))
            retry_after = max(1, window_seconds - elapsed)
            return current.count <= limit, retry_after


submit_rate_limiter = FixedWindowRateLimiter()
submit_global_rate_limiter = FixedWindowRateLimiter(max_entries=8)
status_rate_limiter = FixedWindowRateLimiter()
preauth_rate_limiter = FixedWindowRateLimiter()
# This deliberately uses one global bucket: the initial Cloud Run service is
# capped at one instance and the administrator population is tiny. The bucket
# is process-local, so raising max_instance_count requires moving this control
# to a shared/edge limiter before that deployment is approved.
admin_preauth_rate_limiter = FixedWindowRateLimiter(max_entries=1)
admin_export_rate_limiter = FixedWindowRateLimiter(max_entries=256)
