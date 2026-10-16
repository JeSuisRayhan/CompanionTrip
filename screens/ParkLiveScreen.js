// Amusement-park mode, on the day: the progress of the day as a ticket, the next attraction with its queue on the
// departure board, what to do while a queue goes down, what comes after, and what is done.
import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "../components/Icon";
import { useFocusEffect } from "@react-navigation/native";

import { THEME, TONES, LIT, FONTS, layout, type, themedStyles, paperEdge } from "../lib/theme";
import { getTrip, toggleActivityDone, editActivity } from "../lib/trips";
import { resolveDayDate, formatFullDate, isoDate } from "../lib/dates";
import { realTripId } from "../lib/parkDay";
import { fetchQueueTimes, liveByRideId, latestUpdate, ageLabel, waitTone } from "../lib/queueTimes";
import QueueTimesCredit from "../components/QueueTimesCredit";
import { logError } from "../lib/errorLog";
import { checkAlertsOnScreen } from "../lib/parkAlertsTask";
import { waitOf } from "../lib/parkPlanner";
import { dayStops, isMeal, currentWait, isClosed, endLabel, postponedTime, shortQueues, doNow, timeBefore } from "../lib/parkLive";
import { tripInk, TripInkContext } from "../lib/tripInk";
import { Button, Stamp, Group, Row, ProgressBar, EmptyState, round } from "../components/ui";
import { TripTopBar, TopButton, Perforation, Section } from "../components/mix";
import Flip from "../components/Flip";

const REFRESH_MS = 5 * 60 * 1000; // Queue-Times refreshes its data every 5 minutes
const CLOCK_MS = 30 * 1000;
const LONG_QUEUE_MIN = 40; // from here, a short queue nearby is worth suggesting

const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;

// The queue of a step, as it is told: live when Queue-Times knows the ride, the usual one written with the ride, none
// for a show (it starts at its hour) or a meal.
function queueOf(stop) {
  const { ride, idea } = stop;
  if (isMeal(stop)) return { kind: "meal" };
  if (ride && !ride.open) return { kind: "closed" };
  if (idea && (idea.categoryId === "spectacle" || idea.showTime)) return { kind: "show" };
  if (ride && ride.wait != null) return { kind: "wait", minutes: ride.wait, live: true };
  if (idea && idea.waitMin != null) return { kind: "wait", minutes: idea.waitMin, live: false };
  return { kind: "none" };
}

