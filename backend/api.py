"""
Sunny Terrace API
Run with:   uvicorn api:app --reload
Docs at:    http://localhost:8000/docs
Requires:   pip install fastapi uvicorn httpx astral
"""

from fastapi import FastAPI, Query
from pydantic import BaseModel
from datetime import datetime, date, timedelta
import math
from astral import Observer
from astral.sun import elevation, azimuth
import zoneinfo

from main import (
    Terrace, SunTracker, create_tracker_auto,
    fetch_buildings_osm, buildings_to_obstacles,
)

app = FastAPI(
    title="Brillo API",
    description="Find out when restaurant terraces are in the sun!",
    version="1.0.0",
)

_tracker_cache = {}


def _cache_key(lat, lon):
    return f"{round(lat, 3)}:{round(lon, 3)}"


def get_tracker(lat, lon, timezone="Europe/Paris", terrace_height=0):
    key = _cache_key(lat, lon)
    if key not in _tracker_cache:
        _tracker_cache[key] = create_tracker_auto(
            name="", latitude=lat, longitude=lon,
            timezone=timezone, terrace_height=terrace_height,
            search_radius=100, include_weather=True,
        )
    return _tracker_cache[key]


@app.get("/is-sunny")
def is_sunny_now(
    lat: float = Query(...),
    lon: float = Query(...),
    timezone: str = Query("Europe/Paris"),
    terrace_height: float = Query(0),
):
    """Check if a terrace is in the sun right now."""
    tracker = get_tracker(lat, lon, timezone, terrace_height)
    now = datetime.now(zoneinfo.ZoneInfo(timezone))
    is_sunny, point = tracker.is_sunny_at(now)

    status_changes_at = None
    for m in range(1, 480):
        future = now + timedelta(minutes=m)
        future_sunny, _ = tracker.is_sunny_at(future)
        if future_sunny != is_sunny:
            status_changes_at = future.strftime('%H:%M')
            break

    return {
        "is_sunny": is_sunny,
        "checked_at": now.strftime('%H:%M'),
        "sun_altitude": point.altitude,
        "sun_azimuth": point.azimuth,
        "cloud_cover": point.cloud_cover,
        "is_blocked_by_building": not point.is_sunny_geometry,
        "is_blocked_by_clouds": not point.is_sunny_weather,
        "status_changes_at": status_changes_at,
        "status_label": (
            "sunny" if is_sunny
            else "cloudy" if point.is_sunny_geometry
            else "shade"
        ),
    }


@app.get("/sun-report")
def sun_report(
    lat: float = Query(...),
    lon: float = Query(...),
    date: str = Query(None),
    timezone: str = Query("Europe/Paris"),
    terrace_height: float = Query(0),
):
    """Full day sun/shade report."""
    tracker = get_tracker(lat, lon, timezone, terrace_height)
    from datetime import date as date_type
    target = (date_type.fromisoformat(date) if date
              else datetime.now(zoneinfo.ZoneInfo(timezone)).date())
    return tracker.calculate_day(target, interval_minutes=2)


class Location(BaseModel):
    id: str
    lat: float
    lon: float
    terrace_height: float = 0


class BatchRequest(BaseModel):
    timezone: str = "Europe/Paris"
    locations: list


@app.post("/batch-check")
def batch_check(request: BatchRequest):
    """Check sun status for multiple locations at once."""
    tz = zoneinfo.ZoneInfo(request.timezone)
    now = datetime.now(tz)
    results = []
    for loc in request.locations:
        try:
            tracker = get_tracker(loc["lat"], loc["lon"],
                                  request.timezone, loc.get("terrace_height", 0))
            is_sunny, point = tracker.is_sunny_at(now)
            results.append({
                "id": loc["id"],
                "is_sunny": is_sunny,
                "status_label": (
                    "sunny" if is_sunny
                    else "cloudy" if point.is_sunny_geometry
                    else "shade"
                ),
                "sun_altitude": point.altitude,
                "cloud_cover": point.cloud_cover,
            })
        except Exception as e:
            results.append({"id": loc.get("id", "?"), "error": str(e)})
    return {"checked_at": now.strftime('%H:%M'), "results": results}


