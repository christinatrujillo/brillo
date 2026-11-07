"""
Building + weather cache for Brillo.

Buildings: the world is split into a fixed grid of ~1 km squares ("cells").
Each cell is fetched from OpenStreetMap (Overpass) once, saved as a small
compressed file in backend/cache/buildings/, and reused after restarts.
  - Cells older than CELL_MAX_AGE_DAYS are re-downloaded.
  - The folder is capped at CACHE_MAX_BYTES; least recently used cells go first.

Weather: one Open-Meteo request per ~1 km area per hour, shared by every
restaurant in that area (kept in memory only).
"""

import gzip
import json
import math
import os
import threading
import time

from main import overpass_request, parse_overpass_buildings, fetch_weather

CELL_SIZE_DEG = 0.01             # ~1.1 km north-south, ~0.85 km east-west in Madrid
CELL_MAX_AGE_DAYS = 90
CACHE_MAX_BYTES = 100 * 1024 * 1024  # 100 MB
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache", "buildings")

_memory_cells: dict = {}
_cell_locks: dict = {}
_locks_guard = threading.Lock()


def _cell_of(lat: float, lon: float) -> tuple[int, int]:
    return (math.floor(lat / CELL_SIZE_DEG), math.floor(lon / CELL_SIZE_DEG))


def _cell_path(cell: tuple[int, int]) -> str:
    return os.path.join(CACHE_DIR, f"{cell[0]}_{cell[1]}.json.gz")


def _lock_for(cell):
    with _locks_guard:
        return _cell_locks.setdefault(cell, threading.Lock())


def _enforce_size_limit() -> None:
    """Delete least-recently-used cell files until the folder fits the cap."""
    files = []
    for name in os.listdir(CACHE_DIR):
        path = os.path.join(CACHE_DIR, name)
        if os.path.isfile(path):
            st = os.stat(path)
            files.append((st.st_mtime, st.st_size, path))
    total = sum(size for _, size, _ in files)
    for _, size, path in sorted(files):  # oldest first
        if total <= CACHE_MAX_BYTES:
            break
        os.remove(path)
        total -= size


def _download_cell(cell: tuple[int, int]) -> list[dict]:
    south = cell[0] * CELL_SIZE_DEG
    west = cell[1] * CELL_SIZE_DEG
    north, east = south + CELL_SIZE_DEG, west + CELL_SIZE_DEG
    query = f"""
    [out:json][timeout:60];
    way["building"]({south},{west},{north},{east});
    out body geom;
    """
    print(f"Downloading buildings for grid cell {cell} from OpenStreetMap...")
    buildings = parse_overpass_buildings(overpass_request(query, timeout=90))
    print(f"  -> {len(buildings)} buildings")
    return buildings


def get_cell(cell: tuple[int, int]) -> list[dict]:
    """Buildings in one grid cell: memory -> disk -> Overpass."""
    if cell in _memory_cells:
        return _memory_cells[cell]
    with _lock_for(cell):  # avoid two requests downloading the same cell at once
        if cell in _memory_cells:
            return _memory_cells[cell]
        path = _cell_path(cell)
        if os.path.exists(path):
            try:
                with gzip.open(path, "rt") as f:
                    saved = json.load(f)
                if (time.time() - saved["fetched_at"]) / 86400 < CELL_MAX_AGE_DAYS:
                    os.utime(path)  # mark as recently used for the size limit
                    _memory_cells[cell] = saved["buildings"]
                    return saved["buildings"]
            except (OSError, ValueError, KeyError):
                pass  # unreadable or old file -> download again
        buildings = _download_cell(cell)
        os.makedirs(CACHE_DIR, exist_ok=True)
        with gzip.open(path, "wt") as f:
            json.dump({"fetched_at": time.time(), "buildings": buildings}, f)
        _enforce_size_limit()
        _memory_cells[cell] = buildings
        return buildings


def _distance_m(lat1, lon1, lat2, lon2) -> float:
    dlat = (lat2 - lat1) * 111320
    dlon = (lon2 - lon1) * 111320 * math.cos(math.radians(lat1))
    return math.hypot(dlat, dlon)


def get_buildings_near(lat: float, lon: float, radius: float) -> list[dict]:
    """
    Same result shape as main.fetch_buildings_osm(lat, lon, radius), but served
    from the grid cache: buildings with any corner within `radius` meters.
    """
    dlat = radius / 111320
    dlon = radius / (111320 * math.cos(math.radians(lat)))
    lat_lo, lon_lo = _cell_of(lat - dlat, lon - dlon)
    lat_hi, lon_hi = _cell_of(lat + dlat, lon + dlon)

    seen = set()
    nearby = []
    for i in range(lat_lo, lat_hi + 1):
        for j in range(lon_lo, lon_hi + 1):
            for b in get_cell((i, j)):
                key = b.get("id") or (b["centroid_lat"], b["centroid_lon"])
                if key in seen:
                    continue  # buildings on a cell border appear in both cells
                if any(_distance_m(lat, lon, p["lat"], p["lon"]) <= radius
                       for p in b.get("geometry", [])):
                    seen.add(key)
                    nearby.append(b)
    return nearby


# ── Weather ────────────────────────────────────────────────────

WEATHER_MAX_AGE_SECONDS = 3600
_weather_cache: dict = {}
_weather_lock = threading.Lock()


def get_weather_cached(lat: float, lon: float, timezone: str, forecast_days: int = 3):
    """One Open-Meteo request per ~1 km area per hour, shared by all restaurants there."""
    key = (round(lat, 2), round(lon, 2), timezone, forecast_days)
    with _weather_lock:
        hit = _weather_cache.get(key)
        if hit and time.time() - hit[0] < WEATHER_MAX_AGE_SECONDS:
            return hit[1]
    weather = fetch_weather(key[0], key[1], timezone, forecast_days)
    with _weather_lock:
        _weather_cache[key] = (time.time(), weather)
    return weather
