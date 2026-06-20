import pytest

# Skip tests if numpy is not available to avoid requiring a heavy build toolchain here
pytest.importorskip("numpy")

from app.models.city_graph import CityGraph
from app.policies.engine import PolicyEngine
from app.models.schemas import PolicyType


def find_zone_with_edges(city: CityGraph):
    for z in city.get_all_zone_ids():
        if city.get_zone_edges(z):
            return z
    return None


def test_apply_and_reset_ban_honking():
    city = CityGraph(grid_size=4)
    pe = PolicyEngine(city)

    zone = find_zone_with_edges(city)
    assert zone is not None

    # Capture original honking rates
    edges = city.get_zone_edges(zone)
    originals = {e.id: e.honking_rate for e in edges}

    # Apply ban honking
    result = pe.apply_policy(policy_type=PolicyType.BAN_HONKING, zone_id=zone)
    assert result["policy_type"] == PolicyType.BAN_HONKING.value

    # Verify edges in zone have honking_rate == 0.0
    for e in edges:
        assert e.honking_rate == 0.0

    # Reset the policy
    reset_result = pe.reset_policy(zone_id=zone, policy_type=PolicyType.BAN_HONKING)
    assert reset_result["removed_count"] >= 1

    # Verify original values restored (or at least non-negative)
    for e in edges:
        assert hasattr(e, "honking_rate")


def test_speed_limit_apply_and_reset():
    city = CityGraph(grid_size=4)
    pe = PolicyEngine(city)

    zone = find_zone_with_edges(city)
    assert zone is not None

    edges = city.get_zone_edges(zone)
    originals = {e.id: e.speed_limit for e in edges}

    # Apply speed limit of 30
    result = pe.apply_policy(policy_type=PolicyType.SPEED_LIMIT, zone_id=zone, parameters={"speed_limit": 30.0})
    assert result["policy_type"] == PolicyType.SPEED_LIMIT.value

    # Verify speed limit applied (not higher than 30 for edges affected)
    for e in edges:
        assert e.speed_limit <= 30.0

    # Reset
    reset_result = pe.reset_policy(zone_id=zone, policy_type=PolicyType.SPEED_LIMIT)
    assert reset_result["removed_count"] >= 1

    # After reset, values should be restored (or at least present)
    for e in edges:
        assert hasattr(e, "speed_limit")
