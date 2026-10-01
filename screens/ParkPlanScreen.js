import React, { useState, useMemo, useCallback, useEffect } from "react";
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";

import { THEME, space, layout, type, themedStyles } from "../lib/theme";
import { getTrip } from "../lib/trips";
import { resolveDayDate, formatDayLabel } from "../lib/dates";
import { hasPosition, formatIdeaDuration } from "../lib/ideas";
import { undoPlan } from "../lib/planner";
import { generateParkDay, applyParkDay, liveWaitMap, DAY_STARTS, DAY_ENDS, DEFAULT_START, DEFAULT_END } from "../lib/parkPlanner";
import { fetchQueueTimes } from "../lib/queueTimes";
import { Txt, Button, Chip, Badge, Group, Row, EmptyState, BackHeader } from "../components/ui";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;

// What each kind of step looks like in the list.
const KIND = {
  ride: null,
  show: { label: "Spectacle", icon: "musical-notes", tone: "violet" },
  lunch: { label: "Repas", icon: "restaurant", tone: "gold" },
  dinner: { label: "Repas", icon: "restaurant", tone: "gold" },
};

function stepTitle(it) {
  if (it.idea) return it.idea.name;
  return it.kind === "dinner" ? "Pause dîner" : "Pause déjeuner";
}

function stepLine(it) {
  if (it.kind === "ride") return `Attente ${it.wait} min${it.waitSource === "live" ? " (du moment)" : ""}${it.walk ? `, marche ${it.walk} min` : ""}`;
  if (it.kind === "show") return "Arrivez un quart d'heure avant";
  return it.idea ? "Restaurant de votre liste" : "À choisir sur place";
}

