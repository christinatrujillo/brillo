"""
🌞 Terrace Sun Tracker — Backend
=================================
Calculates when a terrace receives direct sunlight,
accounting for surrounding building obstructions and weather.

Uses:
  - `astral`       → solar position (proven astronomy library)
  - Overpass API   → real building data from OpenStreetMap (free)
  - Open-Meteo API → cloud cover & radiation forecasts (free, no key)

Dependencies: pip install astral
"""

import math
import json
import zoneinfo
import urllib.request
import urllib.parse
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta, date
from typing import Optional

from astral import Observer
from astral.sun import elevation, azimuth, sun


# ──────────────────────────────────────────────────────────────
# DATA MODELS
# ──────────────────────────────────────────────────────────────

@dataclass
class Obstacle:
    """A building or structure that may block sunlight."""
    azimuth_start: float
    azimuth_end: float
    height: float
    distance: float
    label: str = ""

    @property
    def blocking_angle(self) -> float:
        return math.degrees(math.atan2(self.height, self.distance))


@dataclass
class SunWindow:
    """A continuous period when the terrace is in sunlight."""
    start: str
    end: str
    duration_minutes: int = 0


@dataclass
class SunPathPoint:
    """Sun position at a specific time with obstruction + weather info."""
    time: str
    altitude: float
    azimuth: float
    min_altitude_needed: float
    cloud_cover: Optional[float]      # 0-100%, None if unavailable
    is_sunny_geometry: bool            # sun clears obstacles?
    is_sunny_weather: bool             # clear enough sky?
    is_sunny: bool                     # both combined


@dataclass
class Terrace:
    """A terrace with its location and surrounding obstacles."""
    name: str
    latitude: float
    longitude: float
    timezone: str
    obstacles: list[Obstacle] = field(default_factory=list)

    @property
    def observer(self) -> Observer:
        return Observer(latitude=self.latitude, longitude=self.longitude)

    @property
    def tz(self) -> zoneinfo.ZoneInfo:
        return zoneinfo.ZoneInfo(self.timezone)

    def add_obstacle(self, azimuth_start: float, azimuth_end: float,
                     height: float, distance: float, label: str = "") -> None:
        self.obstacles.append(Obstacle(
            azimuth_start=azimuth_start, azimuth_end=azimuth_end,
            height=height, distance=distance, label=label,
        ))


# ──────────────────────────────────────────────────────────────
# BUILDING DETECTION — OpenStreetMap via Overpass API
# ──────────────────────────────────────────────────────────────

# Default story height when exact height isn't tagged
METERS_PER_LEVEL = 3.0

def fetch_buildings_osm(lat: float, lon: float, radius: int = 100) -> list[dict]:
    """
    Fetch nearby buildings from OpenStreetMap.

    Returns raw building data with centroid, height (if available),
    and number of levels.
    """
    query = f"""
    [out:json][timeout:25];
    (
      way["building"](around:{radius},{lat},{lon});
    );
    out body geom;
    """
    url = "https://overpass-api.de/api/interpreter"
    data = urllib.parse.urlencode({"data": query}).encode()
    req = urllib.request.Request(url, data=data)

    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read().decode())

    buildings = []
    for el in result.get("elements", []):
        tags = el.get("tags", {})
        geometry = el.get("geometry", [])
        if not geometry:
            continue

        # Calculate centroid
        centroid_lat = sum(p["lat"] for p in geometry) / len(geometry)
        centroid_lon = sum(p["lon"] for p in geometry) / len(geometry)

        # Get height: prefer explicit height tag, fall back to levels * 3m
        height = None
        if "height" in tags:
            try:
                height = float(tags["height"])
            except ValueError:
                pass
        if height is None and "building:levels" in tags:
            try:
                height = float(tags["building:levels"]) * METERS_PER_LEVEL
            except ValueError:
                pass

        buildings.append({
            "name": tags.get("name", ""),
            "type": tags.get("building", "unknown"),
            "height": height,
            "levels": tags.get("building:levels"),
            "centroid_lat": centroid_lat,
            "centroid_lon": centroid_lon,
            "geometry": geometry,
        })

    return buildings


