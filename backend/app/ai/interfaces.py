"""
AI Interfaces — Abstract classes for future GNN/RL implementation.

Phase 1 (current): Rule-based mock implementations that analyze
current metrics and return heuristic recommendations.

Phase 2 (future): Replace with trained GNN for traffic prediction
and RL agent for policy optimization.

The interfaces define clear contracts so the rest of the system
doesn't need to change when real AI models are plugged in.
"""

from abc import ABC, abstractmethod
from typing import Optional

import numpy as np

from app.models.city_graph import CityGraph
from app.models.schemas import PolicyType


class TrafficPredictor(ABC):
    """
    Abstract interface for traffic prediction.
    
    Phase 2: Implement with Graph Neural Network (GNN) that predicts
    traffic flow, congestion hotspots, and accident probabilities
    based on current graph state and historical patterns.
    """

    @abstractmethod
    def predict_congestion(self, city: CityGraph, horizon_ticks: int = 30) -> dict:
        """
        Predict future congestion levels for each edge.
        
        Args:
            city: Current city graph state
            horizon_ticks: How many ticks ahead to predict
            
        Returns:
            dict of edge_id -> predicted_congestion_factor
        """
        pass

    @abstractmethod
    def predict_accidents(self, city: CityGraph) -> list[dict]:
        """
        Predict likely accident locations.
        
        Returns:
            list of {edge_id, probability, severity} dicts
        """
        pass


class PolicyOptimizer(ABC):
    """
    Abstract interface for policy optimization.
    
    Phase 2: Implement with Reinforcement Learning (RL) agent that
    learns optimal policy combinations to minimize congestion,
    pollution, and noise while maintaining traffic flow.
    """

    @abstractmethod
    def recommend_policies(self, city: CityGraph, metrics: dict) -> list[dict]:
        """
        Recommend policies based on current state.
        
        Returns:
            list of {policy_type, zone_id, parameters, priority, expected_impact} dicts
        """
        pass

    @abstractmethod
    def evaluate_policy(self, city: CityGraph, policy_type: str, zone_id: str) -> dict:
        """
        Evaluate the expected impact of a policy before applying.
        
        Returns:
            dict with expected changes in metrics
        """
        pass


# ── Mock Implementations (Phase 1) ──────────────────────────────


class RuleBasedPredictor(TrafficPredictor):
    """
    Simple rule-based traffic prediction.
    Uses current state trends to estimate future congestion.
    """

    def predict_congestion(self, city: CityGraph, horizon_ticks: int = 30) -> dict:
        """Predict congestion based on current trends (linear extrapolation)."""
        predictions = {}
        for edge_id, seg in city.road_segments.items():
            current = city.congestion_factor(seg)
            # Simple linear trend: if congestion is rising, predict it continues
            trend = 0.01 if current > 0.5 else -0.005
            predicted = min(1.0, max(0.0, current + trend * horizon_ticks))
            predictions[edge_id] = round(predicted, 3)
        return predictions

    def predict_accidents(self, city: CityGraph) -> list[dict]:
        """Predict accident hotspots based on current congestion and speed."""
        hotspots = []
        for edge_id, seg in city.road_segments.items():
            if seg.current_vehicles < 3:
                continue

            congestion = city.congestion_factor(seg)
            speed_diff = abs(seg.speed_limit - seg.current_avg_speed)

            probability = min(1.0, congestion * 0.3 + speed_diff * 0.01)
            if probability > 0.2:
                hotspots.append({
                    "edge_id": edge_id,
                    "probability": round(probability, 3),
                    "severity": round(congestion * 0.7, 2),
                })

        # Sort by probability descending
        hotspots.sort(key=lambda x: x["probability"], reverse=True)
        return hotspots[:10]  # Top 10 hotspots


