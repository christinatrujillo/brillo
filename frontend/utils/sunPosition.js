// Sun position (NOAA solar calculator approximation, accurate to well under a degree).
// Returns { azimuth, altitude } in degrees; azimuth is measured clockwise from north.
export function sunPosition(date, latitude, longitude) {
    const rad = Math.PI / 180;
    const jd = date.getTime() / 86400000 + 2440587.5;
    const t = (jd - 2451545.0) / 36525;

    const L0 = (280.46646 + t * (36000.76983 + 0.0003032 * t)) % 360;
    const M = 357.52911 + t * (35999.05029 - 0.0001537 * t);
    const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
    const C = Math.sin(M * rad) * (1.914602 - t * (0.004817 + 0.000014 * t))
        + Math.sin(2 * M * rad) * (0.019993 - 0.000101 * t)
        + Math.sin(3 * M * rad) * 0.000289;
    const trueLong = L0 + C;
    const omega = 125.04 - 1934.136 * t;
    const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * rad);
    const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
    const eps = eps0 + 0.00256 * Math.cos(omega * rad);
    const decl = Math.asin(Math.sin(eps * rad) * Math.sin(lambda * rad));

    const y = Math.tan((eps / 2) * rad) ** 2;
    const eqTime = 4 / rad * (y * Math.sin(2 * L0 * rad) - 2 * e * Math.sin(M * rad)
        + 4 * e * y * Math.sin(M * rad) * Math.cos(2 * L0 * rad)
        - 0.5 * y * y * Math.sin(4 * L0 * rad) - 1.25 * e * e * Math.sin(2 * M * rad));

    const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
    const trueSolarTime = (utcMinutes + eqTime + 4 * longitude + 1440) % 1440;
    let hourAngle = trueSolarTime / 4 - 180;

    const latR = latitude * rad;
    const ha = hourAngle * rad;
    const cosZenith = Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(ha);
    const zenith = Math.acos(Math.min(1, Math.max(-1, cosZenith)));
    const altitude = 90 - zenith / rad;

    const azimuth = (Math.atan2(
        Math.sin(ha),
        Math.cos(ha) * Math.sin(latR) - Math.tan(decl) * Math.cos(latR),
    ) / rad + 180 + 360) % 360;

    return { azimuth, altitude };
}

// A Date for today at `hour` o'clock Madrid time, regardless of the phone's timezone.
export function madridTimeToday(hour) {
    const now = new Date();
    let y, mo, d, offsetMinutes;
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Europe/Madrid', year: 'numeric', month: 'numeric', day: 'numeric',
            hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
        }).formatToParts(now);
        const get = (type) => Number(parts.find((p) => p.type === type).value);
        y = get('year'); mo = get('month'); d = get('day');
        // Madrid's offset from UTC right now (+60 in winter, +120 in summer)
        const madridAsUtc = Date.UTC(y, mo - 1, d, get('hour') % 24, get('minute'));
        offsetMinutes = Math.round((madridAsUtc - now.getTime()) / 60000 / 15) * 15;
    } catch (e) {
        // No timezone support: assume the phone is on Madrid time
        y = now.getFullYear(); mo = now.getMonth() + 1; d = now.getDate();
        offsetMinutes = -now.getTimezoneOffset();
    }
    return new Date(Date.UTC(y, mo - 1, d, hour, 0, 0) - offsetMinutes * 60000);
}
