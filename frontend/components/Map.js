import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Mapbox from '@rnmapbox/maps';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef } from 'react';
import { sunPosition, localTimeToday } from '../utils/sunPosition';
import { getSunStatus, SUN_STATUS } from '../utils/sunStatus';

// Our lights: soft daylight from all sides, plus a directional "sun" placed where the
// real sun is at the slider time, casting the building shadows.
function buildLights(hour, latitude, longitude, timezone) {
    const sun = sunPosition(localTimeToday(hour, timezone), latitude, longitude);
    const sunUp = sun.altitude > 0;
    return [
        { id: 'ambient', type: 'ambient', properties: { color: 'hsl(0, 0%, 100%)', intensity: 0.8 } },
        {
            id: 'sun',
            type: 'directional',
            properties: {
                // [where the sun is (degrees from north), how far from straight overhead]
                direction: [sun.azimuth, sunUp ? Math.min(89, 90 - sun.altitude) : 89],
                color: 'hsl(0, 0%, 100%)',
                intensity: sunUp ? 0.5 : 0,
                'cast-shadows': sunUp,
                'shadow-intensity': 1,
            },
        },
    ];
}

// Mapbox Standard ("Monochrome" look) with our lights. Loaded once; after that only the
// lights change (map.setLights), so moving the slider doesn't reload or flash the map.
function buildStyleJSON(lights) {
    return JSON.stringify({
        version: 8,
        imports: [{
            id: 'basemap',
            url: 'mapbox://styles/mapbox/standard',
            config: {
                lightPreset: 'day',
                theme: 'monochrome',
                show3dObjects: true,
                showPointOfInterestLabels: false,
                showTransitLabels: false,
            },
        }],
        lights,
        sources: {},
        layers: [],
    });
}

export default function Map({ region, restaurants, selectedTime, sunTime = selectedTime, timezone, onMarkerPress, onMapMove }) {
    const cameraRef = useRef(null);
    const mapRef = useRef(null);
    const lastCenter = useRef(null);
    const styleLoaded = useRef(false);

    // Follows the slider while it's being dragged (sunTime), not just on release.
    const lights = useMemo(
        () => buildLights(sunTime, region.latitude, region.longitude, timezone),
        [sunTime, region.latitude, region.longitude, timezone],
    );

    // The style is built once, with the starting sun. Never rebuilt, because a new style reloads the map.
    const styleJSON = useRef(null);
    if (styleJSON.current === null) styleJSON.current = buildStyleJSON(lights);

    // Move the sun live when the slider hour changes.
    const latestLights = useRef(lights);
    latestLights.current = lights;
    const applyLights = () => {
        if (!styleLoaded.current || !mapRef.current) return;
        mapRef.current.setLights(latestLights.current).catch((e) => console.log('setLights failed:', e.message));
    };
    useEffect(applyLights, [lights]);

    const centerOnUser = () => {
        if (region && cameraRef.current) {
            cameraRef.current.setCamera({
                centerCoordinate: [region.longitude, region.latitude],
                zoomLevel: 15,
                animationDuration: 500,
            });
        }
    };

    return (
        <View style={styles.container}>
            <Mapbox.MapView
                ref={mapRef}
                style={styles.map}
                styleJSON={styleJSON.current}
                onDidFinishLoadingStyle={() => {
                    styleLoaded.current = true;
                    applyLights(); // in case the slider moved while the style was loading
                }}
                scaleBarEnabled={false}
                logoPosition={{ bottom: 8, left: 8 }}
                attributionPosition={{ bottom: 8, right: 8 }}
                pitchEnabled={true}
                onMapIdle={(state) => {
                    const [longitude, latitude] = state.properties.center;
                    const last = lastCenter.current;
                    // Mapbox also fires "idle" when markers redraw. Ignore those, or loading
                    // restaurants -> redraw -> idle -> load again loops forever (and bills Google Places).
                    // Only report a move when the center shifts by more than ~50 m.
                    if (last && Math.abs(last.latitude - latitude) < 0.0005 && Math.abs(last.longitude - longitude) < 0.0005) return;
                    const isFirstIdle = last === null;
                    lastCenter.current = { latitude, longitude };
                    // The first idle is just the map finishing its initial load; App.js already loaded restaurants for it.
                    if (isFirstIdle) return;
                    if (onMapMove) onMapMove({ latitude, longitude });
                }}
            >
                <Mapbox.Camera
                    ref={cameraRef}
                    defaultSettings={{
                        centerCoordinate: [region.longitude, region.latitude],
                        zoomLevel: 15,
                    }}
                />

                <Mapbox.LocationPuck puckBearingEnabled={false} />

                {restaurants.map((restaurant) => (
                    <Mapbox.MarkerView
                        key={restaurant.id}
                        coordinate={[restaurant.longitude, restaurant.latitude]}
                        allowOverlap={true}
                    >
                        <TouchableOpacity
                            accessibilityLabel={restaurant.name}
                            onPress={() => onMarkerPress(restaurant)}
                            style={[styles.marker, { backgroundColor: SUN_STATUS[getSunStatus(restaurant.sunReport, selectedTime)].color }]}
                        />
                    </Mapbox.MarkerView>
                ))}
            </Mapbox.MapView>

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
    marker: {
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 3,
        borderColor: 'white',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 4,
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
