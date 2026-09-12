import React, { useState, useCallback, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import { THEME, CARD_SHADOW } from "../lib/theme";
import { FONTS } from "../lib/fonts";
import { TYPES } from "../lib/constants";
import { getTrip, toggleActivityDone, setDayLocation } from "../lib/trips";
import { resolveDayDate, formatDateLabel } from "../lib/dates";
import { formatMoney } from "../lib/budget";
import { fetchDayWeather, weatherInfo, guessDayLocation } from "../lib/weather";

export function WeatherBadge({ day, dateISO, compact, fallbackLocation }) {
  const [weather, setWeather] = useState(undefined); // undefined = loading, null = no data
  const location = guessDayLocation(day, fallbackLocation);

  useEffect(() => {
    let cancelled = false;
    setWeather(undefined);
    fetchDayWeather(day, dateISO, fallbackLocation).then((w) => {
      if (!cancelled) setWeather(w);
    });
    return () => {
      cancelled = true;
    };
  }, [day.id, day.location, day.title, dateISO, fallbackLocation]);

  if (weather === undefined) return null; // still loading — avoid flashing a message
  if (weather) {
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

  // weather === null. In the compact (list-card) context, silently show nothing —
  // explaining why on every single day card would be noisy. The full explanation
  // only shows in the day detail view, right next to the location-edit action.
  if (compact) return null;

  if (!location) {
    return <Text style={styles.weatherUnavailable}>Ajoutez un lieu pour la météo</Text>;
  }
  const daysAhead = dateISO ? Math.round((new Date(dateISO + "T00:00:00") - new Date()) / 86400000) : null;
  if (daysAhead != null && (daysAhead > 15 || daysAhead < -1)) {
    return <Text style={styles.weatherUnavailable}>Prévision indisponible (trop loin dans le temps)</Text>;
  }
  return <Text style={styles.weatherUnavailable}>Prévision indisponible pour "{location}"</Text>;
}

export default function DayDetailScreen({ route, navigation }) {
  const { tripId, dayId } = route.params;
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [locationModalOpen, setLocationModalOpen] = useState(false);

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
          <Text style={styles.tripNameSubtitle}>{trip.name}</Text>
          <Text style={styles.headerTitle}>{day.title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {date && <Text style={styles.headerDate}>{formatDateLabel(date)}</Text>}
            {date && <WeatherBadge day={day} dateISO={date} fallbackLocation={trip.defaultLocation} />}
            <TouchableOpacity onPress={() => setLocationModalOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="location-outline" size={13} color={THEME.inkFaint} />
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate("ActivityEditor", { tripId, dayId, activity: null })}
        >
          <Ionicons name="add" size={22} color={THEME.gold} />
        </TouchableOpacity>
      </View>

      <LocationModal
        visible={locationModalOpen}
        initial={day.location || ""}
        onClose={() => setLocationModalOpen(false)}
        onSave={async (loc) => {
          await setDayLocation(tripId, dayId, loc);
          setLocationModalOpen(false);
          refresh();
        }}
      />

      {day.activities.length > 0 && (
        <Text style={styles.progressText}>
          {doneCount}/{day.activities.length} étape{day.activities.length !== 1 ? "s" : ""} faite{doneCount !== 1 ? "s" : ""}
        </Text>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {sorted.length === 0 && (
          <View style={styles.emptyBox}>
            <Ionicons name="calendar-outline" size={30} color={THEME.inkFaint} />
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
        <TouchableOpacity
          style={styles.bigAddButton}
          onPress={() => navigation.navigate("ActivityEditor", { tripId, dayId, activity: null })}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color={THEME.gold} />
          <Text style={styles.bigAddButtonText}>Ajouter une étape</Text>
        </TouchableOpacity>
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
      <TouchableOpacity style={[styles.rowCard, { opacity: done ? 0.6 : 1 }]} onPress={onPress} activeOpacity={0.85}>
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
        {activity.address ? (
          <View style={styles.rowMetaLine}>
            <Ionicons name="location-outline" size={12} color={THEME.inkFaint} />
            <Text style={styles.rowMetaText}>{activity.address}</Text>
          </View>
        ) : null}
        {activity.confirmationCode ? (
          <View style={styles.rowMetaLine}>
            <Ionicons name="key-outline" size={12} color={THEME.inkFaint} />
            <Text style={styles.rowMetaText}>{activity.confirmationCode}</Text>
          </View>
        ) : null}
        {activity.price != null && <Text style={styles.rowPrice}>{formatMoney(activity.price, trip.currency)}</Text>}
      </TouchableOpacity>
    </View>
  );
}

function LocationModal({ visible, initial, onClose, onSave }) {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    if (visible) setValue(initial);
  }, [visible, initial]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Lieu de ce jour</Text>
          <Text style={styles.modalHelp}>Utilisé pour trouver la météo — ex : "Kyoto", "Rome", "Paris".</Text>
          <TextInput
            style={styles.modalInput}
            value={value}
            onChangeText={setValue}
            placeholder="Nom de la ville"
            placeholderTextColor={THEME.inkFaint}
          />
          <View style={styles.modalButtonRow}>
            <TouchableOpacity style={styles.modalButton} onPress={onClose}>
              <Text style={styles.modalButtonText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalButton} onPress={() => onSave(value)}>
              <Text style={styles.modalButtonText}>Enregistrer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 },
  emptyBox: { alignItems: "center", justifyContent: "center", paddingVertical: 50, gap: 10 },
  emptyText: { color: THEME.inkFaint, fontSize: 13.5, fontFamily: FONTS.body },
  tripNameSubtitle: { fontSize: 11, color: THEME.inkFaint, letterSpacing: 0.4, fontFamily: FONTS.bodyMedium },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingTop: 6 },
  backButton: { padding: 8 },
  addButton: { padding: 8 },
  headerTitle: { fontSize: 20, color: THEME.ink, fontFamily: FONTS.headingBold },
  headerDate: { fontSize: 12.5, color: THEME.inkMuted, textTransform: "capitalize", marginTop: 2, fontFamily: FONTS.body },
  weatherBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  weatherEmoji: { fontSize: 13 },
  weatherTemps: { fontSize: 11.5, color: THEME.inkMuted, fontFamily: FONTS.mono },
  weatherUnavailable: { fontSize: 10.5, color: THEME.inkFaint, fontFamily: FONTS.body },
  progressText: { fontSize: 11.5, color: THEME.teal, marginLeft: 44, marginTop: 2, fontFamily: FONTS.bodyMedium },
  scrollContent: { padding: 20, paddingTop: 16 },
  rowWrap: { flexDirection: "row" },
  timeline: { alignItems: "center", width: 20 },
  dotTouch: { marginTop: 4, alignItems: "center", justifyContent: "center" },
  dot: {},
  line: { flex: 1, width: 2, marginTop: 4 },
  rowContent: { flex: 1, paddingLeft: 12, paddingBottom: 22 },
  rowCard: {
    flex: 1,
    marginLeft: 12,
    marginBottom: 14,
    backgroundColor: THEME.bgCard,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 14,
    padding: 13,
    ...CARD_SHADOW,
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBadge: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowInfo: { flex: 1 },
  rowTitle: { fontSize: 15, color: THEME.ink, fontFamily: FONTS.headingSemiBold },
  rowTitleDone: { textDecorationLine: "line-through" },
  rowTime: { fontSize: 11, color: THEME.inkFaint, marginTop: 2, fontFamily: FONTS.mono },
  rowNote: { fontSize: 12, color: THEME.inkMuted, marginTop: 6, marginLeft: 44, fontFamily: FONTS.body },
  rowMetaLine: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 5, marginLeft: 44 },
  rowMetaText: { fontSize: 11.5, color: THEME.inkFaint, fontFamily: FONTS.body },
  rowPrice: { fontSize: 13.5, color: THEME.gold, marginTop: 6, marginLeft: 44, fontFamily: FONTS.monoMedium },
  bigAddButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: THEME.gold,
    borderStyle: "dashed",
    borderRadius: 14,
    paddingVertical: 15,
    marginLeft: 32,
    marginTop: 4,
  },
  bigAddButtonText: { color: THEME.gold, fontSize: 14, fontFamily: FONTS.bodySemiBold },
  modalOverlay: { flex: 1, backgroundColor: "#00000099", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: THEME.bgCard, borderRadius: 18, padding: 20, width: "100%", borderWidth: 1, borderColor: THEME.border, ...CARD_SHADOW },
  modalTitle: { fontSize: 15.5, color: THEME.ink, fontFamily: FONTS.headingSemiBold },
  modalHelp: { fontSize: 12, color: THEME.inkFaint, marginTop: 6, marginBottom: 12, fontFamily: FONTS.body },
  modalInput: {
    backgroundColor: THEME.bgCardAlt,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: THEME.ink,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  modalButtonRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  modalButton: { flex: 1, borderWidth: 1, borderColor: THEME.teal, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  modalButtonText: { color: THEME.teal, fontSize: 13.5, fontFamily: FONTS.bodySemiBold },
});
