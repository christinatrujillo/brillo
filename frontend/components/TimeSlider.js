import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import Slider from '@react-native-community/slider/dist/Slider';
import { Ionicons } from '@expo/vector-icons';

export default function TimeSlider({ selectedTime, displayTime, onTimeChange, onTimeSlide }) {
    const [isSearching, setIsSearching] = useState(false);
    const [searchText, setSearchText] = useState('');

    if (isSearching) {
        return (
            <View style={styles.container}>
                <View style={styles.sliderRow}>
                    <TextInput 
                        style={styles.searchInput}
                        placeholder="Search city..."
                        placeholderTextColor="white"
                        value={searchText}
                        onChangeText={setSearchText}
                        autoFocus={true}
                    />
                    <TouchableOpacity onPress={() => setIsSearching(false)} style={styles.iconButton}>
                     <Ionicons name="close" size={22} color="white"/>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
    <View style={styles.container}>
      <View style={styles.sliderRow}>
        <View style={styles.timePill}>
          <Text style={styles.timePillText}>{displayTime}:00</Text>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={6}
          maximumValue={22}
          step={1}
          value={displayTime}
          onValueChange={onTimeSlide}
          onSlidingComplete={onTimeChange}
          minimumTrackTintColor="#FFFFFF"
          maximumTrackTintColor="rgba(255,255,255,0.3)"
          thumbTintColor="#FFFFFF"
        />
     <TouchableOpacity onPress={()=> setIsSearching(true)} style={styles.iconButton}>
        <Ionicons name="search" size={22} color="white"/>
     </TouchableOpacity>
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timePill: {
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
  },
  timePillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#d4593a',
    letterSpacing: 1,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  iconButton: {
    padding: 10,
    marginLeft: 5,
  },
  searchInput: {
    flex: 1,
    height: 50,
    backgroundColor: '#d4593a',
    borderRadius: 50,
    paddingHorizontal: 20,
    color: 'white',
    fontSize: 12,
    textAlign: 'left',
  },
});