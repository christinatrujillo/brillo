"""
Brillo API
Run with:   uvicorn api:app --reload --host 0.0.0.0 --port 8000
Docs at:    http://localhost:8000/docs
Requires:   pip install -r requirements.txt
"""

from datetime import datetime, date, timedelta
import zoneinfo

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

from main import Terrace, SunTracker, buildings_to_obstacles
from building_cache import get_buildings_near, get_weather_cached, get_current_weather_cached

app = FastAPI(
    title="Brillo API",
    description="Find out when restaurant terraces are in the sun!",
    version="1.0.0",
)

_tracker_cache = {}


def _cache_key(lat, lon):
    return f"{round(lat, 3)}:{round(lon, 3)}"


def build_tracker(lat, lon, timezone, terrace_height=0, search_radius=100):
    """Sun tracker for one location; buildings and weather come from the shared caches."""
    terrace = Terrace(name="", latitude=lat, longitude=lon, timezone=timezone)
    buildings = get_buildings_near(lat, lon, search_radius)
    terrace.obstacles = buildings_to_obstacles(buildings, lat, lon, terrace_height)
    tracker = SunTracker(terrace)
    tracker._weather_cache = get_weather_cached(lat, lon, timezone, forecast_days=3)
    return tracker


def get_tracker(lat, lon, timezone="Europe/Paris", terrace_height=0):
    # Include today's date so weather gets refreshed at least daily.
    key = f"{_cache_key(lat, lon)}:{timezone}:{terrace_height}:{date.today()}"
    if key not in _tracker_cache:
        _tracker_cache[key] = build_tracker(lat, lon, timezone, terrace_height)
    return _tracker_cache[key]


@app.get("/weather")
def current_weather(lat: float = Query(...), lon: float = Query(...)):
    """
    Weather right now, for the app header:
    { temperature, condition ('clear', 'partly_cloudy', 'cloudy', 'fog', 'rain', 'snow', 'storm'),
      is_day, timezone }
    """
    try:
        return get_current_weather_cached(lat, lon)
    except Exception as e:
        # 502 = "a service behind me failed", so the app knows it's not its own mistake.
        raise HTTPException(status_code=502, detail=f"Weather service unavailable: {e}")


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
    locations: list[Location]


class BatchSunReportRequest(BaseModel):
    timezone: str = "Europe/Paris"
    date: str | None = None
    locations: list[Location]


@app.post("/batch-sun-report")
def batch_sun_report(request: BatchSunReportRequest):
    """Full-day sun reports for many locations in one request (one per restaurant)."""
    target = (date.fromisoformat(request.date) if request.date
              else datetime.now(zoneinfo.ZoneInfo(request.timezone)).date())
    results = []
    for loc in request.locations:
        try:
            tracker = get_tracker(loc.lat, loc.lon, request.timezone, loc.terrace_height)
            results.append({"id": loc.id,
                            "report": tracker.calculate_day(target, interval_minutes=2)})
        except Exception as e:
            print(f"Sun report failed for {loc.id}: {e}")
            results.append({"id": loc.id, "report": None, "error": str(e)})
    return {"results": results}


@app.post("/batch-check")
def batch_check(request: BatchRequest):
    """Check sun status for multiple locations at once."""
    tz = zoneinfo.ZoneInfo(request.timezone)
    now = datetime.now(tz)
    results = []
    for loc in request.locations:
        try:
            tracker = get_tracker(loc.lat, loc.lon, request.timezone, loc.terrace_height)
            is_sunny, point = tracker.is_sunny_at(now)
            results.append({
                "id": loc.id,
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
            results.append({"id": loc.id, "error": str(e)})
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
    buildings = get_buildings_near(lat, lon, radius)
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