def _haversine_distance(lat1, lon1, lat2, lon2) -> float:
    """Distance in meters between two lat/lon points."""
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _bearing(lat1, lon1, lat2, lon2) -> float:
    """Compass bearing from point 1 to point 2 (degrees, 0=N)."""
    dlon = math.radians(lon2 - lon1)
    lat1_r, lat2_r = math.radians(lat1), math.radians(lat2)
    x = math.sin(dlon) * math.cos(lat2_r)
    y = (math.cos(lat1_r) * math.sin(lat2_r) -
         math.sin(lat1_r) * math.cos(lat2_r) * math.cos(dlon))
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def _angular_width(distance: float, geometry: list[dict], lat: float, lon: float) -> float:
    """Estimate the angular width of a building as seen from the terrace."""
    if len(geometry) < 2:
        return 10.0  # default guess

    bearings = [_bearing(lat, lon, p["lat"], p["lon"]) for p in geometry]

    # Handle wrap-around (e.g., bearings spanning north: 350°, 5°)
    bearings_rad = [math.radians(b) for b in bearings]
    sin_sum = sum(math.sin(b) for b in bearings_rad)
    cos_sum = sum(math.cos(b) for b in bearings_rad)
    mean_bearing = math.degrees(math.atan2(sin_sum, cos_sum)) % 360

    # Calculate angular differences from mean
    diffs = []
    for b in bearings:
        diff = (b - mean_bearing + 180) % 360 - 180
        diffs.append(diff)

    return max(diffs) - min(diffs) if diffs else 10.0


def buildings_to_obstacles(buildings: list[dict], terrace_lat: float,
                           terrace_lon: float, terrace_height: float = 0,
                           default_height: float = 12.0) -> list[Obstacle]:
    """
    Convert raw OSM building data into Obstacle objects relative to a terrace.

    Args:
        buildings:       Output from fetch_buildings_osm()
        terrace_lat/lon: Terrace position
        terrace_height:  Height of the terrace above ground (meters)
        default_height:  Assumed height when building has no height data
    """
    obstacles = []
    for b in buildings:
        bh = b["height"] if b["height"] is not None else default_height
        relative_height = bh - terrace_height
        if relative_height <= 0:
            continue  # building is shorter than the terrace

        dist = _haversine_distance(terrace_lat, terrace_lon,
                                   b["centroid_lat"], b["centroid_lon"])
        if dist < 2:
            continue  # skip the building we're standing on

        center_bearing = _bearing(terrace_lat, terrace_lon,
                                  b["centroid_lat"], b["centroid_lon"])
        angular_w = _angular_width(dist, b.get("geometry", []),
                                   terrace_lat, terrace_lon)

        az_start = (center_bearing - angular_w / 2) % 360
        az_end = (center_bearing + angular_w / 2) % 360

        obstacles.append(Obstacle(
            azimuth_start=round(az_start, 1),
            azimuth_end=round(az_end, 1),
            height=round(relative_height, 1),
            distance=round(dist, 1),
            label=b.get("name") or b.get("type", "building"),
        ))

    return obstacles


# ──────────────────────────────────────────────────────────────
# WEATHER — Open-Meteo API (free, no key)
# ──────────────────────────────────────────────────────────────

def fetch_weather(lat: float, lon: float, timezone: str,
                  forecast_days: int = 1) -> dict[str, float]:
    """
    Fetch hourly cloud cover from Open-Meteo.

    Returns:
        Dict mapping "HH:00" → cloud_cover percentage (0-100)
    """
    url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={lat}&longitude={lon}"
        f"&hourly=cloud_cover,direct_radiation"
        f"&forecast_days={forecast_days}"
        f"&timezone={urllib.parse.quote(timezone)}"
    )
    with urllib.request.urlopen(url, timeout=15) as resp:
        data = json.loads(resp.read().decode())

    hourly = data["hourly"]
    weather = {}
    for time_str, cloud, rad in zip(hourly["time"], hourly["cloud_cover"],
                                     hourly["direct_radiation"]):
        # "2025-06-21T14:00" - extract date and hour
        dt = datetime.fromisoformat(time_str)
        key = (dt.strftime('%Y-%m-%d'), dt.strftime('%H:00'))
        weather[key] = {
            "cloud_cover": cloud,
            "direct_radiation": rad,
        }

    return weather


# ──────────────────────────────────────────────────────────────
# OBSTRUCTION ENGINE
# ──────────────────────────────────────────────────────────────

class ObstructionProfile:
    """Models the 360° skyline of obstacles around a terrace."""

    def __init__(self, obstacles: list[Obstacle]):
        self._obstacles = obstacles

    def min_altitude_at(self, az: float) -> float:
        az = az % 360
        max_block = 0.0
        for obs in self._obstacles:
            start = obs.azimuth_start % 360
            end = obs.azimuth_end % 360
            if start <= end:
                in_range = start <= az <= end
            else:
                in_range = az >= start or az <= end
            if in_range:
                max_block = max(max_block, obs.blocking_angle)
        return max_block


# ──────────────────────────────────────────────────────────────
# SUN TRACKER — Core Engine
# ──────────────────────────────────────────────────────────────

