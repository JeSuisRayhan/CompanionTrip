import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, ImageBackground } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";

import { THEME } from "../lib/theme";
import { FONTS } from "../lib/fonts";
import { TRIP_TYPES } from "../lib/constants";
import { loadTrips } from "../lib/storage";
import { tripRange, tripStatus, formatDateLabel, daysUntilLabel, isoDate } from "../lib/dates";
import { tripActivityTotal, formatMoney } from "../lib/budget";

function todayISO() {
  return isoDate(new Date());
}

function tripTypeMeta(trip) {
  return TRIP_TYPES.find((t) => t.key === (trip.tripType || "long")) || TRIP_TYPES[0];
}

export default function HomeScreen({ navigation }) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    const t = await loadTrips();
    setTrips(t);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  const today = todayISO();
  const current = trips.filter((t) => tripStatus(t, today) === "current");
  const upcoming = trips
    .filter((t) => ["upcoming", "undated"].includes(tripStatus(t, today)))
    .sort((a, b) => {
      const ra = tripRange(a).start;
      const rb = tripRange(b).start;
      if (!ra) return 1;
      if (!rb) return -1;
      return ra.localeCompare(rb);
    });
  const past = trips
    .filter((t) => tripStatus(t, today) === "past")
    .sort((a, b) => (tripRange(b).start || "").localeCompare(tripRange(a).start || ""));

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingBox}>
          <ActivityIndicator color={THEME.teal} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={THEME.teal} />}
      >
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="briefcase" size={20} color={THEME.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerEyebrow}>COMPAGNON DE VOYAGE</Text>
            <Text style={styles.headerTitle}>Vos voyages</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate("Settings")} style={styles.settingsButton}>
            <Ionicons name="settings-outline" size={20} color={THEME.inkMuted} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.newTripButton} onPress={() => navigation.navigate("Onboarding")} activeOpacity={0.85}>
          <LinearGradient colors={[THEME.gold, "#FF9D4D"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.newTripGradient}>
            <Ionicons name="add" size={18} color={THEME.bg} />
            <Text style={styles.newTripButtonText}>Nouveau voyage</Text>
          </LinearGradient>
        </TouchableOpacity>

        {trips.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="airplane-outline" size={32} color={THEME.inkFaint} />
            <Text style={styles.emptyStateText}>Prêt pour la prochaine aventure ?</Text>
          </View>
        )}

        {current.map((trip) => (
          <CurrentTripCard key={trip.id} trip={trip} today={today} onPress={() => navigation.navigate("Trip", { tripId: trip.id })} />
        ))}

        {current.length === 0 && upcoming.length > 0 && (
          <CountdownCard trip={upcoming[0]} today={today} onPress={() => navigation.navigate("Trip", { tripId: upcoming[0].id })} />
        )}

        {upcoming.length > (current.length === 0 ? 1 : 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{current.length === 0 ? "Aussi à venir" : "À venir"}</Text>
            {(current.length === 0 ? upcoming.slice(1) : upcoming).map((trip) => (
              <UpcomingRow key={trip.id} trip={trip} today={today} onPress={() => navigation.navigate("Trip", { tripId: trip.id })} />
            ))}
          </View>
        )}

        {past.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Voyages passés</Text>
            {past.map((trip) => (
              <PastRow key={trip.id} trip={trip} onPress={() => navigation.navigate("Trip", { tripId: trip.id })} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function CurrentTripCard({ trip, today, onPress }) {
  const { start, end } = tripRange(trip);
  const total = tripActivityTotal(trip);
  const cover = trip.coverImage;

  const content = (
    <>
      <LinearGradient colors={["transparent", "rgba(23,15,31,0.55)", THEME.bg]} style={styles.heroGradient} />
      <View style={styles.heroBadge}>
        <Text style={styles.heroBadgeText}>EN COURS</Text>
      </View>
      <Text style={styles.heroTitle}>{trip.name}</Text>
      {start && (
        <Text style={styles.heroDates}>
          {formatDateLabel(start)}
          {end && end !== start ? ` → ${formatDateLabel(end)}` : ""}
        </Text>
      )}
      {total > 0 && <Text style={styles.heroBudget}>Budget estimé : {formatMoney(total, trip.currency)}</Text>}
      {cover?.photographerName && (
        <Text style={styles.creditText}>Photo : {cover.photographerName} / Unsplash</Text>
      )}
    </>
  );

  if (cover?.url) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.9} style={styles.heroCardWrap}>
        <ImageBackground source={{ uri: cover.url }} style={styles.heroCardImage} imageStyle={styles.heroCardImageInner}>
          {content}
        </ImageBackground>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={[styles.heroCardWrap, styles.heroCardPlain]} onPress={onPress} activeOpacity={0.9}>
      {content}
    </TouchableOpacity>
  );
}

function CountdownCard({ trip, today, onPress }) {
  const { start, end } = tripRange(trip);
  const diff = start ? Math.round((new Date(start + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000) : null;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
      <LinearGradient colors={[THEME.tealDim, THEME.bgCard]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.countdownCard}>
        <View style={styles.countdownBadge}>
          {diff != null && diff <= 1 ? (
            <Text style={styles.countdownBadgeSmallText}>{diff === 0 ? "Aujourd'hui" : "Demain"}</Text>
          ) : diff != null ? (
            <>
              <Text style={styles.countdownNumber}>{diff}</Text>
              <Text style={styles.countdownUnit}>JOUR{diff !== 1 ? "S" : ""}</Text>
            </>
          ) : (
            <Ionicons name="briefcase-outline" size={22} color={THEME.teal} />
          )}
        </View>
        <View style={styles.countdownInfo}>
          <Text style={styles.countdownEyebrow}>PROCHAIN DÉPART</Text>
          <Text style={styles.countdownTitle}>{trip.name}</Text>
          {start && (
            <Text style={styles.countdownDates}>
              {formatDateLabel(start)}
              {end && end !== start ? ` → ${formatDateLabel(end)}` : ""}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={18} color={THEME.inkFaint} />
      </LinearGradient>
    </TouchableOpacity>
  );
}

function UpcomingRow({ trip, today, onPress }) {
  const { start, end } = tripRange(trip);
  const label = start ? daysUntilLabel(start, today) : null;
  const t = tripTypeMeta(trip);
  const accent = trip.tripType === "park" ? THEME.pink : trip.tripType === "short" ? THEME.teal : THEME.gold;
  const accentDim = trip.tripType === "park" ? THEME.pinkDim : trip.tripType === "short" ? THEME.tealDim : THEME.goldDim;
  const cover = trip.coverImage;

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.85}>
      {cover?.url ? (
        <ImageBackground source={{ uri: cover.url }} style={styles.rowIcon} imageStyle={styles.rowIconImage} />
      ) : (
        <View style={[styles.rowIcon, { backgroundColor: accentDim }]}>
          <Ionicons name={t.icon} size={17} color={accent} />
        </View>
      )}
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle}>{trip.name}</Text>
        <Text style={styles.rowDates}>{start ? formatDateLabel(start) : "Pas encore daté"}</Text>
      </View>
      {label && (
        <View style={[styles.rowBadge, { backgroundColor: accentDim }]}>
          <Text style={[styles.rowBadgeText, { color: accent }]}>{label}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={THEME.inkFaint} />
    </TouchableOpacity>
  );
}

function PastRow({ trip, onPress }) {
  const { start } = tripRange(trip);
  return (
    <TouchableOpacity style={styles.pastRow} onPress={onPress} activeOpacity={0.85}>
      <Text style={styles.pastTitle}>{trip.name}</Text>
      <Text style={styles.pastDates}>{start ? formatDateLabel(start) : ""}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: THEME.bg },
  loadingBox: { flex: 1, alignItems: "center", justifyContent: "center" },
  scrollContent: { padding: 20, paddingBottom: 60 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 22 },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: THEME.goldDim,
    alignItems: "center",
    justifyContent: "center",
  },
  headerEyebrow: { fontSize: 11, color: THEME.inkFaint, letterSpacing: 1.2, fontFamily: FONTS.bodyMedium },
  headerTitle: { fontSize: 24, color: THEME.ink, marginTop: 3, fontFamily: FONTS.headingBold },
  settingsButton: { padding: 6 },
  newTripButton: { borderRadius: 14, marginBottom: 20, overflow: "hidden" },
  newTripGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15 },
  newTripButtonText: { color: THEME.bg, fontSize: 15.5, fontFamily: FONTS.bodySemiBold },
  emptyState: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyStateText: { color: THEME.inkMuted, fontSize: 14.5, fontFamily: FONTS.body },
  heroCardWrap: { borderRadius: 20, marginBottom: 20, overflow: "hidden", minHeight: 168 },
  heroCardPlain: { backgroundColor: THEME.bgCard, borderWidth: 1.5, borderColor: THEME.gold, padding: 20, justifyContent: "flex-end" },
  heroCardImage: { minHeight: 168, justifyContent: "flex-end" },
  heroCardImageInner: { resizeMode: "cover" },
  heroGradient: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  heroBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(244,183,64,0.22)",
    borderWidth: 1,
    borderColor: THEME.gold,
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginHorizontal: 20,
    marginTop: 20,
  },
  heroBadgeText: { color: THEME.gold, fontSize: 10.5, letterSpacing: 0.6, fontFamily: FONTS.bodySemiBold },
  heroTitle: { fontSize: 23, color: "#FFFFFF", marginHorizontal: 20, marginTop: 10, fontFamily: FONTS.headingBold },
  heroDates: { fontSize: 13.5, color: "#E9DEF0", marginHorizontal: 20, marginTop: 5, textTransform: "capitalize", fontFamily: FONTS.body },
  heroBudget: { fontSize: 13.5, color: THEME.gold, marginHorizontal: 20, marginTop: 8, marginBottom: 16, fontFamily: FONTS.monoMedium },
  creditText: { fontSize: 9.5, color: "rgba(255,255,255,0.55)", marginHorizontal: 20, marginBottom: 10, fontFamily: FONTS.body },
  section: { marginTop: 4, marginBottom: 22 },
  sectionLabel: { fontSize: 13, color: THEME.inkMuted, marginBottom: 12, fontFamily: FONTS.bodyMedium },
  countdownCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1.5,
    borderColor: THEME.teal,
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
  },
  countdownBadge: {
    width: 62,
    height: 62,
    borderRadius: 15,
    backgroundColor: "rgba(63,214,192,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  countdownBadgeSmallText: { color: THEME.teal, fontSize: 11, textAlign: "center", fontFamily: FONTS.bodySemiBold },
  countdownNumber: { color: THEME.teal, fontSize: 24, lineHeight: 26, fontFamily: FONTS.headingBold },
  countdownUnit: { color: THEME.teal, fontSize: 9, letterSpacing: 0.6, fontFamily: FONTS.bodyMedium },
  countdownInfo: { flex: 1 },
  countdownEyebrow: { fontSize: 10, color: THEME.inkFaint, letterSpacing: 0.6, fontFamily: FONTS.bodyMedium },
  countdownTitle: { fontSize: 17, color: THEME.ink, marginTop: 3, fontFamily: FONTS.headingSemiBold },
  countdownDates: { fontSize: 12.5, color: THEME.inkMuted, marginTop: 3, textTransform: "capitalize", fontFamily: FONTS.body },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    backgroundColor: THEME.bgCard,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 14,
    padding: 13,
    marginBottom: 11,
  },
  rowIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  rowIconImage: { resizeMode: "cover" },
  rowInfo: { flex: 1 },
  rowTitle: { fontSize: 15, color: THEME.ink, fontFamily: FONTS.headingRegular },
  rowDates: { fontSize: 12, color: THEME.inkMuted, marginTop: 3, textTransform: "capitalize", fontFamily: FONTS.body },
  rowBadge: { borderRadius: 7, paddingHorizontal: 9, paddingVertical: 4 },
  rowBadgeText: { fontSize: 11, fontFamily: FONTS.bodyMedium },
  pastRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  pastTitle: { fontSize: 13.5, color: THEME.inkMuted, fontFamily: FONTS.body },
  pastDates: { fontSize: 12, color: THEME.inkFaint, fontFamily: FONTS.body },
});
