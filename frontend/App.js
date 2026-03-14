import { useState, useEffect, useRef} from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import * as Font from 'expo-font';
import Map from './components/Map';
import TimeSlider from './components/TimeSlider';
import { fetchNearbyRestaurants, fetchSunReports, fetchShadows } from './services/brillo-api';
import * as Location from 'expo-location';
import { mapStyle } from './styles/mapStyle';
import RestaurantPanel from './components/RestaurantPanel';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export default function App() {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [selectedTime, setSelectedTime] = useState(14);
  const [displayTime, setDisplayTime] = useState(14);
  const [restaurants, setRestaurants] = useState([]);
  const [region, setRegion] = useState(null);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [shadows, setShadows] = useState([]);

  const mapMoveTimer = useRef(null);

  useEffect(() => {
    async function loadFonts() {
      await Font.loadAsync ({
        'RubikMonoOne': require('./assets/fonts/Rubik_Mono_One/RubikMonoOne-Regular.ttf')
      })
      setFontsLoaded(true);
    }
    loadFonts();
  }, []);

  useEffect(() => {
  async function loadLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission denied');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;

      setRegion({
        latitude,
        longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      });

      // loadShadows(latitude, longitude, selectedTime);

      const places = await fetchNearbyRestaurants(latitude, longitude);

      try {
        const sunReports = await fetchSunReports(places);
        const merged = places.map((place) => {
          const sun = sunReports.find((s) => s.id === place.id);
          return {
            ...place,
            sunReport: sun ? sun.report : null,
          };
        });
        setRestaurants(merged);
        console.log('Loaded', merged.length, 'restaurants with sun reports');
      } catch (sunError) {
        console.log('Sun API error:', sunError);
        setRestaurants(places);
      }
    } catch (error) {
      console.error('Location error:', error);
    }
  }

    if (fontsLoaded) {
      loadLocation();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded || !region) {
    return null;
  }

  const handleMapMove = (newRegion) => {
    console.log('Map moved to:', newRegion.latitude, newRegion.longitude);
    if (mapMoveTimer.current) clearTimeout(mapMoveTimer.current);
    
    mapMoveTimer.current = setTimeout(async () => {
        try {
            const places = await fetchNearbyRestaurants(newRegion.latitude, newRegion.longitude);
            
            try {
                const sunReports = await fetchSunReports(places);
                const merged = places.map((place) => {
                    const sun = sunReports.find((s) => s.id === place.id);
                    return {
                        ...place,
                        sunReport: sun ? sun.report : null,
                    };
                });
                setRestaurants(merged);
            } catch (sunError) {
                setRestaurants(places);
            }
        } catch (error) {
            console.error('Failed to load restaurants:', error);
        }
    }, 1500);
  };

  const loadShadows = async (lat, lon, hour) => {
      try {
          const result = await fetchShadows(lat, lon, hour, 0);
          setShadows(result);
          console.log('Loaded', result.length, 'shadows');
      } catch (error) {
          console.log('Shadow fetch failed:', error);
      }
  };

  const handleMarkerPress = (restaurant) => {
    setSelectedRestaurant(restaurant);
  };

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
            <Ionicons 
              name="chevron-down"
              size={14} 
              color="white" 
              style={{marginLeft: 6}}
              />
          </TouchableOpacity>
          <Text style={styles.cityName}>Madrid</Text>
          <View style={styles.weatherWrapper}>
            <Ionicons name="sunny" size={18} color="white" />
            <Text style={styles.tempText}>22°</Text>
          </View>
          </View>
            <View style={styles.sliderWrapper}>
                <TimeSlider
                    selectedTime={selectedTime}
                    displayTime={displayTime}
                    onTimeChange={(time) => {
                        setSelectedTime(time);
                        if (region) loadShadows(region.latitude, region.longitude, time);
                    }}
                    onTimeSlide={setDisplayTime}
                />
            </View>
        </LinearGradient>
        <Map
            region={region}
            restaurants={restaurants}
            selectedTime={selectedTime}
            onMarkerPress={handleMarkerPress}
            customMapStyle={mapStyle}
            onMapMove={handleMapMove}
            shadows={shadows}
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
    // backgroundColor: '#FF785A',
  },
  header: {
    position: 'absolute',
    // paddingTop: 54,
    // paddingHorizontal: 24,
    // paddingBottom: 12,
    // backgroundColor: '#FF785A',
    top: 40,             
    left: 20,
    right: 20,
    zIndex: 10, // depth   
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
  sliderWrapper: {
    // flex: 1,
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
    //backgroundColor: '#F9AB55',
  },
  cityName: {
    fontSize: 14,
    color: 'rgb(255, 255, 255)',
    fontWeight: '500',
  },
});