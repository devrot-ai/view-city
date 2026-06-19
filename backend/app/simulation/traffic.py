"""
Traffic Flow Simulation — Vehicle spawning, movement, congestion.

Low-latency design:
- O(1) vehicle-to-edge mapping via dict[edge_id, set[vehicle_id]]
- Pre-computed paths with lazy rerouting
- Batch speed updates using vectorized congestion formula
"""

import random
from typing import Optional

from app.models.city_graph import CityGraph, RoadSegment
from app.models.vehicle import Vehicle, create_random_vehicle


class TrafficSimulator:
    """Manages vehicle lifecycle and traffic flow on the city graph."""

    def __init__(self, city: CityGraph):
        self.city = city
        self.vehicles: dict[str, Vehicle] = {}  # vehicle_id -> Vehicle (O(1))
        self.edge_vehicles: dict[str, set[str]] = {}  # edge_id -> {vehicle_ids} (O(1))
        self.spawn_rate: float = 3.0  # vehicles per tick
        self._spawn_accumulator: float = 0.0
        self._node_list: list[str] = list(city.intersections.keys())  # cached for fast random pick

    def tick(self, dt: float = 0.1) -> dict:
        """
        Advance traffic by one tick.
        Returns dict of changes for delta encoding.
        """
        changes = {
            "spawned": [],
            "moved": [],
            "arrived": [],
            "rerouted": [],
            "edges_changed": set(),
        }

        # 1. Spawn new vehicles
        self._spawn_vehicles(changes)

        # 2. Move all active vehicles
        self._move_vehicles(dt, changes)

        # 3. Update edge vehicle counts from our O(1) mapping
        self._sync_edge_counts(changes)

        # 4. Update edge speeds based on congestion
        self._update_speeds(changes)

        return changes

    def _spawn_vehicles(self, changes: dict):
        """Spawn vehicles at the configured rate."""
        self._spawn_accumulator += self.spawn_rate
        to_spawn = int(self._spawn_accumulator)
        self._spawn_accumulator -= to_spawn

        for _ in range(to_spawn):
            vehicle = create_random_vehicle()

            # Pick random origin and destination (different nodes)
            origin = random.choice(self._node_list)
            destination = random.choice(self._node_list)
            attempts = 0
            while destination == origin and attempts < 5:
                destination = random.choice(self._node_list)
                attempts += 1
            if destination == origin:
                continue

            vehicle.origin = origin
            vehicle.destination = destination

            # Compute path
            path = self.city.shortest_path(origin, destination)
            if not vehicle.start_on_path(path):
                continue

            # Register vehicle
            self.vehicles[vehicle.id] = vehicle
            edge_id = vehicle.current_edge_id
            if edge_id not in self.edge_vehicles:
                self.edge_vehicles[edge_id] = set()
            self.edge_vehicles[edge_id].add(vehicle.id)

            changes["spawned"].append(vehicle.id)
            changes["edges_changed"].add(edge_id)

    def _move_vehicles(self, dt: float, changes: dict):
        """Move each vehicle along its path."""
        to_remove = []

        for vid, vehicle in self.vehicles.items():
            if not vehicle.is_active:
                to_remove.append(vid)
                continue

            vehicle.ticks_alive += 1
            if vehicle.reroute_cooldown > 0:
                vehicle.reroute_cooldown -= 1

            # Get current edge
            edge = self.city.get_edge(vehicle.current_edge_from, vehicle.current_edge_to)
            if edge is None or edge.is_closed:
                # Road closed or missing — try reroute
                self._reroute_vehicle(vehicle, changes)
                continue

            # Check traffic signal at the destination intersection
            dest_intersection = self.city.intersections.get(vehicle.current_edge_to)
            if dest_intersection and vehicle.progress > 0.85:
                if dest_intersection.signal_state == "red":
                    # Wait at red light (don't advance)
                    vehicle.speed = 0.0
                    continue

            # Calculate speed based on congestion
            effective_speed = self.city.effective_speed(edge)
            vehicle.speed = effective_speed

            # Calculate progress increment
            # speed is km/h, edge length is meters, dt is seconds
            if edge.length > 0:
                speed_ms = effective_speed * 1000.0 / 3600.0  # km/h -> m/s
                progress_delta = (speed_ms * dt) / edge.length
            else:
                progress_delta = 1.0

            old_edge_id = vehicle.current_edge_id
            vehicle.progress += progress_delta

            # Determine honking based on edge honking rate and congestion
            congestion = self.city.congestion_factor(edge)
            honk_chance = edge.honking_rate * congestion
            vehicle.is_honking = random.random() < honk_chance

            # Check if vehicle reached end of current edge
            if vehicle.progress >= 1.0:
                # Remove from current edge
                self._remove_from_edge(vid, old_edge_id)
                changes["edges_changed"].add(old_edge_id)

                # Try to advance to next edge
                if not vehicle.advance_to_next_edge():
                    # Vehicle arrived at destination
                    to_remove.append(vid)
                    changes["arrived"].append(vid)
                    continue

                # Check if next edge exists and is open
                next_edge = self.city.get_edge(
                    vehicle.current_edge_from, vehicle.current_edge_to
                )
                if next_edge is None or next_edge.is_closed:
                    self._reroute_vehicle(vehicle, changes)
                    if not vehicle.is_active:
                        to_remove.append(vid)
                        continue

                # Check capacity on next edge
                new_edge_id = vehicle.current_edge_id
                if next_edge and next_edge.current_vehicles >= next_edge.capacity:
                    # Edge full — try reroute if cooldown allows
                    if vehicle.needs_reroute:
                        self._reroute_vehicle(vehicle, changes)
                        if not vehicle.is_active:
                            to_remove.append(vid)
                            continue
                        new_edge_id = vehicle.current_edge_id

                # Add to new edge
                if new_edge_id not in self.edge_vehicles:
                    self.edge_vehicles[new_edge_id] = set()
                self.edge_vehicles[new_edge_id].add(vid)
                changes["edges_changed"].add(new_edge_id)

            changes["moved"].append(vid)

        # Remove arrived/dead vehicles
        for vid in to_remove:
            vehicle = self.vehicles.pop(vid, None)
            if vehicle:
                edge_id = vehicle.current_edge_id
                self._remove_from_edge(vid, edge_id)
                changes["edges_changed"].add(edge_id)

    def _reroute_vehicle(self, vehicle: Vehicle, changes: dict):
        """Reroute a vehicle from its current position to its destination."""
        current_node = vehicle.current_edge_from
        new_path = self.city.shortest_path(current_node, vehicle.destination)

        if len(new_path) < 2:
            vehicle.is_active = False
            return

        # Remove from old edge
        old_edge_id = vehicle.current_edge_id
        self._remove_from_edge(vehicle.id, old_edge_id)
        changes["edges_changed"].add(old_edge_id)

        # Start on new path
        vehicle.start_on_path(new_path)
        vehicle.reroute_cooldown = 20  # Don't reroute again for 20 ticks

        # Add to new edge
        new_edge_id = vehicle.current_edge_id
        if new_edge_id not in self.edge_vehicles:
            self.edge_vehicles[new_edge_id] = set()
        self.edge_vehicles[new_edge_id].add(vehicle.id)
        changes["edges_changed"].add(new_edge_id)
        changes["rerouted"].append(vehicle.id)

    def _remove_from_edge(self, vehicle_id: str, edge_id: str):
        """Remove a vehicle from an edge's vehicle set. O(1)."""
        if edge_id in self.edge_vehicles:
            self.edge_vehicles[edge_id].discard(vehicle_id)

    def _sync_edge_counts(self, changes: dict):
        """Sync vehicle counts on edges from our O(1) mapping."""
        for edge_id in changes["edges_changed"]:
            segment = self.city.road_segments.get(edge_id)
            if segment:
                count = len(self.edge_vehicles.get(edge_id, set()))
                segment.current_vehicles = count

    def _update_speeds(self, changes: dict):
        """Update effective speeds on changed edges."""
        for edge_id in changes["edges_changed"]:
            segment = self.city.road_segments.get(edge_id)
            if segment:
                segment.current_avg_speed = self.city.effective_speed(segment)

    def get_active_vehicle_count(self) -> int:
        """O(1) active vehicle count."""
        return len(self.vehicles)

    def get_vehicle_data(self) -> list[dict]:
        """Get lightweight vehicle data for WebSocket broadcast."""
        return [v.to_dict() for v in self.vehicles.values() if v.is_active]
