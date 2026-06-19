"""
Pydantic schemas for request/response validation.
Keeps API contracts clear and enables automatic OpenAPI docs.
"""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ── Policy Types ──────────────────────────────────────────────

class PolicyType(str, Enum):
    BAN_HONKING = "BAN_HONKING"
    CLOSE_ROAD = "CLOSE_ROAD"
    SPEED_LIMIT = "SPEED_LIMIT"
    GREEN_CORRIDOR = "GREEN_CORRIDOR"


class PolicyApplyRequest(BaseModel):
    """Request to apply a policy to a zone or specific edges."""
    policy_type: PolicyType
    zone_id: Optional[str] = Field(None, description="Target zone ID (e.g., 'Z01')")
    edge_ids: Optional[list[str]] = Field(None, description="Specific edge IDs to target")
    parameters: Optional[dict] = Field(
        default_factory=dict,
        description="Policy-specific parameters (e.g., {'speed_limit': 30})",
    )


class PolicyResetRequest(BaseModel):
    """Request to reset policies."""
    zone_id: Optional[str] = Field(None, description="Zone to reset, or None for all")
    policy_type: Optional[PolicyType] = Field(None, description="Specific policy to reset")
    edge_ids: Optional[list[str]] = Field(None, description="Specific edge IDs to reset")


class PolicyInfo(BaseModel):
    """Information about an available policy."""
    type: PolicyType
    name: str
    description: str
    default_parameters: dict


# ── Simulation Control ───────────────────────────────────────

class SimulationAction(str, Enum):
    PLAY = "play"
    PAUSE = "pause"
    STEP = "step"  # advance one tick
    RESET = "reset"


class SimulationControlRequest(BaseModel):
    """Request to control the simulation."""
    action: SimulationAction
    speed: Optional[float] = Field(
        None,
        ge=0.1,
        le=10.0,
        description="Simulation speed multiplier (0.1x to 10x)",
    )


# ── Response Models ──────────────────────────────────────────

class MetricsResponse(BaseModel):
    """Aggregate city metrics."""
    total_vehicles: int = 0
    avg_speed: float = 0.0
    avg_congestion: float = 0.0
    pollution_index: float = 0.0
    noise_index: float = 0.0
    active_accidents: int = 0
    total_intersections: int = 0
    total_roads: int = 0
    tick: int = 0
    sim_time: float = 0.0
    is_running: bool = False


class PolicyImpactResponse(BaseModel):
    """Before/after impact of a policy change."""
    policy_type: PolicyType
    zone_id: Optional[str] = None
    before: dict = {}
    after: dict = {}
    changes: dict = {}  # percentage changes
    summary: str = ""


class SimulationStateMessage(BaseModel):
    """WebSocket message format for simulation state updates."""
    type: str = "state_update"
    tick: int = 0
    sim_time: float = 0.0
    metrics: dict = {}
    edges_changed: list[dict] = []  # only edges that changed — delta encoding
    nodes_changed: list[dict] = []
    vehicles: list[dict] = []
    accidents: list[dict] = []
    active_policies: list[str] = []
