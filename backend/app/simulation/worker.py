"""Simulation worker process entrypoint.

This module provides a minimal process-based runner for the SimulationEngine
that emits delta updates into a multiprocessing.Queue. It's a non-invasive
helper: the main app can spawn this process and read deltas without blocking
the web server event loop.
"""

import asyncio
import multiprocessing as mp
import time
from typing import Any

from app.simulation.engine import SimulationEngine


def _run_worker(queue: mp.Queue, grid_size: int = 8, ticks: int | None = None):
    """Run the simulation loop and push delta dicts into `queue`.

    This blocks until `ticks` have been produced (if provided) or forever.
    """
    engine = SimulationEngine(grid_size=grid_size)

    async def broadcast(delta: dict[str, Any]):
        try:
            queue.put(delta)
        except Exception:
            pass

    engine.set_broadcast_callback(broadcast)

    async def main():
        engine.is_running = True
        count = 0
        while engine.is_running:
            await engine._tick()
            count += 1
            if ticks and count >= ticks:
                engine.is_running = False

    asyncio.run(main())


def start_worker(grid_size: int = 8, ticks: int | None = None) -> mp.Process:
    """Start worker process and return the `Process` object and Queue.

    Example:
        q = mp.Queue()
        p = start_worker(grid_size=8)
        # In parent: p and q are available; q.get() yields deltas
    """
    q = mp.Queue()
    p = mp.Process(target=_run_worker, args=(q, grid_size, ticks), daemon=True)
    p.start()
    return p, q


if __name__ == "__main__":
    # Allow quick manual profiling: run for a small number of ticks and print timings
    p, q = start_worker(grid_size=8, ticks=100)
    start = time.time()
    received = 0
    try:
        while p.is_alive() or not q.empty():
            try:
                item = q.get(timeout=1)
                received += 1
            except Exception:
                pass
    finally:
        end = time.time()
        print(f"Worker finished; received {received} deltas in {end-start:.2f}s")