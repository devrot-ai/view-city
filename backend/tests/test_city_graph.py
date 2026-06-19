import pytest

# Skip tests if numpy is not available to avoid requiring a heavy build toolchain here
pytest.importorskip("numpy")

from app.models.city_graph import CityGraph


def test_city_generation_and_geojson():
    city = CityGraph(grid_size=4)

    # Basic generation checks
    assert len(city.intersections) > 0
    assert len(city.road_segments) > 0
    assert "N_center" in city.intersections

    geo = city.to_geojson()
    assert "nodes" in geo and "edges" in geo
    assert isinstance(geo["nodes"]["features"], list)


def test_zone_edges_and_metrics():
    city = CityGraph(grid_size=4)

    zones = city.get_all_zone_ids()
    assert isinstance(zones, list)

    # Find a zone with at least one edge
    zone_with_edges = None
    for z in zones:
        edges = city.get_zone_edges(z)
        if edges:
            zone_with_edges = z
            break

    assert zone_with_edges is not None, "No zone with edges found"

    edges = city.get_zone_edges(zone_with_edges)
    assert isinstance(edges, list)
    for e in edges:
        assert hasattr(e, "id")


def test_congestion_and_effective_speed_bounds():
    city = CityGraph(grid_size=3)
    seg = next(iter(city.road_segments.values()))

    # Fill to capacity and test congestion factor
    seg.current_vehicles = seg.capacity
    cf = city.congestion_factor(seg)
    assert cf == 1.0

    speed = city.effective_speed(seg)
    # Effective speed should be at least the minimum crawl speed
    assert speed >= 5.0
