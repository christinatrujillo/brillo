// Sun status of a restaurant at a given hour, read from its backend sun report.
// Shared by the map markers and the restaurant panel so both always agree.

export const SUN_STATUS = {
    sunny: { label: 'Sunny', icon: 'sunny', color: '#F9AB55' },
    cloudy: { label: 'Cloudy', icon: 'cloudy-sharp', color: '#084887' },
    shade: { label: 'In shade', icon: 'partly-sunny-sharp', color: '#909CC2' },
    unknown: { label: 'Unknown', icon: 'help-circle-outline', color: '#909CC2' },
};

// Returns 'sunny' | 'cloudy' | 'shade' | 'unknown' (no report yet).
export function getSunStatus(sunReport, hour) {
    if (!sunReport || !sunReport.sun_path) return 'unknown';

    const targetMinutes = hour * 60;
    let closest = null;
    let closestDiff = Infinity;
    for (const point of sunReport.sun_path) {
        const [h, m] = point.time.split(':').map(Number);
        const diff = Math.abs(h * 60 + m - targetMinutes);
        if (diff < closestDiff) {
            closestDiff = diff;
            closest = point;
        }
    }

    if (!closest) return 'unknown';
    if (closest.is_sunny) return 'sunny';
    if (closest.is_sunny_geometry && !closest.is_sunny_weather) return 'cloudy';
    return 'shade';
}
