from fastapi.testclient import TestClient

import pytest

# Skip heavy tests if numpy is missing to keep test suite light in constrained envs
pytest.importorskip("numpy")

from app.main import app


def test_health_and_prometheus_metrics_endpoints():
    client = TestClient(app)

    # Health endpoint returns JSON with expected keys
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") == "ok"
    assert "tick" in data

    # Prometheus-style metrics endpoint returns plain text exposition
    r2 = client.get("/api/metrics/prometheus")
    assert r2.status_code == 200
    text = r2.text
    assert "city_tick" in text
    assert "city_active_vehicles" in text
