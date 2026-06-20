"""
City Graph Model — The core data structure for the Digital Twin.

The city is represented as a directed graph where:
- Nodes = intersections (with lat/lng, traffic signals, pollution/noise levels)
- Edges = road segments (with capacity, vehicle count, speed limits)

Uses NetworkX for graph operations and NumPy for fast numerical computations.
Designed for low-latency: pre-computes adjacency and caches shortest paths.
"""

import math
import random
from dataclasses import dataclass, field
from typing import Optional

import networkx as nx
import numpy as np


@dataclass
class Intersection:
    """A node in the city graph representing an intersection."""
    id: str
    lat: float
    lng: float
    row: int
    col: int
    zone: str  # e.g., "A1", "B3" — used for policy targeting
    signal_state: str = "green"  # "green", "yellow", "red"
    signal_timer: float = 0.0
    signal_cycle: float = 30.0  # seconds per full cycle
    pollution_level: float = 0.0  # 0-100 scale
    noise_level: float = 0.0  # in dB approximation (0-100)


@dataclass
class RoadSegment:
    """An edge in the city graph representing a road segment."""
    id: str
    from_node: str
    to_node: str
    length: float  # in meters
    capacity: int = 40  # max vehicles
    current_vehicles: int = 0
    speed_limit: float = 50.0  # km/h
    current_avg_speed: float = 50.0
    road_type: str = "local"  # "highway", "main", "local"
    honking_rate: float = 0.3  # probability of honking per vehicle per tick
    is_closed: bool = False
    accident_active: bool = False
    pollution_contribution: float = 0.0
    noise_contribution: float = 0.0


