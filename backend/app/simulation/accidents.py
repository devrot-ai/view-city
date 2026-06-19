"""
Accident Probability Model.

Accident probability on a road segment depends on:
- Congestion level (high congestion = more fender-benders)
- Speed variance (mix of fast/slow vehicles = dangerous)
- Intersection complexity (more connections = more conflict points)

Accidents temporarily block an edge, forcing vehicle rerouting.
Each accident has a cooldown timer for resolution.
"""

import random
from dataclasses import dataclass, field

from app.models.city_graph import CityGraph


@dataclass
class Accident:
    """An active accident on a road segment."""
    edge_id: str
    from_node: str
    to_node: str
    severity: float  # 0.0-1.0 (minor fender-bender to major pileup)
    remaining_ticks: int  # ticks until cleared
    tick_created: int = 0

    def to_dict(self) -> dict:
        return {
            "edge_id": self.edge_id,
            "from_node": self.from_node,
            "to_node": self.to_node,
            "severity": round(self.severity, 2),
            "remaining_ticks": self.remaining_ticks,
        }


class AccidentModel:
    """Manages accident probability, creation, and resolution."""

    # Probability constants
    BASE_ACCIDENT_PROB = 0.0008  # base probability per edge per tick
    CONGESTION_MULTIPLIER = 5.0  # high congestion increases accident chance
    SPEED_VARIANCE_FACTOR = 0.02  # speed differences increase risk
    MIN_TICKS_TO_CLEAR = 30  # minimum ticks to clear an accident
    MAX_TICKS_TO_CLEAR = 120  # maximum ticks to clear
    MAX_SIMULTANEOUS_ACCIDENTS = 5  # cap on active accidents
    COOLDOWN_AFTER_CLEAR = 50  # ticks before same edge can have another accident

    def __init__(self, city: CityGraph):
        self.city = city
        self.active_accidents: dict[str, Accident] = {}  # edge_id -> Accident (O(1))
        self._cooldown_edges: dict[str, int] = {}  # edge_id -> remaining cooldown ticks

    def tick(self, current_tick: int) -> dict:
        """
        Process accidents for one tick.
        Returns changes dict with new and resolved accidents.
        """
        changes = {
            "new_accidents": [],
            "resolved_accidents": [],
            "edges_changed": set(),
        }

        # Step 1: Resolve existing accidents
        self._resolve_accidents(changes)

        # Step 2: Decay cooldowns
        self._decay_cooldowns()

        # Step 3: Check for new accidents
        if len(self.active_accidents) < self.MAX_SIMULTANEOUS_ACCIDENTS:
            self._check_new_accidents(current_tick, changes)

        return changes

    def _resolve_accidents(self, changes: dict):
        """Tick down active accidents and resolve completed ones."""
        to_remove = []

        for edge_id, accident in self.active_accidents.items():
            accident.remaining_ticks -= 1

            if accident.remaining_ticks <= 0:
                # Accident cleared — reopen road
                segment = self.city.road_segments.get(edge_id)
                if segment:
                    segment.accident_active = False
                    segment.is_closed = False

                to_remove.append(edge_id)
                self._cooldown_edges[edge_id] = self.COOLDOWN_AFTER_CLEAR
                changes["resolved_accidents"].append(accident.to_dict())
                changes["edges_changed"].add(edge_id)

        for edge_id in to_remove:
            del self.active_accidents[edge_id]

    def _decay_cooldowns(self):
        """Reduce cooldown timers on edges."""
        expired = []
        for edge_id in self._cooldown_edges:
            self._cooldown_edges[edge_id] -= 1
            if self._cooldown_edges[edge_id] <= 0:
                expired.append(edge_id)
        for eid in expired:
            del self._cooldown_edges[eid]

    def _check_new_accidents(self, current_tick: int, changes: dict):
        """Check each edge for potential new accidents."""
        for seg in self.city.road_segments.values():
            # Skip edges that already have accidents or are on cooldown
            if seg.id in self.active_accidents or seg.id in self._cooldown_edges:
                continue

            # Skip edges with no traffic
            if seg.current_vehicles < 3:
                continue

            # Calculate accident probability
            prob = self._calculate_probability(seg)

            if random.random() < prob:
                # Accident occurs!
                severity = min(1.0, random.uniform(0.3, 0.9) * self.city.congestion_factor(seg) + 0.1)
                duration = int(
                    self.MIN_TICKS_TO_CLEAR
                    + severity * (self.MAX_TICKS_TO_CLEAR - self.MIN_TICKS_TO_CLEAR)
                )

                accident = Accident(
                    edge_id=seg.id,
                    from_node=seg.from_node,
                    to_node=seg.to_node,
                    severity=severity,
                    remaining_ticks=duration,
                    tick_created=current_tick,
                )

                self.active_accidents[seg.id] = accident
                seg.accident_active = True
                # Don't fully close for minor accidents
                if severity > 0.5:
                    seg.is_closed = True

                changes["new_accidents"].append(accident.to_dict())
                changes["edges_changed"].add(seg.id)

                # Cap check
                if len(self.active_accidents) >= self.MAX_SIMULTANEOUS_ACCIDENTS:
                    break

    def _calculate_probability(self, seg) -> float:
        """Calculate accident probability for a road segment."""
        prob = self.BASE_ACCIDENT_PROB

        # Congestion factor: higher congestion = more accidents
        congestion = self.city.congestion_factor(seg)
        prob *= 1.0 + congestion * self.CONGESTION_MULTIPLIER

        # Speed variance: mix of fast and slow = dangerous
        speed_diff = abs(seg.speed_limit - seg.current_avg_speed)
        prob *= 1.0 + speed_diff * self.SPEED_VARIANCE_FACTOR

        # Intersection complexity: more connections = more conflict points
        from_node = self.city.intersections.get(seg.from_node)
        if from_node:
            neighbor_count = len(self.city.get_neighbors(seg.from_node))
            if neighbor_count > 3:
                prob *= 1.5

        return prob

    def get_active_accidents(self) -> list[dict]:
        """Get all active accidents for display."""
        return [a.to_dict() for a in self.active_accidents.values()]

    def get_accident_count(self) -> int:
        """O(1) accident count."""
        return len(self.active_accidents)