// Amusement-park mode: the proposed day. Choose when you arrive and leave,
// read the route (queues, walking, lunch, shows), then add it to the day.
export default function ParkPlanScreen({ route, navigation }) {
  const { tripId, dayId } = route.params;
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [start, setStart] = useState(DEFAULT_START);
  const [end, setEnd] = useState(DEFAULT_END);
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState(null); // { ids, count } once added

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const t = await getTrip(tripId);
        if (!cancelled) {
          setTrip(t);
          setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [tripId])
  );

  const day = trip ? trip.days.find((d) => d.id === dayId) : null;
  // The queues of the moment stand in for the attractions without a usual wait; the plan just waits for them if they are slow
  const [live, setLive] = useState(null);
  const qtId = trip && trip.park ? trip.park.qtId : null;
  useEffect(() => {
    if (qtId == null) return undefined;
    let cancelled = false;
    fetchQueueTimes(qtId)
      .then((data) => !cancelled && setLive(liveWaitMap(data)))
      .catch(() => {}); // no live data: the usual or default waits
    return () => {
      cancelled = true;
    };
  }, [qtId]);
  const plan = useMemo(() => (trip && day ? generateParkDay(trip, { start, end, live }) : null), [trip, day, start, end, live]);

  const back = () => navigation.goBack();
  const dayIndex = trip && day ? trip.days.indexOf(day) : -1;
  const date = day ? resolveDayDate(trip, day, dayIndex) : null;
  const header = <BackHeader title="Parcours du jour" subtitle={day ? `${day.title}${date ? `, ${formatDayLabel(date)}` : ""}` : trip ? trip.name : undefined} onBack={back} />;

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

  async function onApply() {
    setApplying(true);
    try {
      const ids = await applyParkDay(trip.id, day.id, plan.items);
      setTrip(await getTrip(trip.id));
      if (ids.length > 0) setDone({ ids, count: ids.length });
    } finally {
      setApplying(false);
    }
  }

  async function onUndo() {
    await undoPlan(trip.id, done.ids);
    setDone(null);
    setTrip(await getTrip(trip.id));
  }

  if (done) {
    return (
      <SafeAreaView style={styles.safe}>
        {header}
        <View style={styles.center}>
          <EmptyState
            icon="checkmark-circle-outline"
            tone="teal"
            title="Parcours ajouté"
            text={`${plural(done.count, "étape placée", "étapes placées")} sur ${day.title}. Le jour J, le suivi ajuste la suite avec les attentes en direct.`}
            action={{ label: "Ouvrir le jour J", icon: "play", onPress: () => navigation.replace("ParkLive", { tripId: trip.id, dayId: day.id }) }}
          />
          <Button title="Annuler l'ajout" icon="arrow-undo-outline" variant="secondary" onPress={onUndo} style={styles.undo} />
          <Button title="Retour au voyage" variant="ghost" onPress={back} style={styles.undo} />
        </View>
      </SafeAreaView>
    );
  }

  if (plan.items.length === 0 && plan.unplaced.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        {header}
        <View style={styles.center}>
          <EmptyState
            icon="rocket-outline"
            tone="pink"
            title="Rien à placer"
            text="Toutes vos attractions sont déjà sur un jour, ou la liste est vide. Choisissez-les dans l'onglet Attractions."
            action={{ label: "Retour", onPress: back }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const withPosition = plan.items.filter((it) => it.idea && hasPosition(it.idea)).length;
  const inList = plan.items.filter((it) => it.idea).length;

  function openMap() {
    navigation.navigate("TripMap", {
      tripId: trip.id,
      dayId: day.id,
      parkPlan: { dayId: day.id, steps: plan.items.filter((it) => it.idea).map((it) => ({ ideaId: it.idea.id, time: it.time })) },
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      {header}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Txt variant="caption" style={styles.label}>
          Arrivée
        </Txt>
        <View style={styles.chipRow}>
          {DAY_STARTS.map((h) => (
            <Chip key={h} label={h} selected={start === h} tone="gold" accessibilityLabel={`Arrivée à ${h}`} onPress={() => setStart(h)} />
          ))}
        </View>
        <Txt variant="caption" style={[styles.label, styles.labelGap]}>
          Départ
        </Txt>
        <View style={styles.chipRow}>
          {DAY_ENDS.map((h) => (
            <Chip key={h} label={h} selected={end === h} tone="gold" accessibilityLabel={`Départ à ${h}`} onPress={() => setEnd(h)} />
          ))}
        </View>
        <Txt variant="subhead" style={styles.hint}>
          {plan.liveCount > 0
            ? `Temps estimés d'après l'attente habituelle de chaque attraction. Pour ${plural(plan.liveCount, "attraction")} sans attente renseignée : celle du moment, qui varie d'un jour à l'autre.`
            : "Les temps sont estimés d'après l'attente habituelle de chaque attraction, 30 min quand elle n'est pas renseignée."}
        </Txt>

        <View style={styles.summary}>
          <View style={styles.summaryText}>
            <Txt variant="label">{`${plural(plan.rideCount, "attraction")}, ${plan.waitTotal ? formatIdeaDuration(plan.waitTotal) : "aucune attente"}${plan.waitTotal ? " d'attente" : ""}`}</Txt>
            {plan.endsAt ? <Txt variant="caption">{`Fin vers ${plan.endsAt}`}</Txt> : null}
            {plan.unplaced.length > 0 ? (
              <Txt variant="caption" color="stamp">
                {`${plan.unplaced.length} sans place`}
              </Txt>
            ) : null}
          </View>
          {withPosition > 0 ? <Button title="Carte" icon="map-outline" variant="secondary" size="sm" accessibilityLabel="Voir le parcours sur la carte" onPress={openMap} /> : null}
        </View>
        {inList > 0 && withPosition === 0 ? (
          <Txt variant="caption" color="inkFaint" style={styles.note}>
            Localisez les attractions depuis le plan du parc (onglet Attractions) pour voir le parcours sur la carte.
          </Txt>
        ) : null}
        {day.activities.length > 0 ? (
          <Txt variant="caption" color="inkFaint" style={styles.note}>
            {`${day.title} contient déjà ${plural(day.activities.length, "étape")} : le parcours s'ajoute à la suite, sans doublon.`}
          </Txt>
        ) : null}

        {plan.items.length > 0 ? (
          <Group style={styles.list}>
            {plan.items.map((it, index) => {
              const k = KIND[it.kind];
              return (
                <Row
                  key={`${it.kind}-${it.idea ? it.idea.id : index}`}
                  lead={<Text style={[type.numeral, styles.time]} numberOfLines={1}>{it.time}</Text>}
                  title={stepTitle(it)}
                  subtitle={stepLine(it)}
                  accessibilityLabel={`${it.time}, ${stepTitle(it)}, ${stepLine(it)}`}
                  right={k ? <Badge label={k.label} icon={k.icon} tone={k.tone} /> : null}
                />
              );
            })}
          </Group>
        ) : (
          <EmptyState icon="time-outline" tone="gold" title="Rien ne tient dans ces horaires" text="Choisissez une arrivée plus tôt ou un départ plus tard." />
        )}

        {plan.unplaced.length > 0 ? (
          <View style={styles.section}>
            <Text style={type.heading} accessibilityRole="header">
              Non placées
            </Text>
            <Txt variant="caption" color="inkFaint" style={styles.note}>
              Pas assez de temps ou trop petit : gardez-les pour un autre jour, ou changez l'horaire.
            </Txt>
            <Group>
              {plan.unplaced.map((u) => (
                <Row
                  key={u.idea.id}
                  icon="close-circle-outline"
                  tone="neutral"
                  title={u.idea.name}
                  subtitle={u.reason === "tall" ? `Taille minimale ${u.idea.minHeightCm} cm` : "Pas assez de temps"}
                  right={<Badge label={u.reason === "tall" ? "Trop petit" : "Pas de place"} tone={u.reason === "tall" ? "stamp" : "neutral"} />}
                />
              ))}
            </Group>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={plan.items.length > 0 ? `Ajouter ${plural(plan.items.length, "étape")} à ${day.title}` : "Rien à ajouter"}
          icon="checkmark"
          full
          loading={applying}
          disabled={plan.items.length === 0}
          onPress={onApply}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: layout.gutter },
  undo: { marginTop: space.md },
  scrollContent: { padding: layout.gutter, paddingBottom: space.xxl },
  label: { marginBottom: space.sm },
  labelGap: { marginTop: space.lg },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  hint: { marginTop: space.md },
  summary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, marginTop: space.xl },
  summaryText: { flex: 1, gap: 2 },
  note: { marginTop: space.xs, marginBottom: space.sm },
  list: { marginTop: space.md },
  section: { marginTop: space.xl },
  time: { minWidth: 48, flexShrink: 0, alignSelf: "flex-start", paddingTop: 2 },
  footer: { paddingHorizontal: layout.gutter, paddingTop: space.md, paddingBottom: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: THEME.hairStrong, backgroundColor: THEME.bg },
}));
