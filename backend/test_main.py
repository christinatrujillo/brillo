"""Run with: python3 test_main.py"""
from main import _point_in_polygon, buildings_to_obstacles


def square_building(lat, lon, half=0.0001, height=18.0):  # 0.0001° ≈ 11 m
    corners = [(lat - half, lon - half), (lat - half, lon + half),
               (lat + half, lon + half), (lat + half, lon - half), (lat - half, lon - half)]
    return {"height": height, "centroid_lat": lat, "centroid_lon": lon, "type": "test",
            "geometry": [{"lat": a, "lon": o} for a, o in corners]}


b = square_building(40.0, -3.0)
assert _point_in_polygon(40.0, -3.0, b["geometry"])
assert not _point_in_polygon(40.0003, -3.0, b["geometry"])

# Pin inside its own building, 5 m from that building's centre (the old check missed this),
# with a neighbour ~33 m north: only the neighbour should block the sun.
own = square_building(40.00005, -3.0)
neighbour = square_building(40.0003, -3.0)
obstacles = buildings_to_obstacles([own, neighbour], 40.0, -3.0)
assert len(obstacles) == 1 and obstacles[0].distance > 30, obstacles

print("ok")
