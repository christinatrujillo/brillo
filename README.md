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
   - **Gray** — In shade (blocked by buildings)
   - **Light blue** — Cloudy

---

## Project Structure

```
brillo/
├── backend/
│   ├── main.py              # Core sun tracking engine (SunTracker, building obstacles, etc.)
│   └── api.py               # FastAPI endpoints (/is-sunny, /sun-report, /batch-check, /forecast, /obstacles)
│
├── frontend/
│   ├── App.js                # Main app component (location, data fetching, state management)
│   ├── index.js              # Expo entry point
│   ├── components/
│   │   ├── Map.js            # Google Maps with restaurant markers
│   │   └── TimeSlider.js     # Time slider + search bar toggle
│   ├── services/
│   │   └── brillo-api.js     # API service (Google Places + Brillo backend calls)
│   └── assets/
│       └── fonts/            # Rubik Mono One custom font
│
└── README.md
```

---

## Tech Stack

**Frontend**
- React Native (Expo SDK 54)
- react-native-maps (Google Maps)
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
pip install fastapi uvicorn httpx astral
uvicorn api:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend
npm install
npx expo start --clear
```

### Required Keys
- **Google Places API key** — Create a .env file in the frontend directory and add EXPO_PUBLIC_GOOGLE_PLACES_KEY=your_key_here
- **Google Cloud** — Enable "Places API (New)" and "Maps SDK for Android"
- No key needed for OpenStreetMap or Open-Meteo

### Important: react-native-maps Imports
Due to a compatibility issue with Expo SDK 54, use direct file imports:
```javascript
import MapView from 'react-native-maps';
import Marker from 'react-native-maps/lib/MapMarker';
```
Named imports like `import { Marker } from 'react-native-maps'` will not work.

Similarly for the slider:
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

---

## TODO — Next Steps

### High Priority
- [x] **Wire up the time slider** — Currently the slider doesn't change pin colors. Need to call `/sun-report` endpoint to get full-day sun data, then filter by selected time
- [ ] **Add batch sun-report endpoint to FastAPI** — Currently `/sun-report` only handles one location at a time. Add a `/batch-sun-report` endpoint that accepts multiple locations + a time parameter to avoid 20 individual API calls
- [x] **Load restaurants when moving the map** — Currently only fetches restaurants for starting location. Detect when user pans/zooms and fetch new restaurants for the visible region
- [x] **Restaurant detail panel** — When tapping a pin, show a panel/page with: restaurant name, address, rating, sun status, sunny hours for the day, and a link to directions

### Features
- [ ] **Category filters** — Filter by type (café, restaurant, bar) like the Good Eye app's numbered category list
- [ ] **Search functionality** — Wire up the search bar to actually search for cities/locations and move the map there
- [ ] **Shadow overlay on map** — Draw shadow polygons on the map using building data from `/obstacles` endpoint. Use `MapPolygon` from react-native-maps
- [ ] **Favorites / saved places** — Let users save restaurants they like
- [ ] **Sun forecast** — Multi-day forecast using the `/forecast` endpoint ("Best sunny terrace for Saturday afternoon?")

### UI/Design Polish
- [ ] **Legend bar** — Add a small legend below the slider showing what gold/gray/blue dots mean
- [ ] **Loading states** — Show a spinner or skeleton while restaurants and sun data load
- [ ] **Empty states** — Show a message when no restaurants are found in an area
- [ ] **Error handling UI** — Show user-friendly messages when backend is unreachable or location is denied
- [ ] **Map style customization** — Custom Google Maps styling to match Brillo's warm color palette
- [ ] **Marker animations** — Animate markers when sun status changes
- [ ] **Good Eye-inspired sidebar** — Clean numbered category menu with bold typography

### Backend / Performance
- [ ] **Cache sun calculations** — Avoid recalculating for the same location within a short time window
- [ ] **Rate limit OpenStreetMap requests** — Batch or cache building data to avoid hitting Overpass API limits
- [ ] **Deploy backend** — Move FastAPI from localhost to Railway, Render, or Fly.io for real users
- [ ] **Database** — Add PostgreSQL (via Supabase or similar) for storing terrace-specific data, user favorites, and cached results
- [ ] **Terrace boundary data** — Store actual terrace shapes (not just pin locations) for more accurate sun calculations

### Pre-Launch
- [ ] **Restrict Google API key** — Lock to Android/iOS app package name before publishing
- [ ] **App icon and splash screen** — Design branded assets
- [ ] **Test on iOS** — Currently tested on Android via Expo Go
- [ ] **Performance testing** — Profile with 50+ markers on screen
- [x] **Proper environment variables** — Move API keys out of source code into .env files

---

## Known Issues

- `react-native-maps` named exports don't work with Expo SDK 54 / React Native 0.83 — must use direct file path imports
- `@react-native-community/slider` has the same issue — import from `dist/Slider` directly
- `pinColor` prop on Marker doesn't work with direct imports — using custom View inside Marker instead
- Open-Meteo cloud cover data may not always match real-time conditions
- Note: Set your local machine's IP in the frontend/.env file under EXPO_PUBLIC_BACKEND_URL so the mobile app can communicate with the FastAPI server over your local WiFi.

---

## Development Notes

- Always restart Expo with `npx expo start --clear` after installing packages or renaming files
- Backend must be started with `--host 0.0.0.0` to be accessible from phone
- Custom fonts in React Native: don't combine `fontFamily` with `fontWeight: 'bold'`
- Use `minWidth` on text labels next to sliders to prevent layout jumping when text width changes
