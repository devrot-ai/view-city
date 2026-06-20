"""Profile the SimulationEngine by running a number of ticks.

Generates a lightweight workload to find hotspots in the simulation loop.
Run with the repo venv Python.
"""

import asyncio
from app.simulation.engine import SimulationEngine


async def run_ticks(n: int = 100):
    engine = SimulationEngine(grid_size=8)

    # Provide a no-op broadcast to avoid I/O overhead during profiling
    async def noop_broadcast(delta):
        return

    engine.set_broadcast_callback(noop_broadcast)

    # Run n ticks sequentially
    for _ in range(n):
        await engine.step()


if __name__ == "__main__":
    asyncio.run(run_ticks(200))