@app.get("/forecast")
def forecast(
    lat: float = Query(...),
    lon: float = Query(...),
    days: int = Query(7),
    timezone: str = Query("Europe/Paris"),
    terrace_height: float = Query(0),
):
    """Multi-day sun forecast."""
    tracker = get_tracker(lat, lon, timezone, terrace_height)
    today = datetime.now(zoneinfo.ZoneInfo(timezone)).date()
    results = []
    for d in range(days):
        report = tracker.calculate_day(today + timedelta(days=d), interval_minutes=5)
        results.append({
            "date": report["date"],
            "total_sun_hours": report["total_sun_hours"],
            "sun_windows": report["sun_windows"],
            "sunrise": report["sun_events"]["sunrise"],
            "sunset": report["sun_events"]["sunset"],
        })
    return {"location": {"lat": lat, "lon": lon}, "forecast": results}


@app.get("/obstacles")
def get_obstacles(
    lat: float = Query(...),
    lon: float = Query(...),
    radius: int = Query(100),
    terrace_height: float = Query(0),
):
    """Show detected buildings around a location."""
    buildings = fetch_buildings_osm(lat, lon, radius)
    obstacles = buildings_to_obstacles(buildings, lat, lon, terrace_height)
    return {
        "buildings_found": len(buildings),
        "obstacles_above_terrace": len(obstacles),
        "obstacles": [
            {
                "label": o.label,
                "azimuth_start": o.azimuth_start,
                "azimuth_end": o.azimuth_end,
                "height": o.height,
                "distance": o.distance,
                "blocking_angle": round(o.blocking_angle, 1),
            }
            for o in obstacles
        ],
    }


@app.get("/shadows")
def get_shadows(
    lat: float = Query(...),
    lon: float = Query(...),
    hour: int = Query(...),
    minute: int = Query(0),
    radius: int = Query(200),
    timezone: str = Query("Europe/Madrid"),
):
    
    """Calculate shadow polygons for buildings in an area at a specific time."""   
    tz = zoneinfo.ZoneInfo(timezone)
    now = datetime.now(tz)
    target_time = now.replace(hour=hour, minute=minute, second=0, microsecond=0)

    observer = Observer(latitude=lat, longitude=lon)
    sun_alt = elevation(observer, target_time)
    sun_az = azimuth(observer, target_time)

    # if sun is below horizon, everything is in shadow
    if sun_alt <= 0:
        return {
            "time": target_time.strftime('%H:%M'),
            "sun_altitude:": round(sun_alt, 2),
            "sun_azimuth": round(sun_az, 2),
            "shadows": [],
            "message": "Sun is below the horizon"
        }
    
    buildings = fetch_buildings_osm(lat, lon, radius)
    
    # shadow direction is opposite the sun
    shadow_azimuth = (sun_az + 180) % 360
    shadow_azimuth_rad = math.radians(shadow_azimuth)

    shadows = []
    for b in buildings: 
        geometry = b.get("geometry", [])
        if len(geometry) < 3:
            continue

        height = b["height"]
        if height is None:
            height = float(b.get("levels") or 4) * 3.0

        shadow_length = height / math.tan(math.radians(sun_alt))
        # cap shadow length to avoid extremely long shadows at sunrise/sunset
        shadow_length = min(shadow_length, 200)

        lat_offset = (shadow_length * math.cos(shadow_azimuth_rad)) / 111320
        lon_offset = (shadow_length * math.sin(shadow_azimuth_rad)) / (111320 * math.cos(math.radians(lat)))

        # build shadow polygon: building footprint + projected shadow of each corner
        building_coords = [[p["lat"], p["lon"]] for p in geometry]
        shadow_coords = [[p["lat"] + lat_offset, p["lon"] + lon_offset] for p in geometry]

        polygon = building_coords + list(reversed(shadow_coords))

        shadows.append({
            "polygon": polygon,
            "building_height": height,
            "shadow_length": round(shadow_length, 1),
        })

    return {
        "time": target_time.strftime('%H:%M'),
        "sun_altitude": round(sun_alt, 2),
        "sun_azimuth": round(sun_az, 2),
        "shadow_count": len(shadows),
        "shadows": shadows,
    }

@app.get("/")
def health():
    return {
        "status": "ok",
        "app": "Brillo API",
        "docs": "Visit /docs for interactive API documentation",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
