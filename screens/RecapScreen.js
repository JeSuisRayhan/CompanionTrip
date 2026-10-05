import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, Image, Modal, Share, Alert, ActivityIndicator, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import { THEME, space, layout, type, themedStyles } from "../lib/theme";
import { getTrip } from "../lib/trips";
import { tripStatus, formatDateRange, isoDate } from "../lib/dates";
import { tripRecap, moneyVerdict, recapText } from "../lib/recap";
import { EXPENSE_CATEGORIES, formatMoney } from "../lib/budget";
import { souvenirsOf, souvenirsLeft, pickSouvenirs, addSouvenirs, removeSouvenir, MAX_SOUVENIRS } from "../lib/souvenirs";
import { Txt, Button, IconButton, Badge, Surface, Group, Row, SectionTitle, ProgressBar, EmptyState, BackHeader, round } from "../components/ui";

const COLUMNS = 3;
const GAP = space.sm;

// The trip looked back on: what was done, how far, what it cost, and the photos kept of it.
export default function RecapScreen({ route, navigation }) {
  const { tripId } = route.params;
  const [trip, setTrip] = useState(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(null);

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

  const recap = tripRecap(trip);
  const photos = souvenirsOf(trip);
  const left = souvenirsLeft(trip);
  const past = tripStatus(trip, isoDate(new Date())) === "past";
  const verdict = moneyVerdict(recap.money);
  const tile = Math.floor((Dimensions.get("window").width - layout.gutter * 2 - GAP * (COLUMNS - 1)) / COLUMNS);

  async function add(source) {
    if (busy) return;
    setBusy(true);
    try {
      const uris = await pickSouvenirs(source, left);
      if (!uris.length) return;
      const { trip: updated, skipped } = await addSouvenirs(tripId, uris);
      if (updated) setTrip(updated);
      if (skipped > 0) Alert.alert(skipped === 1 ? "Une photo n'a pas pu être ajoutée" : `${skipped} photos n'ont pas pu être ajoutées`, "Elles étaient illisibles ou la limite de photos était atteinte.");
    } catch (e) {
      if (e && e.code === "PERMISSION_DENIED") {
        Alert.alert("Autorisation refusée", source === "camera" ? "Autorisez l'appareil photo dans les réglages du téléphone." : "Autorisez l'accès aux photos dans les réglages du téléphone.");
      } else {
        Alert.alert("Impossible d'ajouter les photos");
      }
    } finally {
      setBusy(false);
    }
  }

  function confirmRemove(photo) {
    Alert.alert("Supprimer cette photo ?", "Elle sera retirée des souvenirs de ce voyage.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          setViewing(null);
          const updated = await removeSouvenir(tripId, photo.id);
          if (updated) setTrip(updated);
        },
      },
    ]);
  }

  const share = () => Share.share({ message: recapText(recap), title: trip.name }).catch(() => {});

  const stepsLabel = recap.steps.done > 0 ? `sur ${recap.steps.total} faite${recap.steps.done > 1 ? "s" : ""}` : "au programme";
  const stepsValue = recap.steps.done > 0 ? recap.steps.done : recap.steps.total;
  const stats = [
    { key: "days", value: recap.dayCount, label: recap.dayCount > 1 ? "jours" : "jour", icon: "calendar-outline" },
    { key: "steps", value: stepsValue, label: `étape${stepsValue > 1 ? "s" : ""} ${stepsLabel}`, icon: "checkmark-done-outline" },
    recap.legCount > 0 && recap.distanceKm > 0 ? { key: "km", value: `${recap.distanceKm} km`, label: "entre les étapes, à vol d'oiseau", icon: "navigate-outline" } : null,
    recap.photos > 0 ? { key: "photos", value: recap.photos, label: recap.photos > 1 ? "photos souvenirs" : "photo souvenir", icon: "images-outline" } : null,
  ].filter(Boolean);

  // "Jour 3 · Shibuya · 4 étapes faites": the day's own name only when it has one ("Jour 3" says nothing more)
  const busiestText = recap.busiest
    ? [`Jour ${recap.busiest.dayNumber}`, /^jour\s*\d+$/i.test(recap.busiest.title.trim()) ? null : recap.busiest.title, `${recap.busiest.count} étapes faites`].filter(Boolean).join(" · ")
    : "";
  const spentRows = recap.money ? EXPENSE_CATEGORIES.filter((c) => recap.money.byCategory[c.key] > 0) : [];

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <BackHeader title="Bilan" subtitle={trip.name} onBack={() => navigation.goBack()} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          {past ? <Badge label="Voyage terminé" tone="gold" icon="flag-outline" /> : null}
          <Txt variant="heading" numberOfLines={2}>{recap.name}</Txt>
          {recap.start ? <Txt variant="subhead">{formatDateRange(recap.start, recap.end)}</Txt> : null}
        </View>

        <View style={styles.stats}>
          {stats.map((s) => (
            <Surface key={s.key} style={[styles.stat, { width: (Dimensions.get("window").width - layout.gutter * 2 - GAP) / 2 }]} accessible accessibilityLabel={`${s.value} ${s.label}`}>
              <Ionicons name={s.icon} size={18} color={THEME.inkFaint} />
              <Text style={type.numeralLarge}>{s.value}</Text>
              <Txt variant="caption">{s.label}</Txt>
            </Surface>
          ))}
        </View>

        {recap.busiest ? (
          <Group style={styles.block}>
            <Row
              icon="trophy-outline"
              tone="gold"
              title="Journée la plus remplie"
              subtitle={busiestText}
              accessibilityLabel={`Journée la plus remplie : ${busiestText}`}
            />
          </Group>
        ) : null}

        {recap.money ? (
          <View style={styles.block}>
            <SectionTitle title="Budget" />
            <Surface style={styles.money}>
              <View style={styles.moneyRow}>
                <Txt variant="subhead">Prévu</Txt>
                <Text style={type.numeral}>{formatMoney(recap.money.planned, recap.money.currency)}</Text>
              </View>
              <View style={styles.moneyRow}>
                <Txt variant="subhead">Dépensé</Txt>
                <Text style={[type.numeral, recap.money.planned > 0 && recap.money.spent > recap.money.planned && { color: THEME.stamp }]}>
                  {recap.money.spent > 0 ? formatMoney(recap.money.spent, recap.money.currency) : "—"}
                </Text>
              </View>
              {recap.money.spent > 0 && recap.money.planned > 0 ? (
                <ProgressBar value={Math.min(recap.money.spent / recap.money.planned, 1)} tone={recap.money.spent > recap.money.planned ? "stamp" : "teal"} height={6} style={{ backgroundColor: THEME.surfaceSunk }} />
              ) : null}
              {verdict ? <Txt variant="caption" color={recap.money.spent > recap.money.planned ? "stamp" : "teal"}>{verdict}</Txt> : null}
              {recap.money.spent <= 0 ? <Txt variant="caption">Aucune dépense notée : ajoutez-les dans l'onglet Budget pour les comparer au prévu.</Txt> : null}
            </Surface>
            {spentRows.length > 0 ? (
              <Group style={styles.spentRows}>
                {spentRows.map((c) => (
                  <Row
                    key={c.key}
                    icon={c.icon}
                    tone={c.tone}
                    title={c.label}
                    right={<Text style={type.numeral}>{formatMoney(recap.money.byCategory[c.key], recap.money.currency)}</Text>}
                    accessibilityLabel={`${c.label}, dépensé ${formatMoney(recap.money.byCategory[c.key], recap.money.currency)}`}
                  />
                ))}
              </Group>
            ) : null}
          </View>
        ) : null}

        <View style={styles.block}>
          <SectionTitle title="Souvenirs" count={photos.length > 0 ? photos.length : undefined} />
          {photos.length === 0 ? (
            <EmptyState icon="images-outline" tone="gold" title="Pas encore de photo" text="Gardez ici les photos qui racontent le voyage. Elles sont incluses dans la sauvegarde." />
          ) : (
            <View style={styles.grid}>
              {photos.map((p, i) => (
                <Pressable
                  key={p.id}
                  onPress={() => setViewing(p)}
                  accessibilityRole="button"
                  accessibilityLabel={`Photo souvenir ${i + 1} sur ${photos.length}`}
                  style={({ pressed }) => [pressed && { opacity: 0.8 }]}
                >
                  <Image source={{ uri: p.uri }} style={[{ width: tile, height: tile }, round("md")]} />
                </Pressable>
              ))}
            </View>
          )}
          <View style={styles.photoActions}>
            <Button title="Ajouter des photos" icon="images-outline" variant="secondary" size="sm" disabled={busy || left === 0} loading={busy} onPress={() => add("library")} style={styles.photoButton} />
            <Button title="Prendre une photo" icon="camera-outline" variant="secondary" size="sm" disabled={busy || left === 0} onPress={() => add("camera")} style={styles.photoButton} />
          </View>
          {left === 0 ? <Txt variant="caption" color="inkMuted" style={styles.limit}>{`${MAX_SOUVENIRS} photos au maximum : supprimez-en une pour en ajouter.`}</Txt> : null}
        </View>

        <Button title="Partager le bilan" icon="share-outline" variant="secondary" full onPress={share} />
      </ScrollView>

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewing(null)} accessibilityLabel="Fermer la photo">
          {viewing ? <Image source={{ uri: viewing.uri }} style={styles.viewerImage} resizeMode="contain" /> : null}
          <View style={styles.viewerBar}>
            <Button title="Supprimer" icon="trash-outline" variant="danger" size="sm" onPress={() => viewing && confirmRemove(viewing)} accessibilityLabel="Supprimer cette photo" />
            <IconButton icon="close" label="Fermer" size={24} onPress={() => setViewing(null)} tone="neutral" />
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: layout.gutter },
  header: { paddingHorizontal: layout.gutter, paddingTop: space.xs },
  content: { paddingHorizontal: layout.gutter, paddingBottom: space.xxl },
  intro: { gap: space.xs, paddingTop: space.sm, paddingBottom: space.lg, alignItems: "flex-start" },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: GAP, marginBottom: space.xl },
  stat: { gap: space.xs, padding: space.lg },
  block: { marginBottom: space.xl },
  money: { gap: space.sm, padding: space.lg },
  moneyRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  spentRows: { marginTop: space.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  photoActions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  photoButton: { flexGrow: 1 },
  limit: { marginTop: space.sm },
  viewer: { flex: 1, backgroundColor: "#000000EE", alignItems: "center", justifyContent: "center" },
  viewerImage: { width: "100%", height: "80%" },
  viewerBar: { position: "absolute", left: space.lg, right: space.lg, bottom: space.xl, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
}));