class RuleBasedOptimizer(PolicyOptimizer):
    """
    Rule-based policy optimizer using heuristic thresholds.
    Analyzes zone-level metrics and recommends appropriate policies.
    """

    def recommend_policies(self, city: CityGraph, metrics: dict) -> list[dict]:
        """Generate policy recommendations based on current state."""
        recommendations = []

        for zone_id in city.get_all_zone_ids():
            zone_edges = city.get_zone_edges(zone_id)
            if not zone_edges:
                continue

            zone_nodes = city.zones.get(zone_id, [])

            # Calculate zone-level metrics
            avg_congestion = float(np.mean([city.congestion_factor(e) for e in zone_edges]))
            avg_noise = float(np.mean([
                city.intersections[n].noise_level
                for n in zone_nodes
                if n in city.intersections
            ])) if zone_nodes else 0.0
            avg_pollution = float(np.mean([
                city.intersections[n].pollution_level
                for n in zone_nodes
                if n in city.intersections
            ])) if zone_nodes else 0.0
            avg_honking = float(np.mean([e.honking_rate for e in zone_edges]))

            # Rule 1: High noise + honking → BAN_HONKING
            if avg_noise > 50 and avg_honking > 0.2:
                priority = min(1.0, avg_noise / 100 * 0.8 + avg_honking * 0.5)
                recommendations.append({
                    "policy_type": PolicyType.BAN_HONKING.value,
                    "zone_id": zone_id,
                    "parameters": {},
                    "priority": round(priority, 2),
                    "expected_impact": f"Noise reduction: ~{int(avg_honking * 40)}%",
                    "reason": f"Zone {zone_id} noise level ({avg_noise:.0f}) exceeds threshold",
                })

            # Rule 2: High congestion → SPEED_LIMIT
            if avg_congestion > 0.6:
                priority = min(1.0, avg_congestion * 0.9)
                recommendations.append({
                    "policy_type": PolicyType.SPEED_LIMIT.value,
                    "zone_id": zone_id,
                    "parameters": {"speed_limit": 30.0},
                    "priority": round(priority, 2),
                    "expected_impact": f"Congestion reduction: ~{int(avg_congestion * 20)}%",
                    "reason": f"Zone {zone_id} congestion ({avg_congestion:.2f}) is critical",
                })

            # Rule 3: High pollution → GREEN_CORRIDOR
            if avg_pollution > 40:
                priority = min(1.0, avg_pollution / 100 * 0.7)
                recommendations.append({
                    "policy_type": PolicyType.GREEN_CORRIDOR.value,
                    "zone_id": zone_id,
                    "parameters": {"green_time_multiplier": 1.5},
                    "priority": round(priority, 2),
                    "expected_impact": f"Pollution reduction: ~{int(avg_pollution * 0.3)}%",
                    "reason": f"Zone {zone_id} pollution ({avg_pollution:.0f}) is elevated",
                })

        # Sort by priority descending
        recommendations.sort(key=lambda x: x["priority"], reverse=True)
        return recommendations[:5]  # Top 5 recommendations

    def evaluate_policy(self, city: CityGraph, policy_type: str, zone_id: str) -> dict:
        """Estimate policy impact without applying it."""
        zone_edges = city.get_zone_edges(zone_id)
        if not zone_edges:
            return {"error": "No edges in zone"}

        avg_congestion = float(np.mean([city.congestion_factor(e) for e in zone_edges]))
        zone_nodes = city.zones.get(zone_id, [])
        avg_noise = float(np.mean([
            city.intersections[n].noise_level
            for n in zone_nodes
            if n in city.intersections
        ])) if zone_nodes else 0.0

        estimates = {
            PolicyType.BAN_HONKING.value: {
                "noise_change_pct": -35.0,
                "congestion_change_pct": 0.0,
                "pollution_change_pct": 0.0,
            },
            PolicyType.SPEED_LIMIT.value: {
                "noise_change_pct": -10.0,
                "congestion_change_pct": -15.0,
                "pollution_change_pct": 5.0,  # lower speed = more idle pollution
            },
            PolicyType.GREEN_CORRIDOR.value: {
                "noise_change_pct": -5.0,
                "congestion_change_pct": -20.0,
                "pollution_change_pct": -25.0,
            },
            PolicyType.CLOSE_ROAD.value: {
                "noise_change_pct": -50.0,
                "congestion_change_pct": 30.0,  # traffic goes elsewhere
                "pollution_change_pct": -40.0,
            },
        }

        return estimates.get(policy_type, {"error": "Unknown policy type"})


class TrafficAdvisor:
    """
    High-level AI advisor that combines predictor + optimizer.
    Provides actionable recommendations and can auto-apply them.
    """

    def __init__(self, city: CityGraph):
        self.city = city
        self.predictor = RuleBasedPredictor()
        self.optimizer = RuleBasedOptimizer()
        self.autopilot: bool = False
        self._last_recommendations: list[dict] = []

    def analyze(self, metrics: dict) -> dict:
        """Run full analysis and return recommendations."""
        recommendations = self.optimizer.recommend_policies(self.city, metrics)
        accident_hotspots = self.predictor.predict_accidents(self.city)

        self._last_recommendations = recommendations

        return {
            "recommendations": recommendations,
            "accident_hotspots": accident_hotspots[:5],
            "autopilot": self.autopilot,
        }

    def get_recommendations(self) -> list[dict]:
        """Get last computed recommendations."""
        return self._last_recommendations

    def toggle_autopilot(self) -> bool:
        """Toggle autopilot mode. Returns new state."""
        self.autopilot = not self.autopilot
        return self.autopilot
