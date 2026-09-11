import React, { useState, useCallback, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import { THEME } from "../lib/theme";
import { FONTS } from "../lib/fonts";
import { TYPES } from "../lib/constants";
import { getTrip, toggleActivityDone } from "../lib/trips";
import { resolveDayDate, formatDateLabel } from "../lib/dates";
import { formatMoney } from "../lib/budget";
import { fetchDayWeather, weatherInfo } from "../lib/weather";

export function WeatherBadge({ day, dateISO }) {
  const [weather, setWeather] = useState(undefined); // undefined = loading, null = no data

  useEffect(() => {
    let cancelled = false;
    setWeather(undefined);
    fetchDayWeather(day, dateISO).then((w) => {
      if (!cancelled) setWeather(w);
    });
    return () => {
      cancelled = true;
    };
  }, [day.id, day.location, day.title, dateISO]);

  if (!weather) return null;
  const info = weatherInfo(weather.code);
  return (
    <View style={styles.weatherBadge}>
      <Text style={styles.weatherEmoji}>{info.emoji}</Text>
      <Text style={styles.weatherTemps}>
        {weather.tempMax}° / {weather.tempMin}°
      </Text>
    </View>
  );
}

export default function DayDetailScreen({ route, navigation }) {
  const { tripId, dayId } = route.params;
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const t = await getTrip(tripId);
    setTrip(t);
    setLoading(false);
  }, [tripId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  if (loading || !trip) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={THEME.teal} />
        </View>
      </SafeAreaView>
    );
  }

  const dayIndex = trip.days.findIndex((d) => d.id === dayId);
  const day = trip.days[dayIndex];
  if (!day) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>Jour introuvable.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const date = resolveDayDate(trip, day, dayIndex);
  const sorted = [...day.activities].sort((a, b) => {
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });
  const doneCount = day.activities.filter((a) => a.done).length;
  const firstUndoneIndex = sorted.findIndex((a) => !a.done);

  async function onToggleDone(activityId) {
    await toggleActivityDone(tripId, dayId, activityId);
    refresh();
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color={THEME.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{day.title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {date && <Text style={styles.headerDate}>{formatDateLabel(date)}</Text>}
            {date && <WeatherBadge day={day} dateISO={date} />}
          </View>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate("ActivityEditor", { tripId, dayId, activity: null })}
        >
          <Ionicons name="add" size={22} color={THEME.gold} />
        </TouchableOpacity>
      </View>

      {day.activities.length > 0 && (
        <Text style={styles.progressText}>
          {doneCount}/{day.activities.length} étape{day.activities.length !== 1 ? "s" : ""} faite{doneCount !== 1 ? "s" : ""}
        </Text>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {sorted.length === 0 && (
          <View style={styles.center}>
            <Text style={styles.emptyText}>Rien de prévu pour l'instant.</Text>
          </View>
        )}
        {sorted.map((a, i) => (
          <ActivityRow
            key={a.id}
            activity={a}
            trip={trip}
            isLast={i === sorted.length - 1}
            isCurrent={i === firstUndoneIndex}
            onToggleDone={() => onToggleDone(a.id)}
            onPress={() => navigation.navigate("ActivityEditor", { tripId, dayId, activity: a })}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function ActivityRow({ activity, trip, isLast, isCurrent, onToggleDone, onPress }) {
  const t = TYPES[activity.type] || TYPES.activite;
  const done = !!activity.done;
  const dotSize = isCurrent ? 16 : 11;

  return (
    <View style={styles.rowWrap}>
      <View style={styles.timeline}>
        <TouchableOpacity onPress={onToggleDone} style={styles.dotTouch} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <View
            style={[
              styles.dot,
              { width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: done ? THEME.teal : isCurrent ? THEME.gold : t.color },
            ]}
          />
        </TouchableOpacity>
        {!isLast && <View style={[styles.line, { backgroundColor: done ? THEME.teal : THEME.border }]} />}
      </View>
      <TouchableOpacity style={[styles.rowContent, { opacity: done ? 0.6 : 1 }]} onPress={onPress} activeOpacity={0.8}>
        <View style={styles.rowTop}>
          <View style={[styles.iconBadge, { backgroundColor: t.dim }]}>
            <Ionicons name={t.icon} size={15} color={t.color} />
          </View>
          <View style={styles.rowInfo}>
            <Text style={[styles.rowTitle, done && styles.rowTitleDone]}>{activity.title}</Text>
            <Text style={styles.rowTime}>{activity.time || "Heure libre"}</Text>
          </View>
        </View>
        {activity.note ? <Text style={styles.rowNote}>{activity.note}</Text> : null}
        {activity.price != null && <Text style={styles.rowPrice}>{formatMoney(activity.price, trip.currency)}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 },
  emptyText: { color: THEME.inkFaint, fontSize: 13.5, fontFamily: FONTS.body },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingTop: 6 },
  backButton: { padding: 8 },
  addButton: { padding: 8 },
  headerTitle: { fontSize: 20, color: THEME.ink, fontFamily: FONTS.headingBold },
  headerDate: { fontSize: 12.5, color: THEME.inkMuted, textTransform: "capitalize", marginTop: 2, fontFamily: FONTS.body },
  weatherBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  weatherEmoji: { fontSize: 13 },
  weatherTemps: { fontSize: 11.5, color: THEME.inkMuted, fontFamily: FONTS.mono },
  progressText: { fontSize: 11.5, color: THEME.teal, marginLeft: 44, marginTop: 2, fontFamily: FONTS.bodyMedium },
  scrollContent: { padding: 20, paddingTop: 16 },
  rowWrap: { flexDirection: "row" },
  timeline: { alignItems: "center", width: 20 },
  dotTouch: { marginTop: 4, alignItems: "center", justifyContent: "center" },
  dot: {},
  line: { flex: 1, width: 2, marginTop: 4 },
  rowContent: { flex: 1, paddingLeft: 12, paddingBottom: 22 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBadge: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowInfo: { flex: 1 },
  rowTitle: { fontSize: 15, color: THEME.ink, fontFamily: FONTS.headingSemiBold },
  rowTitleDone: { textDecorationLine: "line-through" },
  rowTime: { fontSize: 11, color: THEME.inkFaint, marginTop: 2, fontFamily: FONTS.mono },
  rowNote: { fontSize: 12, color: THEME.inkMuted, marginTop: 6, marginLeft: 44, fontFamily: FONTS.body },
  rowPrice: { fontSize: 13.5, color: THEME.gold, marginTop: 6, marginLeft: 44, fontFamily: FONTS.monoMedium },
});
