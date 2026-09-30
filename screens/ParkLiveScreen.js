import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { View, Text, ScrollView, Pressable, Linking, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import { THEME, TONES, space, layout, type, themedStyles } from "../lib/theme";
import { getTrip, toggleActivityDone, editActivity } from "../lib/trips";
import { resolveDayDate, formatDayLabel, isoDate } from "../lib/dates";
import { fetchQueueTimes, liveByRideId, latestUpdate, ageLabel, waitTone, QUEUE_TIMES_CREDIT } from "../lib/queueTimes";
import { logError } from "../lib/errorLog";
import { checkAlertsOnScreen } from "../lib/parkAlertsTask";
import { waitOf } from "../lib/parkPlanner";
import { dayStops, isMeal, currentWait, isClosed, endLabel, postponedTime, shortQueues, doNow, timeBefore } from "../lib/parkLive";
import WaitBadge from "../components/WaitBadge";
import { Txt, Button, IconButton, Surface, Group, Row, ProgressBar, EmptyState, BackHeader } from "../components/ui";

const REFRESH_MS = 5 * 60 * 1000; // Queue-Times refreshes its data every 5 minutes
const CLOCK_MS = 30 * 1000;
const LONG_QUEUE_MIN = 40; // from here, a short queue nearby is worth suggesting

const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;

// Amusement-park mode, on the day: what is next, how long its queue is right
// now, when the day will end at this pace, and what to do while a queue goes down.
export default function ParkLiveScreen({ route, navigation }) {
  const { tripId, dayId } = route.params;
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const mounted = useRef(true);
  const tripRef = useRef(trip); // load only restarts with the park: it reads the alert settings from here
  tripRef.current = trip;
  const qtId = trip && trip.park ? trip.park.qtId : null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refreshTrip = useCallback(async () => {
    const t = await getTrip(tripId);
    if (mounted.current) {
      setTrip(t);
      setLoading(false);
    }
  }, [tripId]);

  useFocusEffect(
    useCallback(() => {
      refreshTrip();
    }, [refreshTrip])
  );

  const load = useCallback(
    async (force) => {
      if (qtId == null) return;
      setRefreshing(true);
      try {
        const d = await fetchQueueTimes(qtId, { force });
        if (mounted.current) {
          setData(d);
          setError(null);
        }
        checkAlertsOnScreen(tripRef.current, d);
      } catch (e) {
        logError(e, { source: "Queue-Times" });
        if (mounted.current) setError(e.message);
      } finally {
        if (mounted.current) setRefreshing(false);
      }
    },
    [qtId]
  );

  // Live data every 5 minutes and a clock for the estimated end, only while the screen is on.
  useFocusEffect(
    useCallback(() => {
      load(false);
      const refresh = setInterval(() => load(true), REFRESH_MS);
      const clock = setInterval(() => setNow(new Date()), CLOCK_MS);
      return () => {
        clearInterval(refresh);
        clearInterval(clock);
      };
    }, [load])
  );

  const live = useMemo(() => (data ? liveByRideId(data) : null), [data]);
  const stops = useMemo(() => (trip ? dayStops(trip, dayId, live) : []), [trip, dayId, live]);
  const day = trip ? trip.days.find((d) => d.id === dayId) : null;
  const back = () => navigation.goBack();
  const dayIndex = trip && day ? trip.days.indexOf(day) : -1;
  const date = day ? resolveDayDate(trip, day, dayIndex) : null;
  const header = <BackHeader title="Jour J" subtitle={day ? `${day.title}${date ? `, ${formatDayLabel(date)}` : ""}` : trip ? trip.name : undefined} onBack={back} />;

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

  if (stops.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        {header}
        <View style={styles.center}>
          <EmptyState
            icon="sparkles-outline"
            tone="pink"
            title="Aucun parcours pour ce jour"
            text="Préparez votre journée pour suivre les attentes en direct, attraction après attraction."
            action={{ label: "Préparer ma journée", icon: "sparkles-outline", onPress: () => navigation.replace("ParkPlan", { tripId: trip.id, dayId: day.id }) }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const todo = stops.filter((s) => !s.activity.done);
  const doneStops = stops.filter((s) => s.activity.done);
  const rides = stops.filter((s) => !isMeal(s));
  const ridesDone = rides.filter((s) => s.activity.done).length;
  const next = todo[0] || null;
  const later = todo.slice(1);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const endsAt = endLabel(todo, { date, today: isoDate(now), nowMin });
  const updated = data ? ageLabel(latestUpdate(data.rides)) : null;

  const nextWait = next ? currentWait(next) : 0;
  const nextClosed = next ? isClosed(next) : false;
  const usual = next && next.idea ? waitOf(next.idea) : null;
  const delta = next && next.ride && next.ride.open && next.ride.wait != null && usual != null ? next.ride.wait - usual : 0;
  const suggestions = next && !isMeal(next) && (nextClosed || nextWait >= LONG_QUEUE_MIN) ? shortQueues(trip, day.id, live, { skipIdeaId: next.idea ? next.idea.id : null, from: next.idea }) : [];

  async function markDone(stop) {
    await toggleActivityDone(trip.id, day.id, stop.activity.id);
    await refreshTrip();
  }

  async function postpone(stop) {
    await editActivity(trip.id, day.id, stop.activity.id, { time: postponedTime(stops, stop.activity.id) });
    await refreshTrip();
  }

  async function goNow(idea) {
    await doNow(trip.id, day.id, idea.id, timeBefore(next, nowMin));
    await refreshTrip();
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      {header}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Surface tone="card" r="lg" pad="lg">
          <View style={styles.progressHead}>
            <Txt variant="label">{`${ridesDone} sur ${plural(rides.length, "attraction")} faite${ridesDone > 1 ? "s" : ""}`}</Txt>
            {endsAt ? <Txt variant="caption">{endsAt}</Txt> : null}
          </View>
          <ProgressBar value={rides.length ? ridesDone / rides.length : 0} height={6} style={styles.bar} />
          <View style={styles.liveRow}>
            {refreshing ? <ActivityIndicator size="small" color={THEME.teal} /> : <Ionicons name={error ? "cloud-offline-outline" : "pulse"} size={16} color={error ? THEME.stamp : THEME.teal} />}
            <Txt variant="caption" color={error ? "stamp" : undefined} style={styles.liveText} numberOfLines={3}>
              {error ? `${error} Estimation avec les attentes habituelles.` : qtId == null ? "Choisissez un parc dans l'onglet Attractions pour voir les attentes en direct." : updated ? `Attentes mises à jour ${updated}` : "Chargement des attentes…"}
            </Txt>
            {qtId != null ? <IconButton icon="refresh" label="Actualiser les attentes" size={18} disabled={refreshing} onPress={() => load(true)} /> : null}
          </View>
        </Surface>

        {qtId != null ? (
          <Pressable
            onPress={() => Linking.openURL(QUEUE_TIMES_CREDIT.url)}
            accessibilityRole="link"
            accessibilityLabel={`${QUEUE_TIMES_CREDIT.text}, ouvrir queue-times.com`}
            style={({ pressed }) => [styles.credit, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="open-outline" size={16} color={THEME.teal} />
            <Text style={[type.label, { color: THEME.teal }]}>{QUEUE_TIMES_CREDIT.text}</Text>
          </Pressable>
        ) : null}

        {next ? (
          <Surface tone="raised" r="xl" pad="xl" style={styles.next}>
            <Txt variant="caption">{next.activity.time ? `À suivre, prévu à ${next.activity.time}` : "À suivre"}</Txt>
            <Text style={[type.title, styles.nextTitle]} accessibilityRole="header">
              {next.activity.title}
            </Text>
            {next.idea && next.idea.land ? <Txt variant="subhead">{next.idea.land}</Txt> : null}

            {isMeal(next) ? (
              <Txt variant="body" style={styles.nextInfo}>
                Pause repas. Profitez-en pour recharger les batteries.
              </Txt>
            ) : nextClosed ? (
              <View style={styles.nextInfo}>
                <Text style={[type.heading, { color: THEME.stamp }]}>Fermée pour le moment</Text>
                <Txt variant="subhead">Passez à la suivante, ou revenez plus tard.</Txt>
              </View>
            ) : (
              <View style={styles.nextInfo}>
                <View style={styles.waitRow}>
                  <Text style={[type.numeralLarge, { color: TONES[waitTone(nextWait)].fg }]}>{nextWait}</Text>
                  <Txt variant="label">{next.ride && next.ride.open ? "min d'attente" : "min d'attente habituelle"}</Txt>
                </View>
                {Math.abs(delta) >= 10 ? (
                  <Txt variant="caption" color={delta > 0 ? "stamp" : "teal"}>
                    {delta > 0 ? `${delta} min de plus que d'habitude` : `${-delta} min de moins que d'habitude`}
                  </Txt>
                ) : null}
              </View>
            )}

            <Button title="Fait" icon="checkmark" full style={styles.nextDone} accessibilityLabel={`Marquer ${next.activity.title} comme faite`} onPress={() => markDone(next)} />
            <View style={styles.nextActions}>
              {todo.length > 1 ? (
                <Button title="Plus tard" icon="time-outline" variant="secondary" style={styles.flex} accessibilityLabel={`Repousser ${next.activity.title} après les autres`} onPress={() => postpone(next)} />
              ) : null}
              <Button title="Carte" icon="map-outline" variant="secondary" style={styles.flex} accessibilityLabel="Voir le jour sur la carte" onPress={() => navigation.navigate("TripMap", { tripId: trip.id, dayId: day.id })} />
            </View>
          </Surface>
        ) : (
          <EmptyState icon="trophy-outline" tone="teal" title="Journée terminée" text={`${plural(ridesDone, "attraction faite", "attractions faites")}. Bravo, et bon retour !`} style={styles.finished} />
        )}

        {suggestions.length > 0 ? (
          <View style={styles.section}>
            <Text style={type.heading} accessibilityRole="header">
              Pendant que la file baisse
            </Text>
            <Txt variant="caption" color="inkFaint" style={styles.note}>
              Ouvertes, 20 minutes d'attente ou moins, pas encore faites.
            </Txt>
            <Group>
              {suggestions.map((s) => (
                <Row
                  key={s.idea.id}
                  icon="flash-outline"
                  tone="teal"
                  title={s.idea.name}
                  subtitle={s.idea.land || undefined}
                  accessibilityLabel={`${s.idea.name}, ${s.ride.wait} minutes d'attente`}
                  right={
                    <View style={styles.rowRight}>
                      <WaitBadge ride={s.ride} idea={s.idea} />
                      <Button title="Y aller" size="sm" tone="gold" accessibilityLabel={`Faire ${s.idea.name} maintenant`} onPress={() => goNow(s.idea)} />
                    </View>
                  }
                />
              ))}
            </Group>
          </View>
        ) : null}

        {later.length > 0 ? (
          <View style={styles.section}>
            <Text style={type.heading} accessibilityRole="header">
              Ensuite
            </Text>
            <Group style={styles.list}>
              {later.map((s) => (
                <Row
                  key={s.activity.id}
                  lead={<Text style={[type.numeral, styles.time]}>{s.activity.time || "--:--"}</Text>}
                  title={s.activity.title}
                  subtitle={isClosed(s) ? "Fermée pour le moment" : s.idea && s.idea.land ? s.idea.land : undefined}
                  accessibilityLabel={`${s.activity.time || "sans heure"}, ${s.activity.title}${isClosed(s) ? ", fermée" : ""}`}
                  right={
                    <View style={styles.rowRight}>
                      {isMeal(s) ? null : <WaitBadge ride={s.ride} idea={s.idea} />}
                      <IconButton icon="checkmark-circle-outline" label={`Marquer ${s.activity.title} comme faite`} size={24} tone="teal" onPress={() => markDone(s)} />
                    </View>
                  }
                />
              ))}
            </Group>
          </View>
        ) : null}

        {doneStops.length > 0 ? (
          <View style={styles.section}>
            <Text style={type.heading} accessibilityRole="header">
              Faites
            </Text>
            <Txt variant="caption" color="inkFaint" style={styles.note}>
              Touchez une ligne pour la remettre à faire.
            </Txt>
            <Group>
              {doneStops.map((s) => (
                <Row
                  key={s.activity.id}
                  icon="checkmark"
                  tone="teal"
                  title={s.activity.title}
                  subtitle={s.activity.time || undefined}
                  accessibilityLabel={`${s.activity.title}, faite. Remettre à faire`}
                  onPress={() => markDone(s)}
                />
              ))}
            </Group>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: layout.gutter },
  scrollContent: { padding: layout.gutter, paddingBottom: space.xxxl },
  progressHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md },
  bar: { marginTop: space.md },
  liveRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md },
  liveText: { flex: 1 },
  credit: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, minHeight: layout.minTouch },
  next: { marginTop: space.sm, gap: space.xs },
  nextTitle: { marginTop: space.xs },
  nextInfo: { marginTop: space.lg, gap: space.xs },
  waitRow: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  nextDone: { marginTop: space.xl },
  nextActions: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  finished: { marginTop: space.xl },
  section: { marginTop: space.xl },
  note: { marginTop: space.xs, marginBottom: space.sm },
  list: { marginTop: space.md },
  time: { width: 48, alignSelf: "flex-start", paddingTop: 2 },
  rowRight: { flexDirection: "row", alignItems: "center", gap: space.sm },
}));
