"""
Pollution Diffusion Model.

Pollution per road segment is a function of:
- Number of vehicles (more vehicles = more exhaust)
- Average speed (slow/idling vehicles produce MORE pollution)
- Vehicle emission factors (trucks > buses > cars > motorcycles)
- Congestion factor (stop-and-go = worst)

Diffusion: pollution spreads to neighboring intersection nodes with decay.
Uses NumPy for batch calculations across all edges.
"""

import numpy as np

from app.models.city_graph import CityGraph


class PollutionModel:
    """Calculates and diffuses pollution across the city graph."""

    # Pollution constants
    BASE_EMISSION_RATE = 0.5  # base pollution units per vehicle per tick
    IDLE_MULTIPLIER = 3.0  # idling vehicles pollute 3x more
    DIFFUSION_RATE = 0.15  # fraction of pollution that spreads to neighbors
    DECAY_RATE = 0.92  # pollution decays to 92% each tick (natural dissipation)

    def __init__(self, city: CityGraph):
        self.city = city

    def tick(self) -> set[str]:
        """
        Update pollution levels for one tick.
        Returns set of changed node IDs.
        """
        changed_nodes = set()

        # Step 1: Calculate pollution contribution per edge
        self._calculate_edge_pollution()

        # Step 2: Aggregate pollution at nodes from connected edges
        self._aggregate_node_pollution(changed_nodes)

        # Step 3: Diffuse pollution to neighboring nodes
        self._diffuse_pollution(changed_nodes)

        # Step 4: Apply natural decay
        self._apply_decay(changed_nodes)

        return changed_nodes

    def _calculate_edge_pollution(self):
        """Calculate pollution contribution for each road segment."""
        for seg in self.city.road_segments.values():
            if seg.current_vehicles <= 0:
                seg.pollution_contribution = 0.0
                continue

            # Base pollution from vehicle count
            base = seg.current_vehicles * self.BASE_EMISSION_RATE

            # Speed penalty: slower = more pollution (idling engines)
            # At speed_limit, factor = 1.0; at 5 km/h, factor = IDLE_MULTIPLIER
            speed_ratio = seg.current_avg_speed / max(seg.speed_limit, 1.0)
            speed_factor = 1.0 + (self.IDLE_MULTIPLIER - 1.0) * (1.0 - speed_ratio)

            # Congestion penalty: stop-and-go amplifies pollution
            congestion = self.city.congestion_factor(seg)
            congestion_factor = 1.0 + congestion * 2.0

            seg.pollution_contribution = base * speed_factor * congestion_factor

    def _aggregate_node_pollution(self, changed_nodes: set[str]):
        """Aggregate pollution from connected edges to intersection nodes."""
        for node_id, node in self.city.intersections.items():
            total = 0.0
            count = 0

            # Sum pollution from all edges connected to this node
            for neighbor in self.city.get_neighbors(node_id):
                edge = self.city.get_edge(node_id, neighbor)
                if edge:
                    total += edge.pollution_contribution
                    count += 1

            # Also check incoming edges
            for other_id in self.city.intersections:
                edge = self.city.get_edge(other_id, node_id)
                if edge:
                    total += edge.pollution_contribution
                    count += 1

            if count > 0:
                # Average pollution from connected edges, scaled to 0-100
                new_level = min(100.0, total / max(count, 1) * 5.0)
                if abs(new_level - node.pollution_level) > 0.1:
                    changed_nodes.add(node_id)
                node.pollution_level = new_level

    def _diffuse_pollution(self, changed_nodes: set[str]):
        """Diffuse pollution from high-concentration nodes to neighbors."""
        # Snapshot current levels to avoid order-dependency
        levels = {
            nid: node.pollution_level
            for nid, node in self.city.intersections.items()
        }

        for node_id, node in self.city.intersections.items():
            neighbors = self.city.get_neighbors(node_id)
            if not neighbors:
                continue

            # Receive pollution from neighbors
            neighbor_avg = np.mean([levels.get(n, 0.0) for n in neighbors])
            diffusion = (neighbor_avg - levels[node_id]) * self.DIFFUSION_RATE

            new_level = levels[node_id] + diffusion
            new_level = max(0.0, min(100.0, new_level))

            if abs(new_level - node.pollution_level) > 0.1:
                changed_nodes.add(node_id)
            node.pollution_level = new_level

    def _apply_decay(self, changed_nodes: set[str]):
        """Apply natural pollution decay (wind, rain, etc.)."""
        for node_id, node in self.city.intersections.items():
            old = node.pollution_level
            node.pollution_level *= self.DECAY_RATE
            if node.pollution_level < 0.1:
                node.pollution_level = 0.0
            if abs(old - node.pollution_level) > 0.1:
                changed_nodes.add(node_id)

    def get_zone_pollution(self, zone_id: str) -> float:
        """Get average pollution for a zone. O(zone_size)."""
        nodes = self.city.zones.get(zone_id, [])
        if not nodes:
            return 0.0
        return float(np.mean([
            self.city.intersections[nid].pollution_level
            for nid in nodes
            if nid in self.city.intersections
        ]))

    def get_total_pollution_index(self) -> float:
        """Get city-wide pollution index."""
        if not self.city.intersections:
            return 0.0
        return float(np.mean([
            n.pollution_level for n in self.city.intersections.values()
        ]))
