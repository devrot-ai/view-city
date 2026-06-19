"""
Vehicle Agent Model — Individual vehicles that traverse the city graph.

Each vehicle has an origin, destination, and follows a path computed
by Dijkstra on the city graph. Vehicles contribute to traffic density,
noise, and pollution on their current road segment.

Low-latency design:
- Lightweight dataclass with minimal per-tick computation
- Path is pre-computed and only recalculated on congestion/blockage
- Position interpolation for smooth frontend animation
"""

import random
import uuid
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Vehicle:
    """A vehicle agent traversing the city graph."""
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    origin: str = ""
    destination: str = ""
    current_edge_from: str = ""
    current_edge_to: str = ""
    path: list[str] = field(default_factory=list)
    path_index: int = 0
    progress: float = 0.0  # 0.0 to 1.0 along current edge
    speed: float = 0.0  # current speed in km/h
    is_honking: bool = False
    vehicle_type: str = "car"  # "car", "bus", "truck", "motorcycle"
    emission_factor: float = 1.0  # pollution multiplier
    is_active: bool = True
    ticks_alive: int = 0
    reroute_cooldown: int = 0  # ticks before next reroute attempt

    def __post_init__(self):
        # Set emission factor based on vehicle type
        emission_map = {
            "car": 1.0,
            "bus": 2.5,
            "truck": 3.0,
            "motorcycle": 0.6,
        }
        self.emission_factor = emission_map.get(self.vehicle_type, 1.0)

    @property
    def current_edge_id(self) -> str:
        """Get the road segment ID this vehicle is on."""
        return f"R_{self.current_edge_from}_{self.current_edge_to}"

    @property
    def has_arrived(self) -> bool:
        """Check if vehicle reached its destination."""
        return (
            self.path_index >= len(self.path) - 1
            and self.progress >= 1.0
        )

    @property
    def needs_reroute(self) -> bool:
        """Check if vehicle should recalculate its path."""
        return self.reroute_cooldown <= 0

    def advance_to_next_edge(self) -> bool:
        """
        Move to the next edge in the path.
        Returns True if there is a next edge, False if arrived.
        """
        self.path_index += 1
        if self.path_index >= len(self.path) - 1:
            self.is_active = False
            return False

        self.current_edge_from = self.path[self.path_index]
        self.current_edge_to = self.path[self.path_index + 1]
        self.progress = 0.0
        return True

    def start_on_path(self, path: list[str]) -> bool:
        """Initialize vehicle on a computed path."""
        if len(path) < 2:
            self.is_active = False
            return False

        self.path = path
        self.path_index = 0
        self.current_edge_from = path[0]
        self.current_edge_to = path[1]
        self.progress = 0.0
        self.is_active = True
        return True

    def to_dict(self) -> dict:
        """Lightweight serialization for WebSocket broadcast."""
        return {
            "id": self.id,
            "edge_from": self.current_edge_from,
            "edge_to": self.current_edge_to,
            "progress": round(self.progress, 3),
            "speed": round(self.speed, 1),
            "honking": self.is_honking,
            "type": self.vehicle_type,
        }


def create_random_vehicle() -> Vehicle:
    """Factory for creating a random vehicle with varied types."""
    # Weighted vehicle type distribution
    types_weights = [
        ("car", 0.65),
        ("motorcycle", 0.20),
        ("bus", 0.08),
        ("truck", 0.07),
    ]
    types, weights = zip(*types_weights)
    chosen = random.choices(types, weights=weights, k=1)[0]

    return Vehicle(vehicle_type=chosen)
