import { View, StyleSheet, TouchableOpacity } from 'react-native';
import MapView from 'react-native-maps';
import Marker from 'react-native-maps/lib/MapMarker';
import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import Polygon from 'react-native-maps/lib/MapPolygon';

export default function Map({ region, restaurants, selectedTime, onMarkerPress, customMapStyle, onMapMove, shadows }) {
    const mapRef = useRef(null);

    const centerOnUser = () => {
        if (region && mapRef.current) {
            mapRef.current.animateCamera({
                center: {
                    latitude: region.latitude,
                    longitude: region.longitude,
                },
                zoom: 15,
            }, { duration: 500 });
        }
    };

    return (
        <View style={styles.container}>
            <MapView
                ref={mapRef}
                style={styles.map}
                provider="google"
                initialRegion={region}
                showsUserLocation={true}
                showsMyLocationButton={false}
                toolbarEnabled={false}
                customMapStyle={customMapStyle}
                onRegionChangeComplete={(newRegion) => {
                    if (onMapMove) onMapMove(newRegion);
                }}
            >
                {shadows.map((shadow, index) => (
                    <Polygon
                        key={`shadow-${index}`}
                        coordinates={shadow.polygon.map(([lat, lng]) => ({
                            latitude: lat,
                            longitude: lng,
                        }))}
                        fillColor="rgba(0, 0, 0, 0.15)"
                        strokeColor="rgba(0, 0, 0, 0.05)"
                        strokeWidth={0.5}
                    />
                ))}
                {restaurants.map((restaurant) => {
                    let markerColor = '#909CC2';

                    if (restaurant.sunReport && restaurant.sunReport.sun_path) {
                        const targetMinutes = selectedTime * 60;
                        let closest = null;
                        let closestDiff = Infinity;

                        for (const t of restaurant.sunReport.sun_path) {
                            const [h, m] = t.time.split(':').map(Number);
                            const diff = Math.abs((h * 60 + m) - targetMinutes);
                            if (diff < closestDiff) {
                                closestDiff = diff;
                                closest = t;
                            }
                        }

                        if (closest) {
                            if (closest.is_sunny) markerColor = '#F9AB55';
                            else if (closest.is_sunny_geometry && !closest.is_sunny_weather) markerColor = '#084887';
                        }
                    }

                    return (
                        <Marker
                            key={restaurant.id}
                            coordinate={{
                                latitude: restaurant.latitude,
                                longitude: restaurant.longitude,
                            }}
                            title={restaurant.name}
                            onPress={() => onMarkerPress(restaurant)}
                        >
                            <View style={{
                                width: 28,
                                height: 28,
                                borderRadius: 14,
                                backgroundColor: markerColor,
                                borderWidth: 3,
                                borderColor: 'white',
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.3,
                                shadowRadius: 3,
                                elevation: 4,
                            }} />
                        </Marker>
                    );
                })}
            </MapView>

            <TouchableOpacity style={styles.locationButton} onPress={centerOnUser}>
                <Ionicons name="locate" size={24} color="#FF785A" />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    map: {
        flex: 1,
    },
    locationButton: {
        position: 'absolute',
        bottom: 70,
        right: 20,
        backgroundColor: 'white',
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
});