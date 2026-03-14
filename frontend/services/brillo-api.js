const GOOGLE_PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY;
const BRILLO_API = process.env.EXPO_PUBLIC_BACKEND_URL;

async function fetchSunReports(restaurants) {
  const results = [];

  for (const r of restaurants) {
    try {
      const response = await fetch (
        `${BRILLO_API}/sun-report?lat=${r.latitude}&lon=${r.longitude}&timezone=Europe/Madrid`
      );
      const data = await response.json();
      results.push({
        id: r.id,
        report: data,
      });
    } catch (error) {
      console.log('Sun report failed for', r.id);
      results.push({id: r.id, report: null});
    }
  }
  return results;
}

async function checkSunStatus(restaurants) {
  const locations = restaurants.map((r) => ({
    id: r.id,
    lat: r.latitude,
    lon: r.longitude,
  }));

  const response = await fetch(`${BRILLO_API}/batch-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timezone: 'Europe/Madrid',
      locations,
    }),
  });

  const data = await response.json();
  return data.results;
}

async function fetchNearbyRestaurants(latitude, longitude, radius = 1000) {
  const url = 'https://places.googleapis.com/v1/places:searchNearby';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.types,places.primaryType,places.outdoor_seating,places.rating,places.formattedAddress,places.currentOpeningHours',
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
  console.log('Google API response:', JSON.stringify(data));

  if (!data.places) return [];

  return data.places.map((place) => {
    const dayIndex = new Date().getDay(); 
    const googleIndex = dayIndex === 0 ? 6 : dayIndex - 1;
    return {
      id: place.id,
      name: place.displayName?.text || 'Unknown',
      latitude: place.location.latitude,
      longitude: place.location.longitude,
      types: place.types || [],
      primaryType: place.primaryType || null,
      rating: place.rating || null,
      address: place.formattedAddress || null,
      outdoorSeating: place.outdoorSeating || false,
      currentHours: place.currentOpeningHours?.weekdayDescriptions?.[googleIndex] || "Not available"
      };
    });
}

async function fetchShadows(latitude, longitude, hour, minute) {
  const response = await fetch(
    `${BRILLO_API}/shadows?lat=${latitude}&lon=${longitude}&hour=${hour}&minute=${minute}&radius=200`
  );
  const data = await response.json();
  return data.shadows || [];
}

export { fetchNearbyRestaurants, checkSunStatus, fetchSunReports, fetchShadows };