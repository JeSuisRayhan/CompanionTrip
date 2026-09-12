import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { THEME, CARD_SHADOW } from "../lib/theme";
import { FONTS } from "../lib/fonts";
import { formatDateLabel } from "../lib/dates";
import { weatherInfo } from "../lib/weather";
import { getTrip } from "../lib/trips";
import { buildWeatherReorgProposal, applyWeatherSwap } from "../lib/weatherReorg";

export default function WeatherReorgScreen({ route, navigation }) {
  const { tripId } = route.params;
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState([]);
  const [applying, setApplying] = useState(null);
  const [done, setDone] = useState([]);

  useEffect(() => {
    (async () => {
      const trip = await getTrip(tripId);
      const result = await buildWeatherReorgProposal(trip);
      setProposals(result);
      setLoading(false);
    })();
  }, [tripId]);

  async function accept(proposal) {
    setApplying(proposal.dayAId);
    await applyWeatherSwap(tripId, proposal.dayAId, proposal.dayBId);
    setDone((d) => [...d, proposal.dayAId]);
    setApplying(null);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={22} color={THEME.ink} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Réorganiser selon la météo</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={THEME.teal} />
          <Text style={styles.loadingText}>Vérification de la météo de chaque jour…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {proposals.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="checkmark-circle-outline" size={30} color={THEME.teal} />
              <Text style={styles.emptyText}>
                Rien à réorganiser — vos étapes en extérieur tombent déjà sur de bons jours, ou aucune prévision
                n'est disponible pour ce voyage.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.helpText}>
                {proposals.length} permutation{proposals.length !== 1 ? "s" : ""} proposée{proposals.length !== 1 ? "s" : ""} — rien n'est
                appliqué sans votre accord.
              </Text>
              {proposals.map((p) => {
                const infoA = weatherInfo(p.dayAWeather.code);
                const infoB = weatherInfo(p.dayBWeather.code);
                const isDone = done.includes(p.dayAId);
                return (
                  <View key={p.dayAId} style={styles.card}>
                    <View style={styles.dayLine}>
                      <Text style={styles.dayLineTitle}>{p.dayATitle}</Text>
                      <Text style={styles.dayLineDate}>{formatDateLabel(p.dayADate)}</Text>
                      <Text style={styles.weatherText}>
                        {infoA.emoji} {p.dayAWeather.tempMax}°/{p.dayAWeather.tempMin}°
                      </Text>
                    </View>
                    <View style={styles.swapIconRow}>
                      <Ionicons name="swap-vertical" size={16} color={THEME.teal} />
                    </View>
                    <View style={styles.dayLine}>
                      <Text style={styles.dayLineTitle}>{p.dayBTitle}</Text>
                      <Text style={styles.dayLineDate}>{formatDateLabel(p.dayBDate)}</Text>
                      <Text style={styles.weatherText}>
                        {infoB.emoji} {p.dayBWeather.tempMax}°/{p.dayBWeather.tempMin}°
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.acceptButton, isDone && styles.acceptButtonDone]}
                      onPress={() => accept(p)}
                      disabled={isDone || applying === p.dayAId}
                    >
                      {applying === p.dayAId ? (
                        <ActivityIndicator color={THEME.bg} size="small" />
                      ) : (
                        <Text style={styles.acceptButtonText}>{isDone ? "Appliqué ✓" : "Permuter ces deux jours"}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: THEME.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  headerTitle: { color: THEME.ink, fontSize: 15.5, fontFamily: FONTS.headingSemiBold },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 14 },
  loadingText: { color: THEME.inkMuted, fontSize: 13, fontFamily: FONTS.body, textAlign: "center" },
  emptyText: { color: THEME.inkMuted, fontSize: 13.5, fontFamily: FONTS.body, textAlign: "center", lineHeight: 19 },
  scrollContent: { padding: 20 },
  helpText: { color: THEME.inkFaint, fontSize: 12.5, fontFamily: FONTS.body, marginBottom: 16, lineHeight: 17 },
  card: {
    backgroundColor: THEME.bgCard,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    ...CARD_SHADOW,
  },
  dayLine: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  dayLineTitle: { color: THEME.ink, fontSize: 14, fontFamily: FONTS.headingSemiBold, flexShrink: 1 },
  dayLineDate: { color: THEME.inkMuted, fontSize: 11.5, fontFamily: FONTS.body, textTransform: "capitalize" },
  weatherText: { color: THEME.inkMuted, fontSize: 12, fontFamily: FONTS.mono, marginLeft: "auto" },
  swapIconRow: { alignItems: "center", paddingVertical: 6 },
  acceptButton: { backgroundColor: THEME.teal, borderRadius: 10, paddingVertical: 11, alignItems: "center", marginTop: 12 },
  acceptButtonDone: { backgroundColor: THEME.bgCardAlt },
  acceptButtonText: { color: THEME.bg, fontSize: 13.5, fontFamily: FONTS.bodySemiBold },
});