// The tile of a step in a list: its queue on a little board (a bar per level), or the glyph of what it is.
function StopTile({ stop }) {
  const q = queueOf(stop);
  if (q.kind === "wait") {
    const tone = waitTone(q.minutes);
    const lit = tone === "gold" ? LIT.gold : tone === "stamp" ? LIT.stamp : LIT.teal;
    const level = tone === "gold" ? 2 : tone === "stamp" ? 3 : 1;
    return (
      <View style={styles.wait} accessible accessibilityRole="image" accessibilityLabel={q.live ? `${q.minutes} minutes d'attente` : `Environ ${q.minutes} minutes d'attente habituelle`}>
        <View style={styles.waitHinge} />
        <Text style={[styles.waitNum, { color: lit }]} allowFontScaling={false}>
          {q.live ? "" : "~"}
          {q.minutes}
          <Text style={styles.waitUnit}> min</Text>
        </Text>
        <View style={styles.waitBars}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.waitBar, i < level && { backgroundColor: lit }]} />
          ))}
        </View>
      </View>
    );
  }
  if (q.kind === "closed") {
    return (
      <View style={styles.wait} accessible accessibilityLabel="Fermée pour le moment">
        <Text style={[styles.waitClosed, { color: LIT.stamp }]} allowFontScaling={false}>FERMÉE</Text>
      </View>
    );
  }
  const meal = q.kind === "meal";
  const tone = TONES[meal ? "gold" : "teal"];
  return (
    <View style={[styles.glyph, { backgroundColor: tone.bg }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Icon name={meal ? "restaurant-outline" : q.kind === "show" ? "musical-notes-outline" : "rocket-outline"} size={28} color={tone.fg} />
    </View>
  );
}

// "12:15 · Vallée du Tonnerre"
const subOf = (stop, extra) => [stop.activity.time, extra, isClosed(stop) ? "Fermée pour le moment" : stop.idea && stop.idea.land ? stop.idea.land : null].filter(Boolean).join(" · ") || undefined;

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
  const ink = tripInk(trip);
  const top = (
    <TripTopBar
      name={trip ? trip.name : "Jour J"}
      onBack={back}
      backLabel="Retour"
      right={trip ? <TopButton icon="options-outline" label="Réglages du voyage" onPress={() => navigation.navigate("TripSettings", { tripId: realTripId(trip.id) })} /> : null}
    />
  );

  if (loading || !trip || !day) {
    return (
      <TripInkContext.Provider value={ink}>
        <SafeAreaView style={styles.safe}>
          {top}
          <View style={styles.center}>
            {loading ? (
              <ActivityIndicator color={THEME.teal} />
            ) : (
              <EmptyState icon="alert-circle-outline" title="Jour introuvable" text="Ce jour n'existe plus dans ce voyage." action={{ label: "Retour", onPress: back }} />
            )}
          </View>
        </SafeAreaView>
      </TripInkContext.Provider>
    );
  }

  if (stops.length === 0) {
    return (
      <TripInkContext.Provider value={ink}>
        <SafeAreaView style={styles.safe}>
          {top}
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
      </TripInkContext.Provider>
    );
  }

  const todo = stops.filter((s) => !s.activity.done);
  const doneStops = stops.filter((s) => s.activity.done);
  const rides = stops.filter((s) => !isMeal(s));
  const ridesDone = rides.filter((s) => s.activity.done).length;
  const next = todo[0] || null;
  const later = todo.slice(1);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const endsAt = endLabel(todo, { date, today: isoDate(now), nowMin }); // "Fin vers 17:50" | "Fin après minuit" | null
  const endValue = endsAt ? (endsAt.match(/(\d{2}:\d{2})$/) || [])[1] || "après minuit" : null;
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
    <TripInkContext.Provider value={ink}>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        {top}
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.head}>
            <Text style={type.subhead}>{date ? `${formatFullDate(date)} · jour J` : "Jour J"}</Text>
            <Text style={type.display} accessibilityRole="header">{day.title}</Text>
          </View>

          <View style={styles.block}>
            <View style={[styles.ticket, round("xl")]}>
              <View style={styles.progress}>
                <Text style={type.heading}>{`${ridesDone} sur ${plural(rides.length, "attraction")} faite${ridesDone > 1 ? "s" : ""}`}</Text>
                <ProgressBar value={rides.length ? ridesDone / rides.length : 0} tone={ink.name} height={6} />
                {endValue ? (
                  <View style={styles.endRow}>
                    <Text style={type.subhead}>Fin de journée prévue</Text>
                    <Text style={styles.endValue}>{endValue}</Text>
                  </View>
                ) : null}
              </View>
              <Perforation />
              <View style={styles.liveRow}>
                {refreshing ? <ActivityIndicator size="small" color={THEME.teal} /> : <Icon name={error ? "cloud-offline-outline" : "pulse"} size={16} color={error ? THEME.stamp : THEME.teal} />}
                <Text style={[type.subhead, styles.liveText, error && { color: THEME.stamp }]} numberOfLines={3}>
                  {error ? `${error} Estimation avec les attentes habituelles.` : qtId == null ? "Choisissez un parc dans l'onglet Attractions pour voir les attentes en direct." : updated ? `Attentes mises à jour ${updated}` : "Chargement des attentes…"}
                </Text>
                {qtId != null ? <TopButton icon="refresh" plain size={20} label="Actualiser les attentes" onPress={() => !refreshing && load(true)} /> : null}
              </View>
            </View>
            {qtId != null ? <QueueTimesCredit style={styles.credit} /> : null}
          </View>

          {next ? (
            <View style={[styles.ticket, round("xl")]}>
              <View style={styles.tkTitle}>
                <Stamp label={next.activity.time ? `À suivre · prévu à ${next.activity.time}` : "À suivre"} tone="gold" style={{ alignSelf: "flex-start" }} />
                <Text style={[type.title, { paddingTop: 6 }]} numberOfLines={3} accessibilityRole="header">{next.activity.title}</Text>
                {next.idea && next.idea.land ? <Text style={type.subhead}>{next.idea.land}</Text> : null}
              </View>
              <Perforation />
              <View style={styles.stub}>
                {isMeal(next) ? (
                  <Text style={type.body}>Profitez-en pour recharger les batteries.</Text>
                ) : nextClosed ? (
                  <View style={{ gap: 4 }}>
                    <Text style={[type.heading, { color: THEME.stamp }]}>Fermée pour le moment</Text>
                    <Text style={type.subhead}>Passez à la suivante, ou revenez plus tard.</Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.waitRow}>
                      <Flip value={String(nextWait)} size={String(nextWait).length > 2 ? "lg" : "xl"} tone="gold" label={`${nextWait} minutes d'attente`} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.waitTitle}>min d'attente</Text>
                        <Text style={type.caption}>{next.ride && next.ride.open ? "en ce moment" : "habituelle"}</Text>
                      </View>
                    </View>
                    {Math.abs(delta) >= 10 ? (
                      <Stamp label={delta > 0 ? `+${delta} min de plus que d'habitude` : `${-delta} min de moins que d'habitude`} tone={delta > 0 ? "gold" : "teal"} small style={{ alignSelf: "flex-start" }} />
                    ) : null}
                  </>
                )}
              </View>
              <View style={styles.btns}>
                <Button title="Fait" icon="checkmark" size="lg" full accessibilityLabel={`Marquer ${next.activity.title} comme faite`} onPress={() => markDone(next)} />
                <View style={styles.btnRow}>
                  {todo.length > 1 ? (
                    <Button title="Plus tard" icon="time-outline" variant="secondary" style={styles.btn} accessibilityLabel={`Repousser ${next.activity.title} après les autres`} onPress={() => postpone(next)} />
                  ) : null}
                  <Button title="Carte" icon="map-outline" variant="secondary" style={styles.btn} accessibilityLabel="Voir le jour sur la carte" onPress={() => navigation.navigate("TripMap", { tripId: trip.id, dayId: day.id })} />
                </View>
              </View>
            </View>
          ) : (
            <View style={[styles.ticket, round("xl")]} accessible accessibilityLabel={`Journée terminée, ${plural(ridesDone, "attraction faite", "attractions faites")}`}>
              <View style={[styles.tkTitle, { paddingTop: 24, paddingBottom: 22, gap: 10 }]}>
                <Stamp label="Journée terminée" tone="teal" icon="checkmark" large style={{ alignSelf: "flex-start" }} />
                <Text style={[type.body, { color: THEME.inkMuted, paddingTop: 6 }]}>{`${plural(ridesDone, "attraction faite", "attractions faites")}. Bravo, et bon retour !`}</Text>
              </View>
            </View>
          )}

          {suggestions.length > 0 ? (
            <Section title="Pendant que la file baisse">
              <Text style={type.subhead}>Ouvertes, 20 minutes d'attente ou moins, pas encore faites.</Text>
              <Group>
                {suggestions.map((s) => (
                  <Row
                    key={s.idea.id}
                    lead={<StopTile stop={{ activity: { type: "activite" }, idea: s.idea, ride: s.ride }} />}
                    title={s.idea.name}
                    subtitle={s.idea.land || undefined}
                    accessibilityLabel={`${s.idea.name}, ${s.ride.wait} minutes d'attente`}
                    right={<Button title="Y aller" size="sm" fill="gold" accessibilityLabel={`Faire ${s.idea.name} maintenant`} onPress={() => goNow(s.idea)} />}
                  />
                ))}
              </Group>
            </Section>
          ) : null}

          {later.length > 0 ? (
            <Section title="Ensuite" count={later.length}>
              <Group>
                {later.map((s) => (
                  <Row
                    key={s.activity.id}
                    lead={<StopTile stop={s} />}
                    title={s.activity.title}
                    subtitle={subOf(s)}
                    accessibilityLabel={`${s.activity.time || "sans heure"}, ${s.activity.title}${isClosed(s) ? ", fermée" : ""}`}
                    right={<TopButton icon="checkmark" plain label={`Marquer ${s.activity.title} comme faite`} onPress={() => markDone(s)} />}
                  />
                ))}
              </Group>
            </Section>
          ) : null}

          {doneStops.length > 0 ? (
            <Section title="Faites" count={doneStops.length}>
              <Text style={type.subhead}>Touchez une ligne pour la remettre à faire.</Text>
              <Group>
                {doneStops.map((s) => (
                  <Row
                    key={s.activity.id}
                    lead={
                      <View style={styles.doneTile}>
                        <Icon name="checkmark" size={18} color={THEME.teal} />
                      </View>
                    }
                    title={s.activity.title}
                    subtitle={s.activity.time || undefined}
                    accessibilityLabel={`${s.activity.title}, faite. Remettre à faire`}
                    onPress={() => markDone(s)}
                  />
                ))}
              </Group>
            </Section>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </TripInkContext.Provider>
  );
}

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: layout.gutter },
  scrollContent: { paddingHorizontal: layout.gutter, paddingTop: 20, paddingBottom: 32, gap: 24 },
  head: { gap: 6 },
  block: { gap: 4 },
  credit: { paddingVertical: 4 },

  ticket: { backgroundColor: THEME.bgCard, overflow: "hidden", ...paperEdge() },
  progress: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 6, gap: 12 },
  endRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  endValue: { fontFamily: FONTS.monoMed, fontSize: 14, lineHeight: 20, color: THEME.ink },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 18, paddingRight: 8, paddingBottom: 8, minHeight: 50 },
  liveText: { flex: 1 },

  tkTitle: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 4, gap: 6 },
  stub: { paddingHorizontal: 22, paddingTop: 6, paddingBottom: 16, gap: 14 },
  waitRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  waitTitle: { fontFamily: FONTS.head, fontSize: 22, lineHeight: 26, letterSpacing: -0.2, color: THEME.ink },
  btns: { paddingHorizontal: 22, paddingBottom: 22, gap: 10 },
  btnRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, // on a narrow screen the buttons stack rather than cut their label
  btn: { flexGrow: 1, flexBasis: 140 },

  // the little board of a queue: the minutes, then a bar per level
  wait: { width: 74, height: 66, borderRadius: 10, backgroundColor: THEME.plate, alignItems: "center", justifyContent: "center", gap: 6, overflow: "hidden" },
  waitHinge: { position: "absolute", left: 0, right: 0, top: 24, height: 1.5, backgroundColor: THEME.plateLine },
  waitNum: { fontFamily: FONTS.monoSemi, fontSize: 26, lineHeight: 28, letterSpacing: -1, includeFontPadding: false },
  waitUnit: { fontFamily: FONTS.monoMed, fontSize: 12, letterSpacing: 0, color: THEME.plateDim },
  waitBars: { flexDirection: "row", gap: 3 },
  waitBar: { width: 16, height: 4, borderRadius: 2, backgroundColor: "rgba(251, 248, 242, 0.22)" },
  waitClosed: { fontFamily: FONTS.monoSemi, fontSize: 13, lineHeight: 16, letterSpacing: 1 },
  glyph: { width: 74, height: 66, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  doneTile: { width: 32, height: 32, borderRadius: 8, backgroundColor: THEME.tealDim, alignItems: "center", justifyContent: "center" },
}));
