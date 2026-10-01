import React, { useState, useCallback } from "react";
import { View, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";

import { THEME, layout, themedStyles } from "../lib/theme";
import { getTrip } from "../lib/trips";
import { scopedId } from "../lib/parkDay";
import { resolveDayDate, formatDayLabel } from "../lib/dates";
import AttractionsTab from "./AttractionsTab";
import { EmptyState, BackHeader } from "../components/ui";

// The park of one day of a normal trip and its attractions: the same tools as
// the "Attractions" tab of a park trip, for this day only (see lib/parkDay.js).
export default function DayAttractionsScreen({ route, navigation }) {
  const { tripId, dayId } = route.params;
  const id = scopedId(tripId, dayId);
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setTrip(await getTrip(id));
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const back = () => navigation.goBack();
  const day = trip ? trip.days.find((d) => d.id === dayId) : null;
  const date = day ? resolveDayDate(trip, day, trip.days.indexOf(day)) : null;
  const header = (
    <BackHeader
      title="Attractions du jour"
      subtitle={day ? `${day.title}${date ? `, ${formatDayLabel(date)}` : ""}` : undefined}
      onBack={back}
    />
  );

  if (loading || !trip || !day) {
    return (
      <SafeAreaView style={styles.safe}>
        {header}
        <View style={styles.center}>
          {loading ? (
            <ActivityIndicator color={THEME.teal} />
          ) : (
            <EmptyState icon="alert-circle-outline" title="Jour introuvable" text="Ce jour n'existe plus dans ce voyage." action={{ label: "Retour", onPress: back }} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      {header}
      <AttractionsTab trip={trip} navigation={navigation} onChange={refresh} />
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: layout.gutter },
}));
