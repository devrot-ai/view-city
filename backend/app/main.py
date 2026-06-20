"""
FastAPI Application Entry Point.

Initializes the simulation engine, policy engine, and AI advisor.
Mounts REST routes and WebSocket endpoint.
Serves the React frontend as static files.
Configures CORS for development.
"""

import os
from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.simulation.engine import SimulationEngine
from app.policies.engine import PolicyEngine
from app.ai.interfaces import TrafficAdvisor
from app.api.routes import create_routes
from app.api.websocket import websocket_endpoint, manager
from app.config import settings

# Configure structured logging for the application
logger = logging.getLogger("citysim")
logger.setLevel(logging.DEBUG if settings.debug else logging.INFO)

# Configure JSON logging when enabled via settings
try:
    if settings.json_logging:
        from pythonjsonlogger import jsonlogger

        handler = logging.StreamHandler()
        formatter = jsonlogger.JsonFormatter('%(asctime)s %(name)s %(levelname)s %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    else:
        logging.basicConfig(
            level=logging.DEBUG if settings.debug else logging.INFO,
            format="%(asctime)s %(levelname)s %(name)s %(message)s",
        )
except Exception:
    # Fallback to simple logging format
    logging.basicConfig(
        level=logging.DEBUG if settings.debug else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


# ── Global instances (in-memory "database") ──────────────────────
engine = SimulationEngine(grid_size=settings.grid_size)
policy_engine = PolicyEngine(engine.city)
advisor = TrafficAdvisor(engine.city)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle: setup and teardown."""
    # Setup: configure broadcast callback
    engine.set_broadcast_callback(manager.broadcast)
    logger.info("[City] Digital Twin initialized")
    logger.info("   Layout: Connaught Place, New Delhi")
    logger.info("   Intersections: %d", len(engine.city.intersections))
    logger.info("   Roads: %d", len(engine.city.road_segments))
    logger.info("   Zones: %d", len(engine.city.zones))

    yield

    # Teardown
    await engine.stop()
    logger.info("[Stop] Simulation stopped")


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
    allow_origins=settings.cors_list(),
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
