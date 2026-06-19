"""
Core Simulation Engine — Orchestrates all simulation sub-systems.

Runs a tick-based loop that coordinates:
1. Traffic flow (vehicle spawning, movement, congestion)
2. Pollution diffusion
3. Noise propagation
4. Accident checking
5. Traffic signal cycling
6. Delta-encoded state broadcasting

Designed for minimal latency:
- Async loop with configurable tick rate
- Only broadcasts changes (delta encoding)
- Sub-models update in-place on shared CityGraph
"""

import asyncio
import random
import time
from typing import Optional, Callable, Awaitable

from app.models.city_graph import CityGraph
from app.simulation.traffic import TrafficSimulator
from app.simulation.pollution import PollutionModel
from app.simulation.noise import NoiseModel
from app.simulation.accidents import AccidentModel


class SimulationEngine:
    """
    Main simulation orchestrator.
    
    Coordinates all sub-systems on a shared CityGraph.
    All data lives in-memory with O(1) lookups — no external DB.
    """

    DEFAULT_TICK_RATE = 10  # ticks per second
    DEFAULT_DT = 0.1  # seconds per tick (simulation time)

    def __init__(self, grid_size: int = 8):
        # Core city model — the shared "database"
        self.city = CityGraph(grid_size=grid_size)

        # Sub-system models (all operate on self.city)
        self.traffic = TrafficSimulator(self.city)
        self.pollution = PollutionModel(self.city)
        self.noise = NoiseModel(self.city)
        self.accidents = AccidentModel(self.city)

        # Simulation state
        self.tick_count: int = 0
        self.sim_time: float = 0.0  # simulated seconds elapsed
        self.is_running: bool = False
        self.speed_multiplier: float = 1.0  # 0.1x to 10x
        self.dt: float = self.DEFAULT_DT

        # Broadcast callback (set by WebSocket handler)
        self._broadcast_fn: Optional[Callable[[dict], Awaitable[None]]] = None

        # Performance tracking
        self._last_tick_duration: float = 0.0
        self._tick_durations: list[float] = []

    def set_broadcast_callback(self, fn: Callable[[dict], Awaitable[None]]):
        """Set the async function to call after each tick to broadcast state."""
        self._broadcast_fn = fn

    async def start(self):
        """Start the simulation loop."""
        self.is_running = True
        asyncio.create_task(self._run_loop())

    async def stop(self):
        """Stop the simulation loop."""
        self.is_running = False

    async def step(self):
        """Advance one tick manually."""
        await self._tick()

    def reset(self, grid_size: int = 8):
        """Reset the entire simulation to initial state."""
        self.city = CityGraph(grid_size=grid_size)
        self.traffic = TrafficSimulator(self.city)
        self.pollution = PollutionModel(self.city)
        self.noise = NoiseModel(self.city)
        self.accidents = AccidentModel(self.city)
        self.tick_count = 0
        self.sim_time = 0.0
        self.is_running = False
        self.speed_multiplier = 1.0

    async def _run_loop(self):
        """Main simulation loop — runs until stopped."""
        while self.is_running:
            tick_start = time.perf_counter()

            await self._tick()

            # Calculate sleep time based on speed multiplier
            elapsed = time.perf_counter() - tick_start
            target_interval = (1.0 / self.DEFAULT_TICK_RATE) / self.speed_multiplier
            sleep_time = max(0.001, target_interval - elapsed)

            await asyncio.sleep(sleep_time)

    async def _tick(self):
        """Execute one simulation tick — the core update cycle."""
        tick_start = time.perf_counter()
        self.tick_count += 1
        self.sim_time += self.dt

        # 1. Cycle traffic signals
        changed_signals = self._cycle_signals()

        # 2. Advance traffic (spawning, movement, rerouting)
        traffic_changes = self.traffic.tick(self.dt)

        # 3. Update pollution levels
        pollution_changed = self.pollution.tick()

        # 4. Update noise levels
        noise_changed = self.noise.tick(self.traffic.vehicles)

        # 5. Check for accidents
        accident_changes = self.accidents.tick(self.tick_count)

        # 6. Build delta state update
        delta = self._build_delta(
            traffic_changes,
            pollution_changed,
            noise_changed,
            accident_changes,
            changed_signals,
        )

        # 7. Track performance
        self._last_tick_duration = time.perf_counter() - tick_start
        self._tick_durations.append(self._last_tick_duration)
        if len(self._tick_durations) > 100:
            self._tick_durations.pop(0)

        # 8. Broadcast delta to connected clients
        if self._broadcast_fn:
            try:
                await self._broadcast_fn(delta)
            except Exception:
                pass  # Don't crash simulation on broadcast failure

    def _cycle_signals(self) -> set[str]:
        """Cycle traffic signals. Returns set of changed node IDs."""
        changed = set()
        for node_id, node in self.city.intersections.items():
            node.signal_timer += self.dt

            if node.signal_timer >= node.signal_cycle:
                node.signal_timer = 0.0

            # Determine signal state based on timer position in cycle
            cycle_pos = node.signal_timer / node.signal_cycle
            old_state = node.signal_state

            if cycle_pos < 0.45:
                node.signal_state = "green"
            elif cycle_pos < 0.55:
                node.signal_state = "yellow"
            else:
                node.signal_state = "red"

            if node.signal_state != old_state:
                changed.add(node_id)

        return changed

    def _build_delta(
        self,
        traffic_changes: dict,
        pollution_changed: set[str],
        noise_changed: set[str],
        accident_changes: dict,
        signal_changed: set[str],
    ) -> dict:
        """Build a delta state update for WebSocket broadcast."""
        # Collect all changed edge IDs
        all_changed_edges = (
            traffic_changes.get("edges_changed", set())
            | accident_changes.get("edges_changed", set())
        )

        # Build edge updates (only changed edges)
        edges_data = []
        for edge_id in all_changed_edges:
            seg = self.city.road_segments.get(edge_id)
            if seg:
                edges_data.append({
                    "id": seg.id,
                    "vehicles": seg.current_vehicles,
                    "congestion": round(self.city.congestion_factor(seg), 3),
                    "speed": round(self.city.effective_speed(seg), 1),
                    "pollution": round(seg.pollution_contribution, 2),
                    "noise": round(seg.noise_contribution, 2),
                    "is_closed": seg.is_closed,
                    "accident": seg.accident_active,
                })

        # Build node updates (only changed nodes)
        all_changed_nodes = pollution_changed | noise_changed | signal_changed
        nodes_data = []
        for node_id in all_changed_nodes:
            node = self.city.intersections.get(node_id)
            if node:
                nodes_data.append({
                    "id": node.id,
                    "pollution": round(node.pollution_level, 2),
                    "noise": round(node.noise_level, 2),
                    "signal": node.signal_state,
                })

        # Get metrics snapshot
        metrics = self.city.get_metrics_snapshot()

        return {
            "type": "state_update",
            "tick": self.tick_count,
            "sim_time": round(self.sim_time, 1),
            "metrics": metrics,
            "edges_changed": edges_data,
            "nodes_changed": nodes_data,
            "vehicles": self.traffic.get_vehicle_data(),
            "accidents": self.accidents.get_active_accidents(),
            "active_policies": [],  # filled by API layer
            "performance": {
                "tick_ms": round(self._last_tick_duration * 1000, 2),
                "avg_tick_ms": round(
                    sum(self._tick_durations) / max(len(self._tick_durations), 1) * 1000, 2
                ),
                "active_vehicles": self.traffic.get_active_vehicle_count(),
            },
        }

    def get_full_state(self) -> dict:
        """Get the complete current state (for initial load)."""
        return {
            "type": "full_state",
            "tick": self.tick_count,
            "sim_time": round(self.sim_time, 1),
            "city": self.city.to_geojson(),
            "metrics": self.city.get_metrics_snapshot(),
            "vehicles": self.traffic.get_vehicle_data(),
            "accidents": self.accidents.get_active_accidents(),
            "is_running": self.is_running,
            "speed": self.speed_multiplier,
        }

    def get_metrics(self) -> dict:
        """Get current aggregate metrics."""
        base = self.city.get_metrics_snapshot()
        base.update({
            "tick": self.tick_count,
            "sim_time": round(self.sim_time, 1),
            "is_running": self.is_running,
            "speed_multiplier": self.speed_multiplier,
            "pollution_index": round(self.pollution.get_total_pollution_index(), 1),
            "noise_index": round(self.noise.get_total_noise_index(), 1),
        })
        return base
