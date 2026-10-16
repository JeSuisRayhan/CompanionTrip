// The notebook of ideas (or the park attractions) of a trip, on a page of its own.
import React, { useState, useCallback } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { THEME, layout, themedStyles } from "../lib/theme";
import { getTrip } from "../lib/trips";
import { tripInk, TripInkContext } from "../lib/tripInk";
import { TripChromeContext } from "../components/TripScroll";
import { TripTopBar, PageHead } from "../components/mix";
import IdeasTab from "./IdeasTab";
import AttractionsTab from "./AttractionsTab";

export default function IdeasScreen({ route, navigation, attractions }) {
  const { tripId } = route.params;
  const [trip, setTrip] = useState(null);
  const load = useCallback(async () => setTrip(await getTrip(tripId)), [tripId]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  if (!trip) return <SafeAreaView style={styles.safe} />;
  const chrome = {
    top: (
      <View style={styles.head}>
        <PageHead title={attractions ? "Attractions" : "Idées"} sub={attractions ? "Ce qui vous fait envie, avec les temps d'attente" : "Les lieux à poser sur vos jours"} />
      </View>
    ),
    onScroll: () => {},
    takeRestore: () => 0,
  };
  return (
    <TripInkContext.Provider value={tripInk(trip)}>
      <TripChromeContext.Provider value={chrome}>
        <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
          <TripTopBar name={trip.name} onBack={() => navigation.goBack()} backLabel="Retour au voyage" />
          {attractions ? <AttractionsTab trip={trip} navigation={navigation} onChange={load} /> : <IdeasTab trip={trip} navigation={navigation} onChange={load} />}
        </SafeAreaView>
      </TripChromeContext.Provider>
    </TripInkContext.Provider>
  );
}

export function AttractionsScreen(props) {
  return <IdeasScreen {...props} attractions />;
}

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  head: { paddingHorizontal: layout.gutter, paddingTop: 20, paddingBottom: 4 },
}));
