"""Optional Prometheus metrics helpers.

This module attempts to import `prometheus_client`. If available, it
exposes real Counters/Histograms; otherwise it provides no-op stubs so
instrumentation calls are safe in environments without the package.
"""
from typing import Callable


class _Noop:
    def inc(self, *args, **kwargs):
        return None

    def observe(self, *args, **kwargs):
        return None


try:
    from prometheus_client import Counter, Histogram, generate_latest
    REQUEST_COUNT = Counter('http_requests_total', 'HTTP requests total', ['method', 'endpoint', 'status'])
    PATHFIND_TIME = Histogram('city_pathfind_seconds', 'Pathfinding duration (seconds)')
    TICK_TIME = Histogram('city_tick_seconds', 'Simulation tick duration (seconds)')

    def prometheus_metrics_text() -> bytes:
        return generate_latest()

except Exception:
    REQUEST_COUNT = _Noop()
    PATHFIND_TIME = _Noop()
    TICK_TIME = _Noop()

    def prometheus_metrics_text() -> bytes:
        return b""
