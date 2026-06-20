"""
WebSocket Handler — Real-time simulation state streaming.

Uses delta encoding: only sends entities that changed since last tick.
Manages multiple client connections with a connection manager.
Uses orjson for fast JSON serialization (~3-5x faster than stdlib json).
"""

import asyncio
import json
from typing import Optional

from fastapi import WebSocket, WebSocketDisconnect


class ConnectionManager:
    """
    Manages WebSocket connections for multiple clients.
    Thread-safe via asyncio single-threaded event loop.
    """

    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self._throttle_interval: float = 0.05  # 50ms = max 20 updates/sec
        self._last_broadcast_time: float = 0.0
        # Batch buffer: accumulate deltas during throttle window
        self._pending: list[dict] = []
        self._flush_task: Optional[asyncio.Task] = None

    async def connect(self, websocket: WebSocket):
        """Accept and register a new WebSocket connection."""
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        """Remove a disconnected WebSocket."""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, data: dict):
        """
        Broadcast data to all connected clients.
        Throttled to max 20 updates/sec to prevent flooding.
        """
        import time

        # Append to pending batch and schedule a flush if not already scheduled
        self._pending.append(data)

        if self._flush_task is not None and not self._flush_task.done():
            return

        async def _flush():
            try:
                await asyncio.sleep(self._throttle_interval)

                # Prepare batched payload
                batch = {
                    "type": "batch",
                    "messages": self._pending.copy()
                }

                # Reset buffer
                self._pending.clear()

                # Serialize once, send to all. Prefer orjson when available for speed.
                try:
                    import orjson
                    try:
                        message = orjson.dumps(batch).decode('utf-8')
                    except Exception:
                        message = json.dumps(batch, default=str)
                except Exception:
                    try:
                        message = json.dumps(batch, default=str)
                    except (TypeError, ValueError):
                        return

                disconnected = []
                for connection in list(self.active_connections):
                    try:
                        await connection.send_text(message)
                    except Exception:
                        disconnected.append(connection)

                # Clean up disconnected clients
                for conn in disconnected:
                    self.disconnect(conn)
            finally:
                self._flush_task = None

        # Schedule the flush task
        self._flush_task = asyncio.create_task(_flush())

    @property
    def client_count(self) -> int:
        return len(self.active_connections)


# Global connection manager instance
manager = ConnectionManager()


async def websocket_endpoint(websocket: WebSocket, engine):
    """
    WebSocket endpoint handler.
    
    On connect: sends full state snapshot.
    Then: receives control messages from client.
    Server pushes delta updates via broadcast callback on engine.
    """
    await manager.connect(websocket)

    try:
        # Send initial full state
        full_state = engine.get_full_state()
        await websocket.send_text(json.dumps(full_state, default=str))

        # Listen for client messages (control commands)
        while True:
            try:
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=60.0,  # Keep-alive timeout
                )

                # Parse client message
                try:
                    msg = json.loads(data)
                except json.JSONDecodeError:
                    continue

                msg_type = msg.get("type", "")

                if msg_type == "control":
                    action = msg.get("action", "")
                    if action == "play":
                        speed = msg.get("speed", 1.0)
                        engine.speed_multiplier = speed
                        await engine.start()
                    elif action == "pause":
                        await engine.stop()
                    elif action == "step":
                        await engine.step()
                    elif action == "reset":
                        engine.reset()
                        full_state = engine.get_full_state()
                        await websocket.send_text(
                            json.dumps(full_state, default=str)
                        )
                    elif action == "speed":
                        speed = msg.get("speed", 1.0)
                        engine.speed_multiplier = max(0.1, min(10.0, speed))

                elif msg_type == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))

            except asyncio.TimeoutError:
                # Send keep-alive ping
                try:
                    await websocket.send_text(json.dumps({"type": "ping"}))
                except Exception:
                    break

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        manager.disconnect(websocket)
