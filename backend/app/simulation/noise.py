"""
Noise Propagation Model.

Noise per road segment is a function of:
- Number of vehicles (more vehicles = more engine noise)
- Vehicle speed (higher speed = more tire/wind noise)
- Honking rate (the dominant controllable noise source)
- Road type (highways are louder than local roads)

Honking is the primary policy lever — banning honking can reduce
zone noise by 30-50%.

Uses simplified dB-like scale (0-100) for UI display.
"""

import numpy as np

from app.models.city_graph import CityGraph


class NoiseModel:
    """Calculates noise levels across the city graph."""

    # Noise constants (simplified dB-like scale)
    ENGINE_NOISE_PER_VEHICLE = 1.2  # base engine noise contribution
    TIRE_NOISE_FACTOR = 0.03  # noise per km/h per vehicle
    HONK_NOISE = 8.0  # noise per honking vehicle (very loud)
    ROAD_TYPE_MULTIPLIER = {
        "highway": 1.5,
        "main": 1.2,
        "local": 1.0,
    }
    ATTENUATION_RATE = 0.6  # noise drops to 60% at neighboring nodes
    DECAY_RATE = 0.85  # noise decays faster than pollution (sound dissipates quickly)

    def __init__(self, city: CityGraph):
        self.city = city

    def tick(self, vehicles: dict) -> set[str]:
        """
        Update noise levels for one tick.
        
        Args:
            vehicles: dict of vehicle_id -> Vehicle for honking state
            
        Returns set of changed node IDs.
        """
        changed_nodes = set()

        # Step 1: Calculate noise contribution per edge
        self._calculate_edge_noise(vehicles)

        # Step 2: Aggregate noise at nodes
        self._aggregate_node_noise(changed_nodes)

        # Step 3: Apply decay
        self._apply_decay(changed_nodes)

        return changed_nodes

    def _calculate_edge_noise(self, vehicles: dict):
        """Calculate noise contribution for each road segment."""
        # Build quick edge -> honking count from vehicles
        edge_honking: dict[str, int] = {}
        for v in vehicles.values():
            if v.is_active and v.is_honking:
                eid = v.current_edge_id
                edge_honking[eid] = edge_honking.get(eid, 0) + 1

        for seg in self.city.road_segments.values():
            if seg.current_vehicles <= 0:
                seg.noise_contribution = 0.0
                continue

            road_mult = self.ROAD_TYPE_MULTIPLIER.get(seg.road_type, 1.0)

            # Engine noise (scales with vehicle count)
            engine_noise = seg.current_vehicles * self.ENGINE_NOISE_PER_VEHICLE

            # Tire noise (scales with speed)
            tire_noise = seg.current_vehicles * seg.current_avg_speed * self.TIRE_NOISE_FACTOR

            # Honking noise (dominant, controllable source)
            honking_count = edge_honking.get(seg.id, 0)
            honk_noise = honking_count * self.HONK_NOISE

            # Total noise for this edge
            seg.noise_contribution = (engine_noise + tire_noise + honk_noise) * road_mult

    def _aggregate_node_noise(self, changed_nodes: set[str]):
        """Aggregate noise from connected edges to intersection nodes."""
        for node_id, node in self.city.intersections.items():
            total_noise = 0.0

            # Sum noise from all connected edges (outgoing)
            for neighbor in self.city.get_neighbors(node_id):
                edge = self.city.get_edge(node_id, neighbor)
                if edge:
                    total_noise += edge.noise_contribution

            # Incoming edges contribute with attenuation
            for other_id in self.city.intersections:
                if other_id == node_id:
                    continue
                edge = self.city.get_edge(other_id, node_id)
                if edge:
                    total_noise += edge.noise_contribution * self.ATTENUATION_RATE

            # Scale to 0-100 range
            new_level = min(100.0, total_noise * 0.8)

            if abs(new_level - node.noise_level) > 0.2:
                changed_nodes.add(node_id)
            node.noise_level = new_level

    def _apply_decay(self, changed_nodes: set[str]):
        """Apply natural noise decay (sound dissipates quickly)."""
        for node_id, node in self.city.intersections.items():
            old = node.noise_level
            node.noise_level *= self.DECAY_RATE
            if node.noise_level < 0.1:
                node.noise_level = 0.0
            if abs(old - node.noise_level) > 0.2:
                changed_nodes.add(node_id)

    def get_zone_noise(self, zone_id: str) -> float:
        """Get average noise for a zone. O(zone_size)."""
        nodes = self.city.zones.get(zone_id, [])
        if not nodes:
            return 0.0
        return float(np.mean([
            self.city.intersections[nid].noise_level
            for nid in nodes
            if nid in self.city.intersections
        ]))

    def get_total_noise_index(self) -> float:
        """Get city-wide noise index."""
        if not self.city.intersections:
            return 0.0
        return float(np.mean([
            n.noise_level for n in self.city.intersections.values()
        ]))
