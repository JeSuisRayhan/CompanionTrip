import React, { useState, useCallback, useEffect } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl, Animated, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "../components/Icon";
import { Swipeable } from "react-native-gesture-handler";
import { useFocusEffect } from "@react-navigation/native";

import { THEME, space, layout, radius, type, themedStyles, withAlpha, paperEdge } from "../lib/theme";
import { loadTrips, storageStatus, acknowledgeRecovery } from "../lib/storage";
import { backupReminder, snoozeBackupReminder } from "../lib/backupReminder";
import { exportBackup } from "../lib/backup";
import { useUpdatePending, restartApp } from "../lib/appUpdates";
import { deleteTrip, createTrip } from "../lib/trips";
import { tripRange, tripStatus, formatRangeWithYear, formatTicketDates, isoDate, resolveDayDate } from "../lib/dates";
import { inkNameOf, tripInk, TripInkContext } from "../lib/tripInk";
import { detectCountry } from "../lib/countries";
import UndoToast from "../components/UndoToast";
import HomeNotices from "../components/HomeNotices";
import { Txt, Stamp, Group, Row, Thumb, SectionTitle, EmptyState, Fab, round } from "../components/ui";
import { TopButton, Perforation } from "../components/mix";
import Logo from "../components/Logo";
import Flip from "../components/Flip";
import TripCover from "../components/TripCover";
import Appear from "../components/Appear";
import { usePressScale } from "../lib/motion";

function todayISO() {
  return isoDate(new Date());
}

function todayDayId(trip, today) {
  const index = trip.days.findIndex((d, i) => resolveDayDate(trip, d, i) === today);
  return index >= 0 ? trip.days[index].id : null;
}

function todayHasDay(trip, today) {
  return !!todayDayId(trip, today);
}

