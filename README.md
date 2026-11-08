# Brillo 

An Android/iOS app that helps users find sunny restaurant terraces in real time. See which cafés, restaurants, and bars have sun-lit outdoor seating right now — or at any time of day using the time slider.

Built with React Native (Expo) + FastAPI + Google Places + OpenStreetMap.

---

## How It Works

1. App gets the user's GPS location
2. Fetches nearby restaurants, cafés, and bars from Google Places API
3. Sends their coordinates to the Brillo FastAPI backend
4. Backend calculates sun position, fetches surrounding building geometry from OpenStreetMap, and checks weather from Open-Meteo
5. Returns whether each terrace is sunny, in building shade, or cloudy
6. Map displays color-coded markers:
   - **Gold** — Sunny
   - **Gray-blue** — In shade (blocked by buildings), or sun data still loading
   - **Dark blue** — Sunny spot, but cloudy
7. Mapbox draws the 3D building shadows, lit by the real sun position for the selected hour

---

## Project Structure

```
brillo/
├── backend/
│   ├── main.py              # Core sun tracking engine (SunTracker, building obstacles, etc.)
│   ├── api.py               # FastAPI endpoints (/weather, /batch-sun-report, /sun-report, /is-sunny, /batch-check, /forecast, /obstacles)
│   ├── building_cache.py    # Building (OpenStreetMap) and weather caches
│   └── requirements.txt     # Python dependencies
│
├── frontend/
│   ├── App.js                # Main app component (location, data fetching, state management)
│   ├── index.js              # Expo entry point
│   ├── components/
│   │   ├── Map.js            # Mapbox map, restaurant markers, sun lighting + shadows
│   │   ├── RestaurantPanel.js # Restaurant detail panel
│   │   └── TimeSlider.js     # Time slider + search bar toggle
│   ├── services/
│   │   └── brillo-api.js     # API service (Google Places + Brillo backend calls)
│   ├── utils/
│   │   ├── sunPosition.js    # Sun position for the slider hour (drives the map's shadows)
│   │   └── sunStatus.js      # Sunny / shade / cloudy status from a sun report
│   ├── patches/              # patch-package fix for @rnmapbox/maps (see below)
│   └── assets/
│       └── fonts/            # Rubik Mono One custom font
│
└── README.md
```

---

## Tech Stack

**Frontend**
- React Native (Expo SDK 58)
- @rnmapbox/maps (Mapbox Standard style, Monochrome theme — 3D buildings with real-sun shadows)
- patch-package (adds a live sun-lighting command to @rnmapbox/maps)
- expo-location
- @react-native-community/slider
- @expo/vector-icons (Ionicons)

**Backend**
- Python / FastAPI
- OpenStreetMap (Overpass API) for building geometry
- Open-Meteo for weather/cloud data
- Astral for sun position calculations

**External APIs**
- Google Places API (New) — restaurant data
- OpenStreetMap Overpass — building footprints and heights
- Open-Meteo — weather forecasts (free, no key needed)

---

