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
from app.simulation.worker import start_worker
import asyncio

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

# Optional worker process and queue (populated when settings.use_sim_worker is True)
_worker_proc = None
_worker_queue = None
_latest_snapshot = None


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

    # Optionally start simulation worker and forward its deltas to clients
    if settings.use_sim_worker:
        try:
            global _worker_proc, _worker_queue
            _worker_proc, _worker_queue = start_worker(grid_size=settings.grid_size)
            logger.info("Started simulation worker pid=%s", getattr(_worker_proc, 'pid', None))

            async def _forward_worker_queue():
                loop = asyncio.get_running_loop()
                # Continually read from the blocking multiprocessing.Queue using a threadpool
                while _worker_proc.is_alive():
                    try:
                        delta = await loop.run_in_executor(None, _worker_queue.get)
                        try:
                            await manager.broadcast(delta)
                        except Exception:
                            pass
                    except Exception:
                        await asyncio.sleep(0.01)

                # Drain any remaining items
                while _worker_queue and not _worker_queue.empty():
                    try:
                        delta = _worker_queue.get_nowait()
                        try:
                            await manager.broadcast(delta)
                        except Exception:
                            pass
                    except Exception:
                        break

            asyncio.create_task(_forward_worker_queue())
        except Exception:
            logger.exception("Failed to start simulation worker")

    yield

    # Teardown
    # Stop main engine if running
    await engine.stop()

    # If a worker process was started, terminate it
    try:
        if _worker_proc is not None:
            _worker_proc.terminate()
            _worker_proc.join(timeout=2.0)
    except Exception:
        pass
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
