"""
Policy Engine — Apply and manage traffic policies.

Policies modify the city graph's edge/node properties to simulate
real-world traffic interventions. Each policy:
1. Captures "before" metrics snapshot
2. Applies changes to affected edges/nodes
3. Captures "after" metrics snapshot
4. Returns impact analysis

All lookups are O(1) via dict keys. Zone -> edges via pre-computed mapping.
"""

from typing import Optional

from app.models.city_graph import CityGraph
from app.models.schemas import PolicyType


class PolicyEngine:
    """Manages active policies and their effects on the city graph."""

    # Policy definitions with descriptions and defaults
    POLICY_INFO = {
        PolicyType.BAN_HONKING: {
            "name": "Ban Honking",
            "description": "Prohibit vehicle honking in a zone. Reduces noise by 30-50%.",
            "default_parameters": {"zone_id": None},
        },
        PolicyType.CLOSE_ROAD: {
            "name": "Close Road",
            "description": "Close a road segment to all traffic. Forces rerouting.",
            "default_parameters": {"edge_ids": []},
        },
        PolicyType.SPEED_LIMIT: {
            "name": "Speed Limit",
            "description": "Impose a lower speed limit in a zone. Reduces accidents and changes flow.",
            "default_parameters": {"zone_id": None, "speed_limit": 30.0},
        },
        PolicyType.GREEN_CORRIDOR: {
            "name": "Green Corridor",
            "description": "Prioritize green signals along a corridor. Reduces pollution and congestion.",
            "default_parameters": {"zone_id": None, "green_time_multiplier": 1.5},
        },
    }

    def __init__(self, city: CityGraph):
        self.city = city
        # Active policies: key = "{policy_type}_{zone_or_edge}" -> policy data
        self.active_policies: dict[str, dict] = {}
        # Original values backup for reset: key -> {edge_id: {field: original_value}}
        self._originals: dict[str, dict] = {}

    def apply_policy(
        self,
        policy_type: PolicyType,
        zone_id: Optional[str] = None,
        edge_ids: Optional[list[str]] = None,
        parameters: Optional[dict] = None,
    ) -> dict:
        """
        Apply a policy and return before/after impact analysis.
        
        Returns:
            dict with before, after, changes, and summary
        """
        params = parameters or {}
        
        # Generate a unique key for the policy
        if policy_type == PolicyType.CLOSE_ROAD and edge_ids:
            edges_str = "-".join(sorted(edge_ids))
            policy_key = f"{policy_type.value}_edges_{edges_str}"
        elif zone_id:
            policy_key = f"{policy_type.value}_{zone_id}"
        else:
            policy_key = f"{policy_type.value}_global"

        # Capture before metrics
        before = self._capture_zone_metrics(zone_id)

        # Store original values for rollback
        originals = {}

        # Apply policy based on type
        if policy_type == PolicyType.BAN_HONKING:
            originals = self._apply_ban_honking(zone_id)
        elif policy_type == PolicyType.CLOSE_ROAD:
            target_edges = edge_ids or []
            originals = self._apply_close_road(target_edges)
        elif policy_type == PolicyType.SPEED_LIMIT:
            speed = params.get("speed_limit", 30.0)
            originals = self._apply_speed_limit(zone_id, speed)
        elif policy_type == PolicyType.GREEN_CORRIDOR:
            multiplier = params.get("green_time_multiplier", 1.5)
            originals = self._apply_green_corridor(zone_id, multiplier)

        # Register active policy
        self.active_policies[policy_key] = {
            "type": policy_type.value,
            "zone_id": zone_id,
            "edge_ids": edge_ids,
            "parameters": params,
        }
        self._originals[policy_key] = originals

        # Capture after metrics
        after = self._capture_zone_metrics(zone_id)

        # Calculate changes
        changes = self._calculate_changes(before, after)
        summary = self._generate_summary(policy_type, zone_id, changes)

        return {
            "policy_type": policy_type.value,
            "zone_id": zone_id,
            "before": before,
            "after": after,
            "changes": changes,
            "summary": summary,
        }

    def reset_policy(
        self,
        zone_id: Optional[str] = None,
        policy_type: Optional[PolicyType] = None,
        edge_ids: Optional[list[str]] = None,
    ) -> dict:
        """Reset specific or all policies, restoring original values."""
        removed = []

        keys_to_remove = []
        for key, policy in self.active_policies.items():
            # Filter by zone and/or type if specified
            if zone_id and policy.get("zone_id") != zone_id:
                continue
            if policy_type and policy.get("type") != policy_type.value:
                continue
            # If edge_ids are specified, filter by edge_ids
            if edge_ids and policy.get("edge_ids"):
                # If they have no common elements, skip
                if not set(edge_ids).intersection(set(policy.get("edge_ids", []))):
                    continue
            keys_to_remove.append(key)

        for key in keys_to_remove:
            # Restore original values
            originals = self._originals.pop(key, {})
            self._restore_originals(originals)
            removed.append(self.active_policies.pop(key))

        return {
            "removed_count": len(removed),
            "removed_policies": removed,
            "remaining_active": list(self.active_policies.keys()),
        }

    def _apply_ban_honking(self, zone_id: Optional[str]) -> dict:
        """Set honking_rate=0 on all edges in zone."""
        originals = {}
        edges = self._get_target_edges(zone_id)

        for seg in edges:
            originals[seg.id] = {"honking_rate": seg.honking_rate}
            seg.honking_rate = 0.0

        return originals

    def _apply_close_road(self, edge_ids: list[str]) -> dict:
        """Close specific road segments."""
        originals = {}

        for eid in edge_ids:
            seg = self.city.road_segments.get(eid)
            if seg:
                originals[seg.id] = {
                    "is_closed": seg.is_closed,
                    "capacity": seg.capacity,
                }
                seg.is_closed = True
                seg.capacity = 0

        return originals

    def _apply_speed_limit(self, zone_id: Optional[str], speed: float) -> dict:
        """Apply speed limit to all edges in zone."""
        originals = {}
        edges = self._get_target_edges(zone_id)

        for seg in edges:
            originals[seg.id] = {"speed_limit": seg.speed_limit}
            seg.speed_limit = min(seg.speed_limit, speed)

        return originals

    def _apply_green_corridor(self, zone_id: Optional[str], multiplier: float) -> dict:
        """Extend green time for intersections in zone."""
        originals = {}
        nodes = self.city.zones.get(zone_id, []) if zone_id else list(self.city.intersections.keys())

        for nid in nodes:
            node = self.city.intersections.get(nid)
            if node:
                originals[nid] = {"signal_cycle": node.signal_cycle}
                # Extend green phase by increasing total cycle (green portion stays same ratio)
                node.signal_cycle *= multiplier

        return originals

    def _restore_originals(self, originals: dict):
        """Restore original values from backup."""
        for obj_id, values in originals.items():
            # Check if it's an edge or node
            seg = self.city.road_segments.get(obj_id)
            if seg:
                for field, val in values.items():
                    setattr(seg, field, val)
                continue

            node = self.city.intersections.get(obj_id)
            if node:
                for field, val in values.items():
                    setattr(node, field, val)

    def _get_target_edges(self, zone_id: Optional[str]):
        """Get edges targeted by a zone policy."""
        if zone_id:
            return self.city.get_zone_edges(zone_id)
        return list(self.city.road_segments.values())

    def _capture_zone_metrics(self, zone_id: Optional[str]) -> dict:
        """Capture current metrics for a zone (or whole city)."""
        import numpy as np

        if zone_id:
            edges = self.city.get_zone_edges(zone_id)
            nodes_ids = self.city.zones.get(zone_id, [])
            nodes = [self.city.intersections[n] for n in nodes_ids if n in self.city.intersections]
        else:
            edges = list(self.city.road_segments.values())
            nodes = list(self.city.intersections.values())

        if not edges:
            return {}

        return {
            "avg_speed": round(float(np.mean([self.city.effective_speed(e) for e in edges])), 1),
            "avg_congestion": round(float(np.mean([self.city.congestion_factor(e) for e in edges])), 3),
            "total_vehicles": sum(e.current_vehicles for e in edges),
            "avg_pollution": round(float(np.mean([n.pollution_level for n in nodes])), 1) if nodes else 0.0,
            "avg_noise": round(float(np.mean([n.noise_level for n in nodes])), 1) if nodes else 0.0,
            "avg_honking_rate": round(float(np.mean([e.honking_rate for e in edges])), 3),
        }

    def _calculate_changes(self, before: dict, after: dict) -> dict:
        """Calculate percentage changes between before and after."""
        changes = {}
        for key in before:
            b = before.get(key, 0)
            a = after.get(key, 0)
            if b != 0:
                pct = round(((a - b) / abs(b)) * 100, 1)
            else:
                pct = 0.0
            changes[key] = {"before": b, "after": a, "change_pct": pct}
        return changes

    def _generate_summary(self, policy_type: PolicyType, zone_id: Optional[str], changes: dict) -> str:
        """Generate human-readable summary of policy impact."""
        zone_str = f"zone {zone_id}" if zone_id else "the entire city"

        if policy_type == PolicyType.BAN_HONKING:
            noise_change = changes.get("avg_noise", {}).get("change_pct", 0)
            return f"Honking banned in {zone_str}. Noise impact: {noise_change:+.1f}%"
        elif policy_type == PolicyType.CLOSE_ROAD:
            congestion_change = changes.get("avg_congestion", {}).get("change_pct", 0)
            return f"Road closed. Congestion impact: {congestion_change:+.1f}%"
        elif policy_type == PolicyType.SPEED_LIMIT:
            speed_change = changes.get("avg_speed", {}).get("change_pct", 0)
            return f"Speed limit applied in {zone_str}. Speed impact: {speed_change:+.1f}%"
        elif policy_type == PolicyType.GREEN_CORRIDOR:
            pollution_change = changes.get("avg_pollution", {}).get("change_pct", 0)
            return f"Green corridor set in {zone_str}. Pollution impact: {pollution_change:+.1f}%"

        return f"Policy {policy_type.value} applied to {zone_str}."

    def get_active_policy_list(self) -> list[str]:
        """Get list of active policy keys."""
        return list(self.active_policies.keys())

    def get_available_policies(self) -> list[dict]:
        """Get list of all available policy types with descriptions."""
        return [
            {
                "type": pt.value,
                "name": info["name"],
                "description": info["description"],
                "default_parameters": info["default_parameters"],
            }
            for pt, info in self.POLICY_INFO.items()
        ]
