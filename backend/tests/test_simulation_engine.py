import pytest

# Skip tests if numpy is not available to avoid requiring a heavy build toolchain here
pytest.importorskip("numpy")

from app.simulation.engine import SimulationEngine


def test_simulation_engine_state_and_delta():
    eng = SimulationEngine(grid_size=3)

    # Full state snapshot
    full = eng.get_full_state()
    assert isinstance(full, dict)
    assert full.get("type") == "full_state"
    assert "city" in full and "metrics" in full

    # Metrics snapshot includes expected keys
    metrics = eng.get_metrics()
    assert isinstance(metrics, dict)
    assert "tick" in metrics and "pollution_index" in metrics and "noise_index" in metrics

    # Build a delta with no changes and verify structure
    delta = eng._build_delta({}, set(), set(), {}, set())
    assert isinstance(delta, dict)
    assert delta.get("type") == "state_update"
    assert "edges_changed" in delta and isinstance(delta["edges_changed"], list)
    assert "nodes_changed" in delta and isinstance(delta["nodes_changed"], list)
    assert "vehicles" in delta and isinstance(delta["vehicles"], list)


def test_cycle_signals_returns_set_and_updates_nodes():
    eng = SimulationEngine(grid_size=2)
    changed = eng._cycle_signals()
    assert isinstance(changed, set)
    # After cycling, nodes in city should have signal_state set
    for node in eng.city.intersections.values():
        assert hasattr(node, "signal_state")
        assert node.signal_state in {"green", "yellow", "red"}
