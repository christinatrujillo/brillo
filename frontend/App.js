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
import { fetchNearbyRestaurants, fetchSunReports } from './services/brillo-api';

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN);

// How long the map must stay still before loading restaurants for the new area.
const MAP_MOVE_DEBOUNCE_MS = 1500;

export default function App() {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [selectedTime, setSelectedTime] = useState(14); // hour the slider was released on
  const [displayTime, setDisplayTime] = useState(14);   // hour shown while dragging
  const [restaurants, setRestaurants] = useState([]);
  const [region, setRegion] = useState(null);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);

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

  useEffect(() => {
    if (!fontsLoaded) return;

    async function loadLocation() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.log('Location permission denied');
          return;
        }

        const location = await Location.getCurrentPositionAsync({});
        const { latitude, longitude } = location.coords;
        setRegion({ latitude, longitude });
        await loadRestaurants(latitude, longitude);
      } catch (error) {
        console.error('Location error:', error);
      }
    }

    loadLocation();
  }, [fontsLoaded]);

  const handleMapMove = ({ latitude, longitude }) => {
    if (mapMoveTimer.current) clearTimeout(mapMoveTimer.current);
    mapMoveTimer.current = setTimeout(() => {
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
          <Text style={styles.cityName}>Madrid</Text>
          <View style={styles.weatherWrapper}>
            <Ionicons name="sunny" size={18} color="white" />
            <Text style={styles.tempText}>22°</Text>
          </View>
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
