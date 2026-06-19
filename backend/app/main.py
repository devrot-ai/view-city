"""
FastAPI Application Entry Point.

Initializes the simulation engine, policy engine, and AI advisor.
Mounts REST routes and WebSocket endpoint.
Serves the React frontend as static files.
Configures CORS for development.
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.simulation.engine import SimulationEngine
from app.policies.engine import PolicyEngine
from app.ai.interfaces import TrafficAdvisor
from app.api.routes import create_routes
from app.api.websocket import websocket_endpoint, manager


# ── Global instances (in-memory "database") ──────────────────────
engine = SimulationEngine(grid_size=8)
policy_engine = PolicyEngine(engine.city)
advisor = TrafficAdvisor(engine.city)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle: setup and teardown."""
    # Setup: configure broadcast callback
    engine.set_broadcast_callback(manager.broadcast)
    print("[City] Digital Twin initialized")
    print("   Layout: Connaught Place, New Delhi")
    print(f"   Intersections: {len(engine.city.intersections)}")
    print(f"   Roads: {len(engine.city.road_segments)}")
    print(f"   Zones: {len(engine.city.zones)}")

    yield

    # Teardown
    await engine.stop()
    print("[Stop] Simulation stopped")


# ── FastAPI App ──────────────────────────────────────────────────
app = FastAPI(
    title="AI Traffic Control — Digital Twin City",
    description="Real-time city simulation with AI-powered traffic management",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS for frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount REST routes
api_router = create_routes(engine, policy_engine, advisor)
app.include_router(api_router)


# WebSocket endpoint
@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await websocket_endpoint(websocket, engine)


# Serve frontend static files (after Vite build)
frontend_dist = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "frontend",
    "dist",
)

if os.path.isdir(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve React SPA — all non-API routes go to index.html."""
        file_path = os.path.join(frontend_dist, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_dist, "index.html"))
