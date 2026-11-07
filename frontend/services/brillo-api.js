const GOOGLE_PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY;
const BRILLO_API = process.env.EXPO_PUBLIC_BACKEND_URL;

const PLACES_FIELDS = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.types',
  'places.primaryType',
  'places.outdoorSeating',
  'places.rating',
  'places.formattedAddress',
  'places.currentOpeningHours',
].join(',');

// Restaurants, cafés and bars near a point, from Google Places (New).
async function fetchNearbyRestaurants(latitude, longitude, radius = 1000) {
  const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_KEY,
      'X-Goog-FieldMask': PLACES_FIELDS,
    },
    body: JSON.stringify({
      includedTypes: ['restaurant', 'cafe', 'bar'],
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude, longitude },
          radius,
        },
      },
    }),
  });

  const data = await response.json();
  console.log('Google Places returned', data.places ? data.places.length : 0, 'places');
  if (!data.places) return [];

  // Google lists opening hours Monday-first; JS getDay() is Sunday-first.
  const dayIndex = new Date().getDay();
  const googleDayIndex = dayIndex === 0 ? 6 : dayIndex - 1;

  return data.places.map((place) => ({
    id: place.id,
    name: place.displayName?.text || 'Unknown',
    latitude: place.location.latitude,
    longitude: place.location.longitude,
    types: place.types || [],
    primaryType: place.primaryType || null,
    rating: place.rating || null,
    address: place.formattedAddress || null,
    outdoorSeating: place.outdoorSeating || false,
    currentHours: place.currentOpeningHours?.weekdayDescriptions?.[googleDayIndex] || 'Not available',
  }));
}

// Full-day sun reports for all restaurants in one backend request.
// Returns [{ id, report }]; report is null if that location failed.
async function fetchSunReports(restaurants) {
  if (restaurants.length === 0) return [];

  const response = await fetch(`${BRILLO_API}/batch-sun-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timezone: 'Europe/Madrid',
      locations: restaurants.map((r) => ({ id: r.id, lat: r.latitude, lon: r.longitude })),
    }),
  });
  if (!response.ok) {
    throw new Error(`Sun reports failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  const failed = data.results.filter((r) => !r.report).length;
  if (failed) console.log('Sun report failed for', failed, 'of', data.results.length, 'restaurants');
  return data.results;
}

export { fetchNearbyRestaurants, fetchSunReports };