function dayDiff(startISO, today) {
  return Math.round((new Date(startISO + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
}

// "J-46", "Demain", "Aujourd'hui" — the countdown shown on upcoming trips.
function countdownText(diff) {
  if (diff == null || diff < 0) return null;
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Demain";
  return `J-${diff}`;
}

// What is coming up today for a trip that is under way.
function nextStepFor(trip, today) {
  const index = trip.days.findIndex((d, i) => resolveDayDate(trip, d, i) === today);
  if (index < 0) return null;
  const day = trip.days[index];
  const acts = [...(day.activities || [])].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  if (!acts.length) return { kind: "empty", dayNumber: index + 1 };
  const pending = acts.find((a) => !a.done);
  return pending ? { kind: "next", dayNumber: index + 1, act: pending } : { kind: "done", dayNumber: index + 1 };
}

export default function HomeScreen({ navigation }) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: "", undoTrip: null });
  const [storage, setStorage] = useState({ blocked: false, recoveredAt: null });
  const [backup, setBackup] = useState({ due: false, days: null });
  const [backupBusy, setBackupBusy] = useState(false);
  const updatePending = useUpdatePending();
  const [updateLater, setUpdateLater] = useState(false);

  const refresh = useCallback(async () => {
    const t = await loadTrips();
    setTrips(t);
    setStorage(storageStatus());
    setBackup(await backupReminder(t.length));
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

  async function handleDeleteWithUndo(trip) {
    await deleteTrip(trip.id);
    await refresh();
    setToast({ visible: true, message: `"${trip.name}" supprimé`, undoTrip: trip });
  }

  async function handleUndoDelete() {
    const trip = toast.undoTrip;
    setToast({ visible: false, message: "", undoTrip: null });
    if (trip) {
      await createTrip(trip);
      await refresh();
    }
  }

  async function saveBackupNow() {
    setBackupBusy(true);
    try {
      await exportBackup();
    } catch (e) {
      Alert.alert("Sauvegarde impossible", "L'export a échoué. Réessayez depuis Réglages.");
    } finally {
      setBackupBusy(false);
      await refresh();
    }
  }

  async function snoozeBackup() {
    await snoozeBackupReminder();
    await refresh();
  }

  function handleToastDismiss() {
    setToast({ visible: false, message: "", undoTrip: null });
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

  const openTrip = (trip) => navigation.navigate("Trip", { tripId: trip.id });
  // With no trip under way, the nearest departure gets the big ticket.
  const featuredNext = current.length === 0 && upcoming.length > 0 ? upcoming[0] : null;
  const listedUpcoming = featuredNext ? upcoming.slice(1) : upcoming;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={THEME.teal} />}
      >
        <View style={styles.header}>
          <View style={styles.headerTitle}>
            <Logo width={46} />
            <Txt variant="display" style={{ flexShrink: 1 }} accessibilityRole="header">
              Vos voyages
            </Txt>
          </View>
          <TopButton icon="options-outline" label="Réglages de l'application" onPress={() => navigation.navigate("Settings")} />
        </View>

        {loading ? (
          <View style={[styles.skeleton, round("xl")]} />
        ) : (
          <View>
            <HomeNotices
              storage={storage}
              backup={backup}
              busy={backupBusy}
              updatePending={updatePending && !updateLater}
              onRestart={() => restartApp()}
              onLater={() => setUpdateLater(true)}
              onRetry={refresh}
              onAcknowledge={() => {
                acknowledgeRecovery();
                setStorage(storageStatus());
              }}
              onBackup={saveBackupNow}
              onSnooze={snoozeBackup}
            />
            {trips.length === 0 && (
              <EmptyState
                icon="airplane-outline"
                tone="gold"
                title="Prêt pour la prochaine aventure ?"
                text="Créez un voyage, ajoutez vos idées ou collez votre programme."
                action={{ label: "Nouveau voyage", icon: "add", onPress: () => navigation.navigate("Onboarding") }}
              />
            )}

            {current.map((trip, i) => (
              <SwipeToDelete key={trip.id} trip={trip} onDeleteWithUndo={handleDeleteWithUndo} style={styles.ticketGap} room>
                <TripTicket
                  mode="current"
                  index={i}
                  trip={trip}
                  today={today}
                  onPress={() => openTrip(trip)}
                  onPressToday={
                    todayHasDay(trip, today)
                      ? () =>
                          trip.tripType === "park"
                            ? navigation.navigate("DayDetail", { tripId: trip.id, dayId: todayDayId(trip, today) })
                            : navigation.navigate("Trip", { tripId: trip.id, initialTab: "today" })
                      : null
                  }
                />
              </SwipeToDelete>
            ))}

            {featuredNext && (
              <SwipeToDelete trip={featuredNext} onDeleteWithUndo={handleDeleteWithUndo} style={styles.ticketGap} room>
                <TripTicket mode="next" index={current.length} trip={featuredNext} today={today} onPress={() => openTrip(featuredNext)} />
              </SwipeToDelete>
            )}

            {listedUpcoming.length > 0 && (
              <View style={styles.section}>
                <SectionTitle title={featuredNext ? "Ensuite" : "À venir"} count={listedUpcoming.length} />
                <Group>
                  {listedUpcoming.map((trip) => (
                    <SwipeToDelete key={trip.id} trip={trip} onDeleteWithUndo={handleDeleteWithUndo} bg={THEME.bgCard}>
                      <UpcomingRow trip={trip} today={today} onPress={() => openTrip(trip)} />
                    </SwipeToDelete>
                  ))}
                </Group>
              </View>
            )}

            {past.length > 0 && (
              <View style={styles.section}>
                <SectionTitle title="Voyages passés" />
                {past.map((trip, i) => (
                  <SwipeToDelete key={trip.id} trip={trip} onDeleteWithUndo={handleDeleteWithUndo}>
                    <PastRow trip={trip} first={i === 0} onPress={() => openTrip(trip)} />
                  </SwipeToDelete>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
      {!loading && trips.length > 0 && !toast.visible && <Fab label="Nouveau voyage" onPress={() => navigation.navigate("Onboarding")} />}
      <UndoToast visible={toast.visible} message={toast.message} onUndo={handleUndoDelete} onDismiss={handleToastDismiss} />
    </SafeAreaView>
  );
}

// `bg` fills the swiped row so the delete tile never shows through the text.
// `room`: the swipe container clips what leaves it, so a card with a shadow gets a margin to cast it into
// (cancelled by a negative margin outside, so the layout does not move).
const SHADOW_ROOM = 14;
function SwipeToDelete({ trip, onDeleteWithUndo, children, style, bg = THEME.bg, room }) {
  const pad = room && THEME.light ? SHADOW_ROOM : 0;
  return (
    <View style={[style, pad ? { marginHorizontal: -pad, marginBottom: space.md - pad } : null]}>
      <Swipeable
        renderRightActions={() => (
          <Pressable
            style={styles.deleteAction}
            onPress={() => onDeleteWithUndo(trip)}
            accessibilityRole="button"
            accessibilityLabel={`Supprimer ${trip.name}`}
          >
            <Icon name="trash-outline" size={22} color={THEME.bg} />
          </Pressable>
        )}
        overshootRight={false}
      >
        <View style={[{ backgroundColor: bg }, pad ? { padding: pad, paddingTop: 0 } : null]}>{children}</View>
      </Swipeable>
    </View>
  );
}

// The trip's boarding pass: its cover (a drawing in the ink of the trip, or its photo) and its name on top,
// a perforation, then a stub with the one thing that matters now: the countdown on the departure board
// (next trip) or the day and what comes next (trip under way).
function TripTicket({ mode, index = 0, trip, today, onPress, onPressToday }) {
  const press = usePressScale(0.985);
  const { start, end } = tripRange(trip);
  const cover = trip.coverImage;
  const isCurrent = mode === "current";
  const todayIndex = trip.days.findIndex((d, i) => resolveDayDate(trip, d, i) === today);
  const diff = start ? dayDiff(start, today) : null;
  const step = isCurrent ? nextStepFor(trip, today) : null;

  return (
    <TripInkContext.Provider value={tripInk(trip)}>
    <Appear index={index}>
    <Animated.View style={[styles.ticket, round("xl"), { transform: [{ scale: press.scale }] }]}>
      <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button" accessibilityLabel={`Ouvrir ${trip.name}`}>
        <TripCover trip={trip} height={148} photoUri={cover?.url} style={styles.ticketTop}>
          <View style={styles.ticketBadgeRow}>
            {isCurrent ? <Stamp label="En cours" tone="teal" icon="radio-button-on" thump delay={280 + Math.min(index, 5) * 70} /> : <Stamp label="Prochain départ" tone="gold" thump delay={280 + Math.min(index, 5) * 70} />}
          </View>
          {cover?.url && cover?.photographerName ? (
            <Text style={styles.credit} numberOfLines={1}>
              Photo : {cover.photographerName} / Unsplash
            </Text>
          ) : null}
        </TripCover>
        <View style={styles.ticketTitleBlock}>
          <Text style={[type.title, styles.ticketTitle]} numberOfLines={2}>
            {trip.name}
          </Text>
          {start ? <Text style={styles.ticketDates}>{formatTicketDates(start, end)}</Text> : null}
        </View>
      </Pressable>

      <Perforation />

      {isCurrent ? (
        <Pressable
          onPress={onPressToday || onPress}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          accessibilityRole="button"
          accessibilityLabel={onPressToday ? "Ouvrir le programme d'aujourd'hui" : `Ouvrir ${trip.name}`}
          style={({ pressed }) => [styles.stub, pressed && { backgroundColor: THEME.pressed }]}
        >
          <View style={styles.stubCounter}>
            <Text style={styles.stubCaption}>Jour</Text>
            <View style={styles.stubFlipRow}>
              {todayIndex >= 0 ? <Flip value={String(todayIndex + 1)} size="md" label={`Jour ${todayIndex + 1} sur ${trip.days.length}`} /> : <Text style={styles.stubWord}>–</Text>}
              <Text style={styles.stubOf}>sur {trip.days.length}</Text>
            </View>
          </View>
          <View style={styles.stubBody}>
            {step && step.kind === "next" ? (
              <>
                <View style={styles.stubNextRow}>
                  <Text style={styles.stubCaption}>À suivre</Text>
                  {step.act.time ? <Text style={[type.numeral, { color: THEME.gold }]}>{step.act.time}</Text> : null}
                </View>
                <Text style={styles.stubValue} numberOfLines={2}>
                  {step.act.title}
                </Text>
              </>
            ) : step && step.kind === "done" ? (
              <View style={styles.stubNextRow}>
                <Icon name="checkmark-circle" size={20} color={THEME.teal} />
                <Text style={styles.stubValue}>Journée terminée</Text>
              </View>
            ) : step && step.kind === "empty" ? (
              <>
                <Text style={styles.stubValue}>Rien de prévu aujourd'hui</Text>
                <Text style={styles.stubCaption}>Ouvrir la journée pour ajouter une étape</Text>
              </>
            ) : (
              <Text style={styles.stubValue}>Voir le programme</Text>
            )}
          </View>
          <Icon name="chevron-forward" size={18} color={THEME.inkFaint} />
        </Pressable>
      ) : (
        <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} style={({ pressed }) => [styles.stub, pressed && { backgroundColor: THEME.pressed }]} accessibilityRole="button" accessibilityLabel={`Ouvrir ${trip.name}`}>
          <View style={styles.stubCounter}>
            <Text style={styles.stubCaption}>{diff != null && diff > 1 ? "Départ dans" : "Départ"}</Text>
            {diff != null && diff > 1 ? <Flip value={String(diff)} size="md" label={`${diff} jours`} /> : <Text style={styles.stubWord}>{diff === 0 ? "Aujourd'hui" : diff === 1 ? "Demain" : "–"}</Text>}
          </View>
          <View style={styles.stubBody}>
            <Text style={styles.stubCaption}>Premier jour</Text>
            <Text style={styles.stubValue} numberOfLines={2}>
              {trip.days[0] ? trip.days[0].title : "À planifier"}
            </Text>
          </View>
          <Icon name="chevron-forward" size={18} color={THEME.inkFaint} />
        </Pressable>
      )}
    </Animated.View>
    </Appear>
    </TripInkContext.Provider>
  );
}

function UpcomingRow({ trip, today, onPress }) {
  const { start, end } = tripRange(trip);
  const ink = inkNameOf(trip);
  const diff = start ? dayDiff(start, today) : null;
  const label = countdownText(diff);
  const country = detectCountry(trip);
  // the country is a second line of information: left out when the trip is named after it ("Japon")
  const showCountry = country && country.name.toLowerCase() !== String(trip.name || "").trim().toLowerCase();
  const meta = [start ? formatRangeWithYear(start, end) : "Pas encore daté", showCountry ? country.name : null].filter(Boolean).join(" · ");
  return (
    <Row
      lead={<Thumb uri={trip.coverImage?.url} icon={trip.tripType === "park" ? "sparkles" : "airplane"} tone={ink} size={40} />}
      title={trip.name}
      subtitle={meta}
      right={label ? <Stamp label={label} tone={ink} small /> : null}
      chevron
      onPress={onPress}
    />
  );
}

function PastRow({ trip, first, onPress }) {
  const { start, end } = tripRange(trip);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={trip.name}
      style={({ pressed }) => [styles.pastRow, first && { borderTopWidth: StyleSheet.hairlineWidth }, pressed && { backgroundColor: THEME.pressed }]}
    >
      <Text style={[type.body, { flex: 1, color: THEME.inkMuted }]} numberOfLines={1}>
        {trip.name}
      </Text>
      <Text style={[type.caption, { color: THEME.inkFaint }]}>{start ? formatRangeWithYear(start, end) : ""}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  scrollContent: { paddingHorizontal: layout.gutter, paddingTop: space.sm, paddingBottom: layout.tabBarClearance },
  header: { flexDirection: "row", alignItems: "center", gap: space.md, marginBottom: space.xl },
  headerTitle: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.md },
  skeleton: { height: 300, backgroundColor: THEME.bgCard, opacity: 0.5 },
  section: { marginTop: space.xl },
  ticketGap: { marginBottom: space.md },

  ticket: { backgroundColor: THEME.bgCard, overflow: "hidden", ...paperEdge() },
  ticketTop: { padding: space.lg },
  ticketBadgeRow: { flexDirection: "row" },
  ticketTitleBlock: { gap: space.xs, paddingHorizontal: 22, paddingTop: 18, paddingBottom: space.xs },
  ticketTitle: { color: THEME.ink },
  ticketDates: { ...type.subhead, color: THEME.inkMuted },
  // On the photo, a small label that reads on any picture.
  credit: { position: "absolute", right: space.sm, bottom: space.sm, ...type.caption, fontSize: 11, color: THEME.onAccent, backgroundColor: withAlpha(THEME.ink, 0.6), borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, overflow: "hidden", maxWidth: "70%" },

  stub: { flexDirection: "row", alignItems: "center", gap: space.lg, paddingHorizontal: 22, paddingTop: space.xs, paddingBottom: 18, minHeight: 84 },
  stubCounter: { gap: 6 },
  stubFlipRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  stubCaption: { ...type.caption, color: THEME.inkMuted },
  stubWord: { ...type.heading, color: THEME.ink },
  stubOf: { ...type.caption, color: THEME.inkMuted },
  stubValue: { ...type.name, color: THEME.ink },
  stubBody: { flex: 1, gap: 2 },
  stubNextRow: { flexDirection: "row", alignItems: "center", gap: space.sm },

  pastRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.hairStrong,
  },
  deleteAction: {
    width: 72,
    marginLeft: space.sm,
    borderRadius: radius.lg,
    backgroundColor: THEME.stamp,
    alignItems: "center",
    justifyContent: "center",
  },
}));