# Cloud cover threshold: above this %, we consider it too cloudy
# for meaningful direct sunlight on the terrace
DEFAULT_CLOUD_THRESHOLD = 70

class SunTracker:
    """Combines astral solar position + obstruction checks + weather."""

    def __init__(self, terrace: Terrace, cloud_threshold: float = DEFAULT_CLOUD_THRESHOLD):
        self.terrace = terrace
        self.profile = ObstructionProfile(terrace.obstacles)
        self.cloud_threshold = cloud_threshold
        self._weather_cache: dict = {}

    def load_weather(self, forecast_days: int = 1) -> None:
        """Pre-fetch weather data from Open-Meteo."""
        self._weather_cache = fetch_weather(
            self.terrace.latitude, self.terrace.longitude,
            self.terrace.timezone, forecast_days,
        )

    def _get_cloud_cover(self, dt: datetime) -> Optional[float]:
        """Get cloud cover for a given hour (or None if not loaded)."""
        key = (dt.strftime('%Y-%m-%d'), dt.strftime('%H:00'))
        entry = self._weather_cache.get(key)
        return entry["cloud_cover"] if entry else None

    def is_sunny_at(self, dt: datetime) -> tuple[bool, SunPathPoint]:
        """Check if the terrace is in the sun at a specific datetime."""
        sun_alt = elevation(self.terrace.observer, dt)
        sun_az = azimuth(self.terrace.observer, dt)
        min_alt = self.profile.min_altitude_at(sun_az)

        # Geometry check: does the sun clear the obstacles?
        is_sunny_geom = sun_alt > max(0, min_alt)

        # Weather check: is the sky clear enough?
        cloud = self._get_cloud_cover(dt)
        is_sunny_wx = cloud < self.cloud_threshold if cloud is not None else True

        # Both must be true for actual sunshine
        is_sunny = is_sunny_geom and is_sunny_wx

        point = SunPathPoint(
            time=dt.strftime('%H:%M'),
            altitude=round(sun_alt, 2),
            azimuth=round(sun_az, 2),
            min_altitude_needed=round(min_alt, 2),
            cloud_cover=cloud,
            is_sunny_geometry=is_sunny_geom,
            is_sunny_weather=is_sunny_wx,
            is_sunny=is_sunny,
        )
        return is_sunny, point

    def get_sun_events(self, target_date: date) -> dict:
        return sun(self.terrace.observer, date=target_date, tzinfo=self.terrace.tz)

    def calculate_day(self, target_date: date, interval_minutes: int = 1) -> dict:
        """Full sun/shade report for a given day."""
        tz = self.terrace.tz
        sun_events = self.get_sun_events(target_date)

        sun_path: list[SunPathPoint] = []
        sun_windows: list[SunWindow] = []
        currently_sunny = False
        window_start = None

        start_of_day = datetime(
            target_date.year, target_date.month, target_date.day, tzinfo=tz
        )

        for minute in range(0, 1440, interval_minutes):
            dt = start_of_day + timedelta(minutes=minute)
            is_sunny, point = self.is_sunny_at(dt)
            sun_path.append(point)

            if is_sunny and not currently_sunny:
                window_start = dt
                currently_sunny = True
            elif not is_sunny and currently_sunny:
                duration = int((dt - window_start).total_seconds() / 60)
                sun_windows.append(SunWindow(
                    start=window_start.strftime('%H:%M'),
                    end=dt.strftime('%H:%M'),
                    duration_minutes=duration,
                ))
                currently_sunny = False

        if currently_sunny and window_start:
            end = start_of_day + timedelta(days=1)
            duration = int((end - window_start).total_seconds() / 60)
            sun_windows.append(SunWindow(
                start=window_start.strftime('%H:%M'),
                end='24:00',
                duration_minutes=duration,
            ))

        total_sun_min = sum(1 for p in sun_path if p.is_sunny) * interval_minutes
        has_weather = any(p.cloud_cover is not None for p in sun_path)

        return {
            'date': target_date.isoformat(),
            'terrace': self.terrace.name,
            'location': {
                'latitude': self.terrace.latitude,
                'longitude': self.terrace.longitude,
                'timezone': self.terrace.timezone,
            },
            'sun_events': {k: v.strftime('%H:%M') for k, v in sun_events.items()},
            'weather_available': has_weather,
            'cloud_threshold': self.cloud_threshold,
            'total_sun_hours': round(total_sun_min / 60, 1),
            'sun_windows': [asdict(w) for w in sun_windows],
            'obstacles_count': len(self.terrace.obstacles),
            'sun_path': [
                asdict(p) for p in sun_path if p.altitude > -5
            ][::15],
        }

    def calculate_range(self, start_date: date, days: int = 7,
                        interval_minutes: int = 5) -> list[dict]:
        return [
            self.calculate_day(start_date + timedelta(days=d), interval_minutes)
            for d in range(days)
        ]

    def best_time_today(self, target_date: date) -> Optional[dict]:
        result = self.calculate_day(target_date)
        windows = result['sun_windows']
        if not windows:
            return None
        return max(windows, key=lambda w: w['duration_minutes'])


