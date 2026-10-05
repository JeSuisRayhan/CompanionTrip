import React, { useState, useCallback, useEffect } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Linking, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import { THEME, space, layout, type, themedStyles } from "../lib/theme";
import { TYPES } from "../lib/constants";
import { splitTitlePlace } from "../lib/script";
import { directionsUrl } from "../lib/map";
import { isPdfDoc, openDocumentFile } from "../lib/documents";
import { getTrip, toggleActivityDone } from "../lib/trips";
import { tripStatus, tripRange, formatFullDate, formatShortDate, daysUntilLabel, isoDate } from "../lib/dates";
import { todayPlan, minutesUntil, countdownInfo } from "../lib/today";
import { formatMoney } from "../lib/budget";
import { WeatherBadge } from "./DayDetailScreen";
import { Txt, Button, Badge, Group, Row, Thumb, SectionTitle, ProgressBar, EmptyState, BackHeader, round } from "../components/ui";

const REFRESH_MS = 30000; // the countdown moves with the clock

// What the next step says about itself: its name, and where it is.
function stepText(step) {
  if (step.address) return { name: step.title, place: step.address };
  const split = splitTitlePlace(step.title);
  return { name: split.title, place: split.place };
}

export default function TodayScreen({ route, navigation }) {
  const { tripId } = route.params;
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const t = await getTrip(tripId);
    setTrip(t);
    setNow(new Date());
    setLoading(false);
  }, [tripId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  if (loading || !trip) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={THEME.teal} />
        </View>
      </SafeAreaView>
    );
  }

  const today = isoDate(now);
  const plan = todayPlan(trip, today, now);
  const goBack = () => navigation.goBack();
  const openTripTab = (initialTab) => navigation.navigate("Trip", { tripId, initialTab });

  // No day of the trip falls on today: say where the trip stands rather than show an empty page.
  if (!plan) {
    const status = tripStatus(trip, today);
    let title = "Rien de prévu aujourd'hui";
    let text = "Aucun jour du programme ne tombe sur aujourd'hui.";
    if (status === "upcoming") {
      const first = tripRange(trip).start;
      title = "Le voyage n'a pas commencé";
      text = first ? `Départ ${daysUntilLabel(first, today) || formatShortDate(first)}.` : "Il commence bientôt.";
    } else if (status === "past") {
      title = "Ce voyage est terminé";
      text = "Retrouvez le programme et les souvenirs dans le voyage.";
    } else if (status === "undated") {
      title = "Ce voyage n'a pas de dates";
      text = "Ajoutez des dates pour voir ce qui vous attend chaque jour.";
    }
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <BackHeader title="Aujourd'hui" subtitle={trip.name} onBack={goBack} />
        </View>
        <View style={styles.center}>
          <EmptyState icon="calendar-outline" tone="gold" title={title} text={text} action={{ label: "Voir le programme", onPress: () => openTripTab("days") }} />
        </View>
      </SafeAreaView>
    );
  }

  const { day, next, later, done, total, allDone, countdown, docs, tomorrow } = plan;
  const dayId = day.id;
  const doneCount = done.length;

  async function markDone(step) {
    if (busy) return;
    setBusy(true);
    try {
      await toggleActivityDone(tripId, dayId, step.id);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  function goThere(step) {
    const url = directionsUrl(step, Platform.OS);
    if (!url) return;
    Linking.openURL(url).catch(() => Alert.alert("Impossible d'ouvrir l'application de cartes"));
  }

  function openDoc(doc) {
    if (isPdfDoc(doc)) {
      openDocumentFile(doc).catch(() => Alert.alert("Impossible d'ouvrir ce PDF depuis l'application"));
    } else {
      navigation.navigate("Trip", { tripId, viewDocId: doc.id });
    }
  }

  const editStep = (step) => navigation.navigate("ActivityEditor", { tripId, dayId, activity: step });
  const openDay = () => navigation.navigate("DayDetail", { tripId, dayId });

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <BackHeader title="Aujourd'hui" subtitle={trip.name} onBack={goBack} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.dayBlock}>
          <Txt variant="subhead">{`Jour ${plan.dayNumber} sur ${plan.dayCount} · ${formatFullDate(today)}`}</Txt>
          <Txt variant="heading" numberOfLines={2}>{day.title}</Txt>
          <View style={styles.metaRow}>
            <WeatherBadge day={day} dateISO={today} fallbackLocation={trip.defaultLocation} />
            {total > 0 ? (
              <View style={styles.progress}>
                <ProgressBar value={doneCount / total} height={6} style={{ flex: 1 }} />
                <Text style={type.caption}>
                  <Text style={styles.progressNumber}>{doneCount}/{total}</Text>
                  {` étape${total !== 1 ? "s" : ""} faite${total !== 1 ? "s" : ""}`}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {total === 0 ? (
          <EmptyState
            icon="sunny-outline"
            tone="gold"
            title="Journée libre"
            text="Rien n'est prévu aujourd'hui. Ajoutez une étape si vous avez une idée."
            action={{ label: "Ajouter une étape", icon: "add", onPress: () => navigation.navigate("ActivityEditor", { tripId, dayId, activity: null }) }}
          />
        ) : null}

        {next ? <NextCard step={next} trip={trip} countdown={countdown} busy={busy} onGo={() => goThere(next)} onDone={() => markDone(next)} onEdit={() => editStep(next)} /> : null}

        {allDone ? (
          <View style={styles.finished} accessible accessibilityLabel="Journée terminée, tout est fait">
            <Thumb icon="checkmark-done" tone="teal" size={56} />
            <Txt variant="heading">Journée terminée</Txt>
            <Txt variant="subhead" style={{ textAlign: "center" }}>
              {`${total} étape${total !== 1 ? "s" : ""} faite${total !== 1 ? "s" : ""}. Bonne soirée !`}
            </Txt>
          </View>
        ) : null}

        {later.length > 0 ? (
          <View style={styles.section}>
            <SectionTitle title="Ensuite" count={later.length} />
            <Group>
              {later.map((step) => (
                <LaterRow key={step.id} step={step} now={now} onPress={() => editStep(step)} />
              ))}
            </Group>
          </View>
        ) : null}

        {docs.length > 0 || (trip.documents || []).length > 0 ? (
          <View style={styles.section}>
            <SectionTitle title="Documents du jour" count={docs.length || undefined} />
            <Group>
              {docs.map((doc) => (
                <Row
                  key={doc.id}
                  lead={isPdfDoc(doc) ? <Thumb icon="document-text" tone="stamp" size={44} /> : <Thumb uri={doc.uri} icon="image" tone="blue" size={44} />}
                  title={doc.title}
                  subtitle={isPdfDoc(doc) ? "PDF · s'ouvre avec une autre application" : "Photo"}
                  chevron
                  onPress={() => openDoc(doc)}
                  accessibilityLabel={`Ouvrir ${doc.title}`}
                />
              ))}
              {docs.length === 0 ? (
                <Row
                  icon="folder-open-outline"
                  tone="neutral"
                  title="Aucun document lié à ce jour"
                  subtitle={`Tous les documents du voyage (${(trip.documents || []).length})`}
                  chevron
                  onPress={() => openTripTab("documents")}
                  accessibilityLabel="Ouvrir les documents du voyage"
                />
              ) : null}
            </Group>
          </View>
        ) : null}

        {done.length > 0 ? (
          <View style={styles.section}>
            <SectionTitle title="Déjà fait" count={done.length} />
            <Group>
              {done.map((step) => (
                <Row
                  key={step.id}
                  icon="checkmark-circle"
                  tone="teal"
                  title={step.title}
                  subtitle={step.time ? `${step.time} · toucher pour annuler` : "Toucher pour annuler"}
                  onPress={() => markDone(step)}
                  accessibilityLabel={`${step.title}, fait. Annuler`}
                />
              ))}
            </Group>
          </View>
        ) : null}

        {tomorrow && allDone ? (
          <View style={styles.section}>
            <SectionTitle title="Demain" />
            <Group>
              <Row
                icon="sunny-outline"
                tone="gold"
                title={tomorrow.day.title}
                subtitle={tomorrow.firstStep ? `${tomorrow.firstStep.time ? tomorrow.firstStep.time + " · " : ""}${tomorrow.firstStep.title}` : "Rien de prévu pour l'instant"}
                chevron
                onPress={() => navigation.navigate("DayDetail", { tripId, dayId: tomorrow.day.id })}
                accessibilityLabel={`Demain : ${tomorrow.day.title}`}
              />
            </Group>
          </View>
        ) : null}

        <Button title="Programme complet du jour" icon="list-outline" variant="secondary" full onPress={openDay} style={styles.fullDay} />
      </ScrollView>
    </SafeAreaView>
  );
}

// The step to do now: the time it is due at, how far away that is, and the two things to do about it.
function NextCard({ step, trip, countdown, busy, onGo, onDone, onEdit }) {
  const t = TYPES[step.type] || TYPES.activite;
  const { name, place } = stepText(step);
  const canGo = !!directionsUrl(step, Platform.OS);
  const hasPrice = step.price != null;
  const label = `Prochaine étape : ${step.title}${step.time ? ", " + step.time : ""}${countdown ? ", " + countdown.label : ""}`;
  return (
    <View style={[styles.next, round("lg")]}>
      <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
        <View style={styles.stub}>
          <View style={styles.stubLeft}>
            <Text style={styles.stubCaption}>Prochaine étape</Text>
            {step.time ? (
              <Text style={styles.stubTime}>{step.time}</Text>
            ) : (
              <View style={styles.stubIcon}>
                <Ionicons name={t.icon} size={28} color={THEME.onGold} />
              </View>
            )}
          </View>
          {countdown ? (
            <View style={[styles.countdown, countdown.tone === "stamp" && { backgroundColor: THEME.stamp }]}>
              <Text style={[styles.countdownText, countdown.tone === "stamp" && { color: THEME.onGold }]}>{countdown.label}</Text>
            </View>
          ) : (
            <Text style={styles.stubCaption}>{step.time ? "" : "Sans horaire"}</Text>
          )}
        </View>
        <View style={styles.nextBody}>
          <Text style={type.title}>{name}</Text>
          {place ? (
            <View style={styles.placeLine}>
              <Ionicons name="location-outline" size={16} color={THEME.inkFaint} />
              <Text style={[type.subhead, { flex: 1 }]} numberOfLines={3}>{place}</Text>
            </View>
          ) : null}
          <View style={styles.badges}>
            <Badge label={t.label} icon={t.icon} tone={step.type === "repas" ? "gold" : step.type === "hotel" ? "stamp" : step.type === "transport" ? "blue" : "teal"} />
            {step.confirmationCode ? <Badge label={step.confirmationCode} icon="key-outline" tone="neutral" /> : null}
            {hasPrice ? <Badge label={formatMoney(step.price, trip.currency)} icon="pricetag-outline" tone="neutral" /> : null}
          </View>
          {step.note ? <Text style={type.subhead} numberOfLines={4}>{step.note}</Text> : null}
        </View>
      </Pressable>
      <View style={styles.actions}>
        {canGo ? <Button title="Y aller" icon="navigate" onPress={onGo} accessibilityLabel={`Y aller : ${step.title}`} style={styles.actionGo} /> : null}
        <Button
          title="Fait"
          icon="checkmark"
          variant={canGo ? "secondary" : "primary"}
          onPress={onDone}
          disabled={busy}
          accessibilityLabel={`Marquer comme fait : ${step.title}`}
          style={canGo ? styles.actionDone : styles.actionGo}
        />
      </View>
    </View>
  );
}

function LaterRow({ step, now, onPress }) {
  const t = TYPES[step.type] || TYPES.activite;
  const { name, place } = stepText(step);
  const info = countdownInfo(minutesUntil(step.time, now));
  return (
    <Row
      lead={
        <View style={[styles.laterStub, round("sm"), { backgroundColor: t.dim }]}>
          {step.time ? <Text style={[styles.laterTime, { color: t.color }]}>{step.time}</Text> : <Ionicons name={t.icon} size={18} color={t.color} />}
        </View>
      }
      title={name}
      subtitle={[place, info && info.tone !== "neutral" ? info.label : null].filter(Boolean).join(" · ") || undefined}
      chevron
      onPress={onPress}
      accessibilityLabel={`${step.title}${step.time ? ", " + step.time : ""}`}
    />
  );
}

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: layout.gutter },
  header: { paddingHorizontal: layout.gutter, paddingTop: space.xs },
  content: { paddingHorizontal: layout.gutter, paddingBottom: space.xxl },

  dayBlock: { gap: space.xs, paddingTop: space.sm, paddingBottom: space.lg },
  metaRow: { gap: space.md, marginTop: space.xs },
  progress: { flexDirection: "row", alignItems: "center", gap: space.md },
  progressNumber: { ...type.numeral, fontSize: 12 },

  next: { backgroundColor: THEME.bgCard, overflow: "hidden", marginBottom: space.xl },
  stub: { backgroundColor: THEME.gold, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  stubLeft: { gap: 2, flexShrink: 1 },
  stubCaption: { ...type.caption, color: THEME.onGold, opacity: 0.8 },
  stubTime: { ...type.numeralLarge, color: THEME.onGold },
  stubIcon: { height: 44, justifyContent: "center" },
  countdown: { backgroundColor: THEME.onGold, borderRadius: 999, paddingHorizontal: space.md, paddingVertical: space.xs + 2 },
  countdownText: { ...type.label, fontSize: 14, color: THEME.gold },
  nextBody: { gap: space.sm, padding: space.lg },
  placeLine: { flexDirection: "row", alignItems: "flex-start", gap: space.xs + 2 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  actions: { flexDirection: "row", gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.lg },
  actionGo: { flex: 1.4 },
  actionDone: { flex: 1 },

  finished: { alignItems: "center", gap: space.sm, paddingVertical: space.xl },

  section: { marginBottom: space.xl },
  laterStub: { width: 52, height: 40, alignItems: "center", justifyContent: "center" },
  laterTime: { ...type.numeralSmall, fontSize: 13 },
  fullDay: { marginTop: space.sm },
}));
