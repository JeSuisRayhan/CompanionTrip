import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { THEME, space, layout, radius, type } from "../lib/theme";
import { formatDayLabel } from "../lib/dates";
import { weatherInfo } from "../lib/weather";
import { getTrip } from "../lib/trips";
import { buildWeatherReorgProposal, applyWeatherSwap } from "../lib/weatherReorg";
import { Txt, Button, Group, Row, EmptyState, BackHeader, round } from "../components/ui";

// One day of a proposed swap: weather in the tile, day and date, temperatures on the right.
function DayLine({ title, date, weather }) {
  const info = weatherInfo(weather.code);
  return (
    <Row
      lead={
        <View style={[styles.weatherTile, round("sm")]}>
          <Text style={styles.weatherEmoji}>{info.emoji}</Text>
        </View>
      }
      title={title}
      subtitle={formatDayLabel(date)}
      right={
        <Text style={styles.temps}>
          {weather.tempMax}°/{weather.tempMin}°
        </Text>
      }
      accessibilityLabel={`${title}, ${formatDayLabel(date)}${info.label ? ", " + info.label : ""}, maximum ${weather.tempMax}°, minimum ${weather.tempMin}°`}
    />
  );
}

// A small round badge straddling the hairline between the two days.
function SwapBadge() {
  return (
    <View style={styles.swapAnchor} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.swapBadge}>
        <Ionicons name="swap-vertical" size={16} color={THEME.teal} />
      </View>
    </View>
  );
}

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
      <BackHeader title="Réorganiser" onBack={() => navigation.goBack()} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={THEME.teal} />
          <Txt variant="subhead" style={styles.centerText}>
            Vérification de la météo de chaque jour…
          </Txt>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {proposals.length === 0 ? (
            <EmptyState
              icon="checkmark-circle-outline"
              tone="teal"
              title="Rien à réorganiser"
              text="Vos étapes en extérieur tombent déjà sur de bons jours, ou aucune prévision n'est disponible pour ce voyage."
              action={{ label: "Retour aux jours", onPress: () => navigation.goBack() }}
            />
          ) : (
            <>
              <Txt variant="subhead" style={styles.help}>
                Selon la météo, {proposals.length} permutation{proposals.length !== 1 ? "s" : ""} proposée{proposals.length !== 1 ? "s" : ""} — rien
                n'est appliqué sans votre accord.
              </Txt>
              {proposals.map((p) => {
                const isDone = done.includes(p.dayAId);
                const isApplying = applying === p.dayAId;
                return (
                  <View key={p.dayAId} style={styles.proposal}>
                    <Group>
                      <DayLine title={p.dayATitle} date={p.dayADate} weather={p.dayAWeather} />
                      <SwapBadge />
                      <DayLine title={p.dayBTitle} date={p.dayBDate} weather={p.dayBWeather} />
                    </Group>
                    {isDone ? (
                      <View style={[styles.doneNote, round("md")]} accessibilityRole="text">
                        <Ionicons name="checkmark-circle" size={20} color={THEME.teal} />
                        <Text style={styles.doneText}>Appliqué</Text>
                      </View>
                    ) : (
                      <Button title="Permuter ces deux jours" icon="swap-vertical" full loading={isApplying} disabled={isApplying} onPress={() => accept(p)} />
                    )}
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xxl, gap: space.md },
  centerText: { textAlign: "center" },
  scrollContent: { padding: layout.gutter, paddingBottom: space.xxxl },
  help: { marginBottom: space.lg },
  proposal: { gap: space.md, marginBottom: space.xl },

  weatherTile: { width: 40, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: THEME.bgCardAlt },
  weatherEmoji: { ...type.heading },
  temps: { ...type.numeral, color: THEME.inkMuted },

  // Zero-height slot between the two rows: the badge is centred on the separators around it.
  swapAnchor: { height: 0, alignItems: "center", zIndex: 1 },
  swapBadge: {
    position: "absolute",
    top: -14,
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: THEME.tealDim,
  },

  doneNote: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, minHeight: 48, backgroundColor: THEME.tealDim },
  doneText: { ...type.label, color: THEME.teal },
});