# ──────────────────────────────────────────────────────────────
# CONVENIENCE: Auto-setup from just a lat/lon
# ──────────────────────────────────────────────────────────────

def create_tracker_auto(name: str, latitude: float, longitude: float,
                        timezone: str, terrace_height: float = 0,
                        search_radius: int = 100,
                        include_weather: bool = True) -> SunTracker:
    """
    One-call setup: fetches real buildings from OSM and weather from Open-Meteo.

    Args:
        name:           Name for this terrace
        latitude/lon:   Location
        timezone:       IANA timezone (e.g., 'Europe/Paris')
        terrace_height: How high the terrace is above ground level (meters)
        search_radius:  How far to search for buildings (meters)
        include_weather: Whether to fetch weather forecast

    Returns:
        A SunTracker with real-world data
    """

    terrace = Terrace(name=name, latitude=latitude, longitude=longitude, timezone=timezone)

    print(f"Fetching buildings within {search_radius}m from OpenStreetMap...")
    buildings = fetch_buildings_osm(latitude, longitude, search_radius)
    obstacles = buildings_to_obstacles(buildings, latitude, longitude, terrace_height)
    terrace.obstacles = obstacles
    print(f"Found {len(buildings)} buildings → {len(obstacles)} relevant obstacles")

    tracker = SunTracker(terrace)

    if include_weather:
        print(f"Fetching weather forecast from Open-Meteo...")
        tracker.load_weather(forecast_days=3)
        print(f"Weather loaded")

    return tracker


# ──────────────────────────────────────────────────────────────
# DEMO
# ──────────────────────────────────────────────────────────────

if __name__ == '__main__':
    from datetime import date

    tracker = create_tracker_auto(
        name="Calle de Rivoli Terrace",
        latitude=40.383458,
        longitude=-3.705325,
        timezone="Europe/Paris",
        terrace_height=0,
        search_radius=100,
    )

    print(f"\nDetected obstacles:")
    for obs in tracker.terrace.obstacles:
        print(f"   {obs.label or 'building':30s}  "
              f"az {obs.azimuth_start:>5.1f}°-{obs.azimuth_end:>5.1f}°  "
              f"h={obs.height:>5.1f}m  d={obs.distance:>5.1f}m  "
              f"block={obs.blocking_angle:>4.1f}°")

    # Today's report
    today = date.today()
    report = tracker.calculate_day(today, interval_minutes=1)

    print(f"\n{'=' * 60}")
    print(f"SUN REPORT — {report['date']}")
    print(f"{report['terrace']}")
    print(f"{'=' * 60}")
    print(f"Sunrise: {report['sun_events']['sunrise']}")
    print(f"Sunset:  {report['sun_events']['sunset']}")
    print(f"Weather: {'yes' if report['weather_available'] else 'no'}")
    print(f"Total sun: {report['total_sun_hours']} hours")

    print(f"\nSun windows:")
    for w in report['sun_windows']:
        hrs = w['duration_minutes'] // 60
        mins = w['duration_minutes'] % 60
        print(f"   {w['start']} → {w['end']}  ({hrs}h {mins}m)")

    best = tracker.best_time_today(today)
    if best:
        print(f"\n⭐ Best window: {best['start']} → {best['end']} ({best['duration_minutes']} min)")

    # Sun path with weather
    print(f"\nSun path:")
    print(f"   {'Time':>5}  {'Alt':>6}°  {'Az':>6}°  {'Need':>5}°  {'Cloud':>5}  {'Status'}")
    print(f"   {'─'*5}  {'─'*7}  {'─'*7}  {'─'*6}  {'─'*5}  {'─'*12}")
    for p in report['sun_path']:
        cloud_str = f"{p['cloud_cover']:>4.0f}%" if p['cloud_cover'] is not None else "  n/a"
        if p['is_sunny']:
            status = "SUN"
        elif p['is_sunny_geometry'] and not p['is_sunny_weather']:
            status = "CLOUDY"
        else:
            status = "SHADE"
        print(f"   {p['time']:>5}  {p['altitude']:>6.1f}°  {p['azimuth']:>6.1f}°  {p['min_altitude_needed']:>5.1f}°  {cloud_str}  {status}")