class CityGraph:
    """
    Procedurally generated grid city with varied road types.
    
    Low-latency design:
    - Pre-computed node/edge lookups via dictionaries
    - Cached zone mappings for fast policy application
    - NumPy arrays for batch pollution/noise calculations
    """

    # Center coordinates for the city (Connaught Place, New Delhi)
    CENTER_LAT = 28.6304
    CENTER_LNG = 77.2177
    GRID_SPACING = 0.003  # kept for compatibility

    def __init__(self, grid_size: int = 8):
        self.grid_size = grid_size
        self.graph = nx.DiGraph()
        self.intersections: dict[str, Intersection] = {}
        self.road_segments: dict[str, RoadSegment] = {}
        self.zones: dict[str, list[str]] = {}  # zone_id -> list of node_ids
        self._edge_index: dict[tuple[str, str], str] = {}  # (from, to) -> edge_id
        # Adjacency cache for fast neighbour iteration (node -> list[(neighbor_id, RoadSegment)])
        self._adj: dict[str, list[tuple[str, RoadSegment]]] = {}
        # Simple in-memory cache for shortest paths to avoid repeated expensive
        # networkx computations. Cache entries are TTL-based to tolerate
        # dynamic congestion; this is a pragmatic trade-off for latency.
        self._path_cache: dict[tuple[str, str], tuple[list[str], float]] = {}
        self._path_cache_ttl: float = 2.0  # seconds

        self._generate_city()

    def _generate_city(self):
        """Generate a circular city layout mimicking Connaught Place, New Delhi."""
        # 1. Create center node (Central Park)
        center_id = "N_center"
        center_intersection = Intersection(
            id=center_id,
            lat=self.CENTER_LAT,
            lng=self.CENTER_LNG,
            row=0,
            col=0,
            zone="Z_CENTER",
            signal_cycle=random.uniform(25, 40),
        )
        self.intersections[center_id] = center_intersection
        self.graph.add_node(center_id, data=center_intersection)
        self.zones["Z_CENTER"] = [center_id]

        # Rings radii (in meters)
        RINGS = [150.0, 270.0, 400.0, 600.0]
        # 12 Radials (every 30 degrees)
        NUM_RADIALS = 12

        # R = Earth radius
        R_EARTH = 6371000.0

        # Create nodes on concentric rings
        for ring_idx, radius in enumerate(RINGS):
            for angle_idx in range(NUM_RADIALS):
                node_id = f"N_{ring_idx}_{angle_idx}"
                angle_deg = angle_idx * (360.0 / NUM_RADIALS)
                angle_rad = math.radians(angle_deg)

                # Coordinate projection: radius in meters to delta lat/lng
                d_lat = (radius * math.sin(angle_rad)) / R_EARTH * (180.0 / math.pi)
                d_lng = (radius * math.cos(angle_rad)) / (R_EARTH * math.cos(math.radians(self.CENTER_LAT))) * (180.0 / math.pi)

                lat = self.CENTER_LAT + d_lat
                lng = self.CENTER_LNG + d_lng

                # Assign quadrants: Z_NE, Z_SE, Z_SW, Z_NW
                if angle_idx in [0, 1, 2]:
                    zone_id = "Z_NE"
                elif angle_idx in [3, 4, 5]:
                    zone_id = "Z_SE"
                elif angle_idx in [6, 7, 8]:
                    zone_id = "Z_SW"
                else:
                    zone_id = "Z_NW"

                intersection = Intersection(
                    id=node_id,
                    lat=lat,
                    lng=lng,
                    row=ring_idx + 1,
                    col=angle_idx,
                    zone=zone_id,
                    signal_cycle=random.uniform(25, 40),
                )
                self.intersections[node_id] = intersection
                self.graph.add_node(node_id, data=intersection)

                if zone_id not in self.zones:
                    self.zones[zone_id] = []
                self.zones[zone_id].append(node_id)

        # 2. Add road segments (edges)
        # Radial Connections
        for angle_idx in range(NUM_RADIALS):
            # Connect center to Ring 0 (Inner Circle)
            inner_id = f"N_0_{angle_idx}"
            self._add_road("N_center", inner_id, "main")
            self._add_road(inner_id, "N_center", "main")

            # Connect rings radially
            for ring_idx in range(len(RINGS) - 1):
                from_id = f"N_{ring_idx}_{angle_idx}"
                to_id = f"N_{ring_idx + 1}_{angle_idx}"
                
                # Highlight major radial roads as highways (every 90 degrees)
                road_type = "highway" if (angle_idx % 3 == 0) else "main"
                self._add_road(from_id, to_id, road_type)
                self._add_road(to_id, from_id, road_type)

        # Circular Connections (wrap around)
        for ring_idx, radius in enumerate(RINGS):
            for angle_idx in range(NUM_RADIALS):
                from_id = f"N_{ring_idx}_{angle_idx}"
                to_id = f"N_{ring_idx}_{(angle_idx + 1) % NUM_RADIALS}"

                # Inner circle (Ring 0) and Outer circle (Ring 2) are main corridors.
                # Middle circle (Ring 1) and Suburbs (Ring 3) are local service lanes.
                if ring_idx in [0, 2]:
                    road_type = "main"
                else:
                    road_type = "local"

                self._add_road(from_id, to_id, road_type)
                self._add_road(to_id, from_id, road_type)

    def _add_road(self, from_id: str, to_id: str, road_type: str = "local"):
        """Add a road segment between two intersections."""
        from_node = self.intersections[from_id]
        to_node = self.intersections[to_id]

        # Calculate real distance
        length = self._haversine(
            from_node.lat, from_node.lng, to_node.lat, to_node.lng
        )

        # Road properties based on type
        configs = {
            "highway": {"capacity": 80, "speed_limit": 80.0, "honking_rate": 0.1},
            "main": {"capacity": 50, "speed_limit": 60.0, "honking_rate": 0.25},
            "local": {"capacity": 30, "speed_limit": 40.0, "honking_rate": 0.4},
        }
        config = configs.get(road_type, configs["local"])

        edge_id = f"R_{from_id}_{to_id}"
        segment = RoadSegment(
            id=edge_id,
            from_node=from_id,
            to_node=to_id,
            length=length,
            road_type=road_type,
            **config,
        )

        self.road_segments[edge_id] = segment
        self.graph.add_edge(from_id, to_id, weight=length, segment=segment)
        self._edge_index[(from_id, to_id)] = edge_id
        # Maintain adjacency list for faster custom pathfinding
        if from_id not in self._adj:
            self._adj[from_id] = []
        self._adj[from_id].append((to_id, segment))

    def _add_highway_shortcuts(self):
        """No-op for circular layout."""
        pass

    def get_edge(self, from_id: str, to_id: str) -> Optional[RoadSegment]:
        """Get road segment between two nodes. O(1) lookup."""
        edge_id = self._edge_index.get((from_id, to_id))
        return self.road_segments.get(edge_id) if edge_id else None

    def get_neighbors(self, node_id: str) -> list[str]:
        """Get neighboring intersection IDs. O(degree) lookup."""
        return list(self.graph.successors(node_id))

    def get_zone_edges(self, zone_id: str) -> list[RoadSegment]:
        """Get all road segments within a zone. Used for policy targeting."""
        zone_nodes = set(self.zones.get(zone_id, []))
        edges = []
        for node_id in zone_nodes:
            for neighbor in self.graph.successors(node_id):
                if neighbor in zone_nodes:
                    seg = self.get_edge(node_id, neighbor)
                    if seg:
                        edges.append(seg)
        return edges

    def get_all_zone_ids(self) -> list[str]:
        """Return all zone IDs."""
        return list(self.zones.keys())

    def shortest_path(self, from_id: str, to_id: str) -> list[str]:
        """
        Find shortest path using Dijkstra, weighted by
        (length / speed_factor) to account for congestion.
        """
        import time

        # Try an external cache (Redis) first to share cached paths across
        # worker processes. Falls back to local in-memory cache implemented
        # earlier in this class.
        try:
            from app.cache import get as cache_get, set as cache_set
            cache_key = f"path:{from_id}:{to_id}"
            cached = cache_get(cache_key)
            if cached is not None:
                return cached
        except Exception:
            cache_get = None
            cache_set = None

        # Return cached path when available in-process and fresh
        key = (from_id, to_id)
        now = time.time()
        cache_entry = self._path_cache.get(key)
        if cache_entry:
            path, ts = cache_entry
            if now - ts < self._path_cache_ttl:
                return path
        try:
            import time as _time
            from app.metrics import PATHFIND_TIME

            # Dynamic weight: penalize congested roads
            def weight_fn(u, v, data):
                seg = data.get("segment")
                if seg and (seg.is_closed or seg.accident_active):
                    return float("inf")
                if seg:
                    congestion = seg.current_vehicles / max(seg.capacity, 1)
                    # Exponential penalty above 80% capacity
                    penalty = 1.0 + max(0, (congestion - 0.8)) * 10.0
                    return seg.length * penalty
                return data.get("weight", 1.0)

            # Heuristic using haversine distance
            def heuristic(u, v):
                nu = self.intersections.get(u)
                nv = self.intersections.get(v)
                if not nu or not nv:
                    return 0.0
                return self._haversine(nu.lat, nu.lng, nv.lat, nv.lng)

            # Try custom lightweight A* using adjacency cache to avoid networkx overhead
            start = _time.perf_counter()
            try:
                path = self._a_star(from_id, to_id, weight_fn, heuristic)
            except Exception:
                # Fall back to networkx A* for correctness
                try:
                    path = nx.astar_path(self.graph, from_id, to_id, heuristic=heuristic, weight=weight_fn)
                except Exception:
                    path = nx.shortest_path(self.graph, from_id, to_id, weight=weight_fn)
            finally:
                try:
                    PATHFIND_TIME.observe(_time.perf_counter() - start)
                except Exception:
                    pass
            return path
        except nx.NetworkXNoPath:
            return []
        finally:
            # Store computed path in process-local cache (even empty list)
            try:
                computed = locals().get('path', [])
                self._path_cache[key] = (computed, now)
                # Also populate external cache when available
                try:
                    if cache_set:
                        cache_set(cache_key, computed, ttl=self._path_cache_ttl)
                except Exception:
                    pass
            except Exception:
                pass

    def congestion_factor(self, edge: RoadSegment) -> float:
        """Calculate congestion factor (0.0 = free flow, 1.0 = gridlock)."""
        if edge.capacity <= 0:
            return 1.0
        ratio = edge.current_vehicles / edge.capacity
        return min(1.0, max(0.0, ratio))

    def effective_speed(self, edge: RoadSegment) -> float:
        """
        Calculate effective speed on a road segment.
        Uses BPR (Bureau of Public Roads) formula variant for realism.
        """
        cf = self.congestion_factor(edge)
        # BPR-inspired: speed drops exponentially with congestion
        # At 100% capacity, speed is ~25% of limit
        speed = edge.speed_limit * (1.0 / (1.0 + 3.0 * (cf ** 4)))
        return max(5.0, speed)  # minimum 5 km/h (crawling)

    def to_geojson(self) -> dict:
        """
        Export city as GeoJSON for Mapbox rendering.
        Returns both nodes (points) and edges (lines).
        """
        node_features = []
        for node in self.intersections.values():
            node_features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [node.lng, node.lat],
                },
                "properties": {
                    "id": node.id,
                    "zone": node.zone,
                    "pollution": node.pollution_level,
                    "noise": node.noise_level,
                    "signal": node.signal_state,
                },
            })

        edge_features = []
        for seg in self.road_segments.values():
            from_n = self.intersections[seg.from_node]
            to_n = self.intersections[seg.to_node]
            cf = self.congestion_factor(seg)
            speed = self.effective_speed(seg)

            edge_features.append({
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [from_n.lng, from_n.lat],
                        [to_n.lng, to_n.lat],
                    ],
                },
                "properties": {
                    "id": seg.id,
                    "from": seg.from_node,
                    "to": seg.to_node,
                    "road_type": seg.road_type,
                    "capacity": seg.capacity,
                    "vehicles": seg.current_vehicles,
                    "congestion": round(cf, 3),
                    "speed": round(speed, 1),
                    "speed_limit": seg.speed_limit,
                    "pollution": round(seg.pollution_contribution, 2),
                    "noise": round(seg.noise_contribution, 2),
                    "is_closed": seg.is_closed,
                    "accident": seg.accident_active,
                },
            })

        return {
            "nodes": {
                "type": "FeatureCollection",
                "features": node_features,
            },
            "edges": {
                "type": "FeatureCollection",
                "features": edge_features,
            },
            "zones": list(self.zones.keys()),
            "center": [self.CENTER_LNG, self.CENTER_LAT],
            "grid_size": self.grid_size,
        }

    def get_metrics_snapshot(self) -> dict:
        """
        Fast aggregate metrics for the metrics bar.
        Uses pre-computed values — no iteration needed for display.
        """
        edges = list(self.road_segments.values())
        if not edges:
            return {}

        total_vehicles = sum(e.current_vehicles for e in edges)
        avg_speed = (
            np.mean([self.effective_speed(e) for e in edges if e.current_vehicles > 0])
            if total_vehicles > 0
            else 0
        )
        avg_congestion = np.mean([self.congestion_factor(e) for e in edges])
        total_pollution = sum(e.pollution_contribution for e in edges)
        total_noise = np.mean(
            [n.noise_level for n in self.intersections.values()]
        )
        active_accidents = sum(1 for e in edges if e.accident_active)

        return {
            "total_vehicles": int(total_vehicles),
            "avg_speed": round(float(avg_speed), 1),
            "avg_congestion": round(float(avg_congestion), 3),
            "pollution_index": round(float(total_pollution), 1),
            "noise_index": round(float(total_noise), 1),
            "active_accidents": active_accidents,
            "total_intersections": len(self.intersections),
            "total_roads": len(self.road_segments),
        }

    @staticmethod
    def _haversine(lat1, lng1, lat2, lng2) -> float:
        """Calculate distance in meters between two lat/lng points."""
        R = 6371000  # Earth radius in meters
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlam = math.radians(lng2 - lng1)
        a = (
            math.sin(dphi / 2) ** 2
            + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
        )
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    def _a_star(self, start: str, goal: str, weight_fn, heuristic) -> list[str]:
        """Lightweight A* implementation using adjacency cache.

        This avoids some of the overhead of NetworkX for repeated pathfinding
        on a moderately-sized graph where Python-level loops are faster.
        Raises NetworkXNoPath on failure to find a path.
        """
        import heapq

        if start == goal:
            return [start]

        open_heap = []
        heapq.heappush(open_heap, (heuristic(start, goal), start))
        came_from: dict[str, str] = {}
        g_score: dict[str, float] = {start: 0.0}
        closed = set()

        while open_heap:
            _, current = heapq.heappop(open_heap)
            if current in closed:
                continue
            if current == goal:
                # Reconstruct path
                path = [current]
                while current in came_from:
                    current = came_from[current]
                    path.append(current)
                path.reverse()
                return path

            closed.add(current)

            for neighbor_id, seg in self._adj.get(current, []):
                tentative_g = g_score[current] + weight_fn(current, neighbor_id, {"segment": seg})
                if tentative_g == float("inf"):
                    continue
                if neighbor_id not in g_score or tentative_g < g_score[neighbor_id]:
                    g_score[neighbor_id] = tentative_g
                    f = tentative_g + heuristic(neighbor_id, goal)
                    heapq.heappush(open_heap, (f, neighbor_id))
                    came_from[neighbor_id] = current

        # No path found
        raise nx.NetworkXNoPath(start, goal)
