// The bilan of a trip as a page of its own: the same as the "Bilan" tab, opened from the programme whatever the state of
// the trip (photos can be added along the way).
import React, { useState, useCallback } from "react";
import { View, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { THEME, layout, themedStyles } from "../lib/theme";
import { getTrip } from "../lib/trips";
import { tripInk, TripInkContext } from "../lib/tripInk";
import { TripTopBar } from "../components/mix";
import BilanTab from "./trip/BilanTab";

export default function RecapScreen({ route, navigation }) {
  const { tripId } = route.params;
  const [trip, setTrip] = useState(null);

  const refresh = useCallback(() => getTrip(tripId).then(setTrip), [tripId]);
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  if (!trip) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={THEME.teal} />
        </View>
      </SafeAreaView>
    );
  }
  return (
    <TripInkContext.Provider value={tripInk(trip)}>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <TripTopBar name={trip.name} onBack={() => navigation.goBack()} backLabel="Retour au voyage" />
        <View style={{ flex: 1 }}>
          <BilanTab trip={trip} navigation={navigation} onChange={refresh} />
        </View>
      </SafeAreaView>
    </TripInkContext.Provider>
  );
}

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: layout.gutter },
}));