## Setup

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn api:app --reload --host 0.0.0.0 --port 8000
```

Building data is cached in `backend/cache/` (git-ignored, max 100 MB) so each area is only downloaded from OpenStreetMap once.

### Frontend
```bash
cd frontend
npm install
npx expo prebuild --clean
npx expo run:android   # or: npx expo run:ios
```

Mapbox uses native code, so the app **does not run in Expo Go**. You need a development build (above). After the first build, `npx expo start --dev-client` is enough for JS changes.

`npx expo prebuild --clean` deletes `android/local.properties`. If Gradle then says "SDK location not found", recreate it with `sdk.dir=/Users/<you>/Library/Android/sdk`.

### Running on a phone (wireless)
1. Phone: Settings → System → Developer options → **Wireless debugging** on
2. First time only: "Pair device with pairing code", then `adb pair <ip:port> <code>`
3. `adb connect <ip:port>` (the port shown on the Wireless debugging screen; it changes each time)
4. `npx expo start --dev-client`, then press `a` to open the app on the phone

### Mapbox patch
`@rnmapbox/maps` can't change a style's 3D lights without reloading the whole map, which made the map flash whenever the time slider moved. `patches/@rnmapbox+maps+10.3.11.patch` adds a `setLights()` command (Android + iOS) that moves the sun in place. It's applied automatically after every `npm install` (`postinstall` script). The package is pinned to `10.3.11` so the patch always matches; when upgrading, re-create the patch. The iOS half is not tested yet.

### Required Keys
- **Google Places API key** — Create a .env file in the frontend directory and add EXPO_PUBLIC_GOOGLE_PLACES_KEY=your_key_here
- **Google Cloud** — Enable "Places API (New)" (used for restaurant search only; the map itself is Mapbox)
- **Mapbox access token** — Create a public token (`pk.…`) at account.mapbox.com and add EXPO_PUBLIC_MAPBOX_TOKEN=your_token to frontend/.env
- No key needed for OpenStreetMap or Open-Meteo

### Important: Slider Import
Use a direct file import for the slider:
```javascript
import Slider from '@react-native-community/slider/dist/Slider';
```

---

## Completed Features

- [x] Map with user's current location (GPS)
- [x] Blue dot showing user's position
- [x] Custom "center on me" button
- [x] Google Places integration — fetches 20 nearby restaurants/cafés/bars
- [x] Color-coded markers (gold/gray/blue) based on sun status
- [x] FastAPI backend integration — real sun/shade calculations
- [x] Building shadow detection via OpenStreetMap data
- [x] Cloud cover from Open-Meteo weather data
- [x] Time slider UI component (6:00–22:00)
- [x] Search bar toggle (tap search icon to switch from slider to search input)
- [x] Custom font (Rubik Mono One)
- [x] Mapbox map with 3D buildings and real-sun shadows that follow the time slider
- [x] Batch sun reports (one backend request for all restaurants)
- [x] Building data cache + fallback Overpass servers

---

## TODO — Next Steps

### High Priority
- [x] **Wire up the time slider** — Currently the slider doesn't change pin colors. Need to call `/sun-report` endpoint to get full-day sun data, then filter by selected time
- [x] **Add batch sun-report endpoint to FastAPI** — `/batch-sun-report` returns full-day reports for all restaurants in one request
- [x] **Real city and weather in the header** — city from the phone's geocoder, temperature + weather icon from `/weather` (Open-Meteo, cached 15 min per ~1 km area)
- [x] **Other cities** — Each location's timezone is worked out from its coordinates (`timezonefinder` on the backend)
- [x] **Load restaurants when moving the map** — Currently only fetches restaurants for starting location. Detect when user pans/zooms and fetch new restaurants for the visible region
- [x] **Restaurant detail panel** — When tapping a pin, show a panel/page with: restaurant name, address, rating, sun status, sunny hours for the day, and a link to directions

### Features
- [ ] **Category filters** — Filter by type (café, restaurant, bar) like the Good Eye app's numbered category list
- [ ] **Search functionality** — Wire up the search bar to actually search for cities/locations and move the map there
- [x] **Shadows on map** — Mapbox draws the 3D building shadows, with its sun moved to the real sun position for the selected hour
- [ ] **Favorites / saved places** — Let users save restaurants they like
- [ ] **Sun forecast** — Multi-day forecast using the `/forecast` endpoint ("Best sunny terrace for Saturday afternoon?")

### UI/Design Polish
- [ ] **Legend bar** — Add a small legend below the slider showing what gold/gray/blue dots mean
- [ ] **Loading states** — Show a spinner or skeleton while restaurants and sun data load
- [ ] **Empty states** — Show a message when no restaurants are found in an area
- [ ] **Error handling UI** — Show user-friendly messages when backend is unreachable or location is denied
- [ ] **Map style customization** — Mapbox Standard style config (theme / color overrides) to match Brillo's warm color palette
- [ ] **Marker animations** — Animate markers when sun status changes
- [ ] **Good Eye-inspired sidebar** — Clean numbered category menu with bold typography

### Backend / Performance
- [x] **Cache sun calculations** — Sun trackers are cached per location per day; weather is cached hourly per area
- [x] **Rate limit OpenStreetMap requests** — Buildings are cached in ~1 km grid cells on disk, with fallback Overpass servers
- [ ] **Cooldown for failed downloads** — An area whose building download failed is retried on every request, which can be slow
- [ ] **Own building data** — Replace public Overpass (unreliable) with an OpenStreetMap extract (e.g. Geofabrik)
- [ ] **Deploy backend** — Move FastAPI from localhost to Railway, Render, or Fly.io for real users
- [ ] **Database** — Add PostgreSQL (via Supabase or similar) for storing terrace-specific data, user favorites, and cached results
- [ ] **Real terrace positions** — Restaurant pins sit inside their building, so the backend ignores that building (otherwise it blocks the sun all day). A terrace on the shady side of its own building can therefore show sunny. Fix: use real terrace positions, e.g. Madrid's open-data terrace dataset
- [ ] **Terrace boundary data** — Store actual terrace shapes (not just pin locations) for more accurate sun calculations

### Pre-Launch
- [ ] **Restrict Google API key** — Lock to Android/iOS app package name before publishing
- [ ] **App icon and splash screen** — Design branded assets
- [ ] **App ID** — Replace the placeholder `com.anonymous.frontend` before publishing
- [ ] **Test on iOS** — Currently tested on Android (requires a development build since the Mapbox switch); the Mapbox patch's iOS half is untested
- [ ] **Upstream the Mapbox patch** — Contribute `setLights()` to @rnmapbox/maps so the patch can be removed
- [ ] **Performance testing** — Profile with 50+ markers on screen
- [x] **Proper environment variables** — Move API keys out of source code into .env files

---

## Known Issues

- `@react-native-community/slider` must be imported from `dist/Slider` directly (see Setup)
- Public Overpass servers sometimes refuse or time out; sun colors stay gray-blue for areas whose buildings couldn't be downloaded
- Open-Meteo cloud cover data may not always match real-time conditions
- Open-Meteo's free API is for **non-commercial use only** — needs a paid plan (or another provider) before launch
- The header city name needs location permission (it uses the phone's geocoder). If permission is denied the map opens on central Madrid with no city name
- Note: Set your local machine's IP in the frontend/.env file under EXPO_PUBLIC_BACKEND_URL so the mobile app can communicate with the FastAPI server over your local WiFi.

---

## Development Notes

- Always restart Expo with `npx expo start --clear` after installing packages or renaming files
- Backend must be started with `--host 0.0.0.0` to be accessible from phone
- Custom fonts in React Native: don't combine `fontFamily` with `fontWeight: 'bold'`
- Use `minWidth` on text labels next to sliders to prevent layout jumping when text width changes
