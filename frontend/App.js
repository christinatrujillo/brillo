import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import * as Font from 'expo-font';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Mapbox from '@rnmapbox/maps';
import Map from './components/Map';
import TimeSlider from './components/TimeSlider';
import RestaurantPanel from './components/RestaurantPanel';
import { fetchNearbyRestaurants, fetchSunReports, fetchWeather, fetchCityName } from './services/brillo-api';
import { weatherIcon } from './utils/weatherIcon';

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN);

// How long the map must stay still before loading restaurants for the new area.
const MAP_MOVE_DEBOUNCE_MS = 1500;

// Where the map opens when we can't get the phone's location (Puerta del Sol, Madrid).
const FALLBACK_REGION = { latitude: 40.4168, longitude: -3.7038 };

export default function App() {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [selectedTime, setSelectedTime] = useState(14); // hour the slider was released on
  const [displayTime, setDisplayTime] = useState(14);   // hour shown while dragging
  const [restaurants, setRestaurants] = useState([]);
  const [region, setRegion] = useState(null);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [cityName, setCityName] = useState(null); // header city, e.g. "Madrid"
  const [weather, setWeather] = useState(null);   // header weather, from the backend

  const mapMoveTimer = useRef(null);

  useEffect(() => {
    Font.loadAsync({
      RubikMonoOne: require('./assets/fonts/Rubik_Mono_One/RubikMonoOne-Regular.ttf'),
    }).then(() => setFontsLoaded(true));
  }, []);

  // Restaurants appear right away (gray); their sun colors fill in once the backend answers.
  const loadRestaurants = async (latitude, longitude) => {
    const places = await fetchNearbyRestaurants(latitude, longitude);
    setRestaurants(places);

    try {
      const sunReports = await fetchSunReports(places);
      setRestaurants(places.map((place) => ({
        ...place,
        sunReport: sunReports.find((s) => s.id === place.id)?.report ?? null,
      })));
    } catch (error) {
      console.log('Sun API error:', error);
    }
  };

  // City name + weather for the header. Loaded separately so that if one fails,
  // the other still shows up.
  const loadAreaInfo = (latitude, longitude) => {
    fetchCityName(latitude, longitude)
      .then(setCityName)
      .catch((error) => {
        console.log('City name error:', error.message);
        setCityName(null); // show no city rather than the wrong one
      });
    fetchWeather(latitude, longitude)
      .then(setWeather)
      .catch((error) => console.log('Weather error:', error.message));
  };

  useEffect(() => {
    if (!fontsLoaded) return;

    async function loadLocation() {
      // Start on central Madrid; replaced by the phone's location if we can get it.
      // This way the app never gets stuck on a blank screen.
      let start = FALLBACK_REGION;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({});
          start = { latitude: location.coords.latitude, longitude: location.coords.longitude };
        } else {
          console.log('Location permission denied; opening on central Madrid');
        }
      } catch (error) {
        // e.g. location turned off in the phone's settings
        console.log('Location error; opening on central Madrid:', error.message);
      }

      setRegion(start);
      loadAreaInfo(start.latitude, start.longitude);
      loadRestaurants(start.latitude, start.longitude).catch((error) => {
        console.error('Failed to load restaurants:', error);
      });
    }

    loadLocation();
  }, [fontsLoaded]);

  const handleMapMove = ({ latitude, longitude }) => {
    if (mapMoveTimer.current) clearTimeout(mapMoveTimer.current);
    mapMoveTimer.current = setTimeout(() => {
      loadAreaInfo(latitude, longitude);
      loadRestaurants(latitude, longitude).catch((error) => {
        console.error('Failed to load restaurants:', error);
      });
    }, MAP_MOVE_DEBOUNCE_MS);
  };

  // Wait for fonts + location before drawing. Must stay below the hooks above.
  if (!fontsLoaded || !region) {
    return null;
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#eb7e56', '#d4593a']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.brandPill}>
          <TouchableOpacity style={styles.brilloButton}>
            <Text style={styles.title}>Brillo</Text>
            <Ionicons name="chevron-down" size={14} color="white" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
          {cityName && <Text style={styles.cityName}>{cityName}</Text>}
          {/* Hidden until the real weather arrives, instead of showing a made-up number. */}
          {weather && (
            <View style={styles.weatherWrapper}>
              <Ionicons name={weatherIcon(weather)} size={18} color="white" />
              <Text style={styles.tempText}>{Math.round(weather.temperature)}°</Text>
            </View>
          )}
        </View>
        <TimeSlider
          displayTime={displayTime}
          onTimeChange={setSelectedTime}
          onTimeSlide={setDisplayTime}
        />
      </LinearGradient>
      <Map
        region={region}
        restaurants={restaurants}
        selectedTime={selectedTime}
        sunTime={displayTime}
        timezone={weather?.timezone}
        onMarkerPress={setSelectedRestaurant}
        onMapMove={handleMapMove}
      />
      <RestaurantPanel
        restaurant={selectedRestaurant}
        selectedTime={selectedTime}
        onClose={() => setSelectedRestaurant(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: 40,
    left: 20,
    right: 20,
    zIndex: 10,
    padding: 16,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brilloButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weatherWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
    paddingRight: 4,
  },
  tempText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '500',
  },
  title: {
    fontSize: 20,
    fontFamily: 'RubikMonoOne',
    color: 'white',
    textAlign: 'center',
  },
  cityName: {
    fontSize: 14,
    color: 'rgb(255, 255, 255)',
    fontWeight: '500',
  },
});
