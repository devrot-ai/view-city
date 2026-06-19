"""
REST API Routes — FastAPI endpoints for city data, metrics, policies, and simulation control.

All endpoints return JSON. City data and metrics use pre-computed
values from the in-memory CityGraph — no DB queries needed.
"""

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    PolicyApplyRequest,
    PolicyResetRequest,
    SimulationControlRequest,
    SimulationAction,
    MetricsResponse,
    PolicyImpactResponse,
)

router = APIRouter(prefix="/api")


def create_routes(engine, policy_engine, advisor):
    """
    Factory function to create routes with injected dependencies.
    Called from main.py after engine is initialized.
    """

    @router.get("/city")
    async def get_city():
        """
        Get full city graph as GeoJSON.
        Called once on initial frontend load.
        """
        return engine.get_full_state()

    @router.get("/metrics")
    async def get_metrics():
        """Get current aggregate metrics snapshot."""
        return engine.get_metrics()

    @router.get("/policies/available")
    async def get_available_policies():
        """List all available policy types with descriptions."""
        return {
            "policies": policy_engine.get_available_policies(),
            "zones": engine.city.get_all_zone_ids(),
        }

    @router.get("/policies/active")
    async def get_active_policies():
        """Get currently active policies."""
        return {
            "active": policy_engine.active_policies,
            "count": len(policy_engine.active_policies),
        }

    @router.post("/policies/apply")
    async def apply_policy(request: PolicyApplyRequest):
        """Apply a traffic policy and return before/after impact analysis."""
        try:
            result = policy_engine.apply_policy(
                policy_type=request.policy_type,
                zone_id=request.zone_id,
                edge_ids=request.edge_ids,
                parameters=request.parameters,
            )
            return result
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

    @router.post("/policies/reset")
    async def reset_policies(request: PolicyResetRequest):
        """Reset policies (specific or all)."""
        result = policy_engine.reset_policy(
            zone_id=request.zone_id,
            policy_type=request.policy_type,
            edge_ids=request.edge_ids,
        )
        return result

    @router.post("/simulation/control")
    async def control_simulation(request: SimulationControlRequest):
        """Control simulation: play, pause, step, reset."""
        action = request.action

        if action == SimulationAction.PLAY:
            if request.speed is not None:
                engine.speed_multiplier = request.speed
            await engine.start()
            return {"status": "running", "speed": engine.speed_multiplier}

        elif action == SimulationAction.PAUSE:
            await engine.stop()
            return {"status": "paused", "tick": engine.tick_count}

        elif action == SimulationAction.STEP:
            await engine.step()
            return {"status": "stepped", "tick": engine.tick_count}

        elif action == SimulationAction.RESET:
            engine.reset()
            return {"status": "reset", "tick": 0}

        raise HTTPException(status_code=400, detail=f"Unknown action: {action}")

    @router.get("/ai/recommendations")
    async def get_recommendations():
        """Get AI-generated policy recommendations."""
        metrics = engine.get_metrics()
        analysis = advisor.analyze(metrics)
        return analysis

    @router.post("/ai/autopilot")
    async def toggle_autopilot():
        """Toggle AI autopilot mode."""
        new_state = advisor.toggle_autopilot()
        return {"autopilot": new_state}

    @router.get("/zones")
    async def get_zones():
        """Get all zone IDs and their node membership."""
        return {
            "zones": {
                zid: nodes for zid, nodes in engine.city.zones.items()
            }
        }

    @router.get("/zones/{zone_id}/metrics")
    async def get_zone_metrics(zone_id: str):
        """Get metrics for a specific zone."""
        if zone_id not in engine.city.zones:
            raise HTTPException(status_code=404, detail=f"Zone {zone_id} not found")

        from app.simulation.pollution import PollutionModel
        from app.simulation.noise import NoiseModel

        return {
            "zone_id": zone_id,
            "pollution": engine.pollution.get_zone_pollution(zone_id),
            "noise": engine.noise.get_zone_noise(zone_id),
            "node_count": len(engine.city.zones[zone_id]),
            "edge_count": len(engine.city.get_zone_edges(zone_id)),
        }

    return router
