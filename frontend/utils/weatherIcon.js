// Which Ionicons icon to show for the weather from the backend's /weather endpoint.
// The backend sends a simple condition name ('clear', 'rain', ...), never the
// weather provider's own codes, so this file never changes if the provider does.

const DAY_ICONS = {
    clear: 'sunny',
    partly_cloudy: 'partly-sunny',
    cloudy: 'cloudy',
    fog: 'cloudy',
    rain: 'rainy',
    snow: 'snow',
    storm: 'thunderstorm',
};

// At night, a clear sky shows the moon instead of the sun.
const NIGHT_ICONS = {
    ...DAY_ICONS,
    clear: 'moon',
    partly_cloudy: 'cloudy-night',
};

export function weatherIcon(weather) {
    const icons = weather.is_day ? DAY_ICONS : NIGHT_ICONS;
    return icons[weather.condition] || 'cloudy';
}
