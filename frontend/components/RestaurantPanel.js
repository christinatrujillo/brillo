import { View, Text, StyleSheet, TouchableOpacity, Linking, Share } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { getSunStatus, SUN_STATUS } from '../utils/sunStatus';

function RestaurantPanel({ restaurant, selectedTime, onClose }) {
    const [saved, setSaved] = useState(false);
    if (!restaurant) return null;

    const sunReport = restaurant.sunReport;
    const status = SUN_STATUS[getSunStatus(sunReport, selectedTime)];

    const sunWindows = sunReport?.sun_windows || [];
    const totalSunHours = sunReport?.total_sun_hours || 0;

    return (
        <View style={styles.container}>
            <View style={styles.handle} />

            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Ionicons name="close" size={20} color="#999" />
            </TouchableOpacity>
            <Text style={styles.name}>{restaurant.name}</Text>
            {restaurant.address && (
                <Text style={styles.address}>{restaurant.address}</Text>
            )}

            <View style={styles.infoRow}>
                <TouchableOpacity
                    style={styles.infoPill}
                    onPress={() => {
                        const url = `geo:${restaurant.latitude},${restaurant.longitude}?q=${encodeURIComponent(restaurant.name)}`;
                        Linking.openURL(url);
                    }}
                >
                    <Ionicons name="star" size={12} color="#F9AB55" />
                    <Text style={styles.pillText}>{restaurant.rating}</Text>
                </TouchableOpacity>

                {restaurant.primaryType && (
                    <View style={styles.infoPill}>
                        <Text style={styles.pillText}>{restaurant.primaryType.replace(/_/g, ' ')}</Text>
                    </View>
                )}

                <View style={[styles.infoPill, {
                    backgroundColor: restaurant.outdoorSeating ? '#E8F5E9' : '#FFF3E0',
                }]}>
                    <Ionicons
                        name={restaurant.outdoorSeating ? 'checkmark-circle' : 'close-circle'}
                        size={14}
                        color={restaurant.outdoorSeating ? '#4CAF50' : '#D32F2F'}
                    />
                    <Text style={[styles.pillText, {
                        color: restaurant.outdoorSeating ? '#4CAF50' : '#D32F2F'
                    }]}>
                        Terrace
                    </Text>
                </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.statusRow}>
                <Ionicons name={status.icon} size={20} color={status.color} />
                <Text style={styles.statusText}>
                    {status.label} at {selectedTime}:00
                </Text>
            </View>

            {totalSunHours > 0 && (
                <Text style={styles.totalSun}>
                    {totalSunHours} hours of sun today
                </Text>
            )}

            {sunWindows.length > 0 && (
                <View style={styles.windowsSection}>
                    <Text style={styles.windowsTitle}>Sunny hours</Text>
                    {sunWindows.map((w, i) => (
                        <View key={i} style={styles.windowRow}>
                            <Ionicons name="sunny-outline" size={16} color="#F9AB55" />
                            <Text style={styles.windowText}>
                                {w.start} — {w.end}
                            </Text>
                            <Text style={styles.windowDuration}>
                                {Math.floor(w.duration_minutes / 60)}h {w.duration_minutes % 60}m
                            </Text>
                        </View>
                    ))}
                </View>
            )}

            <View style={styles.hoursSection}>
                <View style={styles.hoursHeader}>
                    <Ionicons name="time-outline" size={16} color="#666"/>
                    <Text style={styles.hoursTitle}>Opening Hours</Text>
                </View>

                <Text style={styles.hoursText}>
                    {restaurant.currentHours || "Not available"}
                </Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.buttonRow}>
                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => {
                        const url = `https://www.google.com/maps/dir/?api=1&destination=${restaurant.latitude},${restaurant.longitude}`;
                        Linking.openURL(url);
                    }}
                >
                    <Ionicons name="navigate" size={22} color="#FF785A" />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={async () => {
                        await Share.share({
                            message: `Check out ${restaurant.name}! It has ${totalSunHours} hours of sun today. Found on Brillo.`,
                        });
                    }}
                >
                    <Ionicons name="share-outline" size={22} color="#FF785A" />
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.actionButton, saved && styles.actionButtonSaved]}
                    onPress={() => setSaved(!saved)}
                >
                    <Ionicons
                        name={saved ? "heart" : "heart-outline"}
                        size={22}
                        color={saved ? "white" : "#FF785A"}
                    />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'white',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 24,
        paddingBottom: 40,
        paddingTop: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 10,
    },
    handle: {
        width: 36,
        height: 4,
        backgroundColor: '#DDD',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 16,
    },
    closeButton: {
        position: 'absolute',
        top: 16,
        right: 20,
        padding: 4,
    },
    name: {
        fontSize: 20,
        fontFamily: 'RubikMonoOne',
        color: '#222',
        marginBottom: 6,
        paddingRight: 30,
    },
    address: {
        fontSize: 13,
        color: '#888',
        marginBottom: 8,
    },
    divider: {
        height: 1,
        backgroundColor: '#EEE',
        marginVertical: 16,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 8,
    },
    statusText: {
        fontSize: 16,
        fontFamily: 'RubikMonoOne',
        color: '#333',
    },
    totalSun: {
        fontSize: 13,
        color: '#888',
        marginBottom: 12,
    },
    windowsSection: {
        marginTop: 8,
    },
    windowsTitle: {
        fontSize: 14,
        fontFamily: 'RubikMonoOne',
        color: '#444',
        marginBottom: 10,
    },
    windowRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: '#FFF9F0',
        borderRadius: 10,
        marginBottom: 6,
    },
    windowText: {
        fontSize: 14,
        color: '#444',
        flex: 1,
    },
    windowDuration: {
        fontSize: 12,
        color: '#999',
    },
    infoRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 8,
        marginBottom: 4,
        justifyContent: 'flex-start',
    },
    infoPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F5F5F5',
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    pillText: {
        fontSize: 11,
        color: '#666',
        fontWeight: '600',
        textTransform: 'capitalize',
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 4,
        justifyContent: 'center',
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: '#FFF0EB',
    },
    actionButtonSaved: {
        backgroundColor: '#FF785A',
    },
    hoursSection: {
        marginTop: 16,
        paddingHorizontal: 4,
    },
    hoursHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
    },
    hoursTitle: {
        fontSize: 14,
        fontFamily: 'RubikMonoOne',
        color: '#444',
    },
    hoursText: {
        fontSize: 13,
        color: '#666',
        lineHeight: 18,
    },
});

export default RestaurantPanel;
