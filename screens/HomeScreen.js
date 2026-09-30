import React, { useState, useCallback, useRef, useEffect } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl, ImageBackground, Animated, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Swipeable } from "react-native-gesture-handler";
import { useFocusEffect } from "@react-navigation/native";

import { THEME, space, layout, radius, type, themedStyles, withAlpha } from "../lib/theme";
import { TRIP_TYPES } from "../lib/constants";
import { loadTrips, storageStatus, acknowledgeRecovery } from "../lib/storage";
import { backupReminder, snoozeBackupReminder } from "../lib/backupReminder";
import { exportBackup } from "../lib/backup";
import { useUpdatePending, restartApp } from "../lib/appUpdates";
import { deleteTrip, createTrip } from "../lib/trips";
import { tripRange, tripStatus, formatDateRange, isoDate, resolveDayDate } from "../lib/dates";
import { fetchDayWeather, weatherInfo } from "../lib/weather";
import UndoToast from "../components/UndoToast";
import HomeNotices from "../components/HomeNotices";
import { Txt, Badge, Group, Row, Thumb, SectionTitle, EmptyState, IconButton, Fab, round } from "../components/ui";

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

function tripTypeMeta(trip) {
  return TRIP_TYPES.find((t) => t.key === (trip.tripType || "long")) || TRIP_TYPES[0];
}

function tripTone(trip) {
  return trip.tripType === "park" ? "pink" : trip.tripType === "short" ? "teal" : "gold";
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
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!loading) {
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    }
  }, [loading]);

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
          <Txt variant="display" style={{ flex: 1 }} accessibilityRole="header">
            Vos voyages
          </Txt>
          <IconButton icon="settings-outline" label="Réglages" filled onPress={() => navigation.navigate("Settings")} />
        </View>

        {loading ? (
          <View style={[styles.skeleton, round("xl")]} />
        ) : (
          <Animated.View style={{ opacity: fadeAnim }}>
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

            {current.map((trip) => (
              <SwipeToDelete key={trip.id} trip={trip} onDeleteWithUndo={handleDeleteWithUndo} style={styles.ticketGap}>
                <TripTicket
                  mode="current"
                  trip={trip}
                  today={today}
                  onPress={() => openTrip(trip)}
                  onPressToday={
                    todayHasDay(trip, today)
                      ? () => navigation.navigate("DayDetail", { tripId: trip.id, dayId: todayDayId(trip, today) })
                      : null
                  }
                />
              </SwipeToDelete>
            ))}

            {featuredNext && (
              <SwipeToDelete trip={featuredNext} onDeleteWithUndo={handleDeleteWithUndo} style={styles.ticketGap}>
                <TripTicket mode="next" trip={featuredNext} today={today} onPress={() => openTrip(featuredNext)} />
              </SwipeToDelete>
            )}

            {listedUpcoming.length > 0 && (
              <View style={styles.section}>
                <SectionTitle title={featuredNext ? "Ensuite" : "À venir"} />
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
          </Animated.View>
        )}
      </ScrollView>
      {!loading && trips.length > 0 && !toast.visible && <Fab label="Nouveau voyage" onPress={() => navigation.navigate("Onboarding")} />}
      <UndoToast visible={toast.visible} message={toast.message} onUndo={handleUndoDelete} onDismiss={handleToastDismiss} />
    </SafeAreaView>
  );
}

// `bg` fills the swiped row so the delete tile never shows through the text.
function SwipeToDelete({ trip, onDeleteWithUndo, children, style, bg = THEME.bg }) {
  return (
    <View style={style}>
      <Swipeable
        renderRightActions={() => (
          <Pressable
            style={styles.deleteAction}
            onPress={() => onDeleteWithUndo(trip)}
            accessibilityRole="button"
            accessibilityLabel={`Supprimer ${trip.name}`}
          >
            <Ionicons name="trash-outline" size={22} color={THEME.bg} />
          </Pressable>
        )}
        overshootRight={false}
      >
        <View style={{ backgroundColor: bg }}>{children}</View>
      </Swipeable>
    </View>
  );
}

function HomeWeatherPreview({ day, dateISO, fallbackLocation }) {
  const [weather, setWeather] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    if (!day || !dateISO) return;
    fetchDayWeather(day, dateISO, fallbackLocation).then((w) => {
      if (!cancelled) setWeather(w);
    });
    return () => {
      cancelled = true;
    };
  }, [day?.id, day?.location, dateISO, fallbackLocation]);

  if (!weather) return null;
  const info = weatherInfo(weather.code);
  return (
    <View style={styles.weatherRow}>
      <Text style={styles.weatherEmoji}>{info.emoji}</Text>
      <Text style={styles.weatherText}>
        {weather.tempMax}° / {weather.tempMin}°
      </Text>
    </View>
  );
}

// The trip's boarding pass: photo + name on top, perforation, then a stub with
// the one thing that matters now (current: today's next step, next: countdown).
function TripTicket({ mode, trip, today, onPress, onPressToday }) {
  const { start, end } = tripRange(trip);
  const cover = trip.coverImage;
  const tone = tripTone(trip);
  const meta = tripTypeMeta(trip);
  const isCurrent = mode === "current";
  const todayIndex = trip.days.findIndex((d, i) => resolveDayDate(trip, d, i) === today);
  const weatherDay = isCurrent ? (todayIndex >= 0 ? trip.days[todayIndex] : trip.days[0]) : trip.days[0];
  const weatherDate = isCurrent ? today : start;
  const diff = start ? dayDiff(start, today) : null;

  const top = (
    <>
      {!cover?.url && <Ionicons name={meta.icon} size={120} color={THEME[tone]} style={styles.ticketWatermark} />}
      <LinearGradient colors={["transparent", withAlpha(THEME.bg, 0.86)]} style={styles.ticketScrim} />
      <View style={styles.ticketBadgeRow}>
        {isCurrent ? <Badge label="En cours" tone="teal" solid icon="radio-button-on" /> : <Badge label="Prochain départ" tone="gold" solid />}
      </View>
      <View style={styles.ticketTitleBlock}>
        <Text style={[type.title, styles.ticketTitle]} numberOfLines={2}>
          {trip.name}
        </Text>
        <View style={styles.ticketMetaRow}>
          {start ? <Text style={styles.ticketDates}>{formatDateRange(start, end)}</Text> : null}
          {weatherDate ? <HomeWeatherPreview day={weatherDay} dateISO={weatherDate} fallbackLocation={trip.defaultLocation} /> : null}
        </View>
      </View>
      {cover?.photographerName ? <Text style={styles.credit}>Photo : {cover.photographerName} / Unsplash</Text> : null}
    </>
  );

  const step = isCurrent ? nextStepFor(trip, today) : null;

  return (
    <View style={[styles.ticket, round("xl")]}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Ouvrir ${trip.name}`}>
        {cover?.url ? (
          <ImageBackground source={{ uri: cover.url }} style={styles.ticketTop} imageStyle={{ resizeMode: "cover" }}>
            {top}
          </ImageBackground>
        ) : (
          <View style={[styles.ticketTop, { backgroundColor: tone === "teal" ? THEME.tealDim : tone === "pink" ? THEME.pinkDim : THEME.goldDim }]}>{top}</View>
        )}
      </Pressable>

      <Perforation />

      {isCurrent ? (
        <Pressable
          onPress={onPressToday || onPress}
          accessibilityRole="button"
          accessibilityLabel={onPressToday ? "Ouvrir le programme d'aujourd'hui" : `Ouvrir ${trip.name}`}
          style={({ pressed }) => [styles.stub, pressed && { backgroundColor: THEME.pressed }]}
        >
          <View style={styles.stubCounter}>
            <Text style={[type.caption, { color: THEME.inkMuted }]}>Jour</Text>
            <View style={styles.stubCounterRow}>
              <Text style={styles.stubNumber}>{todayIndex >= 0 ? todayIndex + 1 : "–"}</Text>
              <Text style={styles.stubOf}>/{trip.days.length}</Text>
            </View>
          </View>
          <View style={styles.stubBody}>
            {step && step.kind === "next" ? (
              <>
                <View style={styles.stubNextRow}>
                  <Text style={type.caption}>À suivre</Text>
                  {step.act.time ? <Text style={[type.numeral, { color: THEME.gold }]}>{step.act.time}</Text> : null}
                </View>
                <Text style={type.label} numberOfLines={2}>
                  {step.act.title}
                </Text>
              </>
            ) : step && step.kind === "done" ? (
              <View style={styles.stubNextRow}>
                <Ionicons name="checkmark-circle" size={20} color={THEME.teal} />
                <Text style={type.label}>Journée terminée</Text>
              </View>
            ) : step && step.kind === "empty" ? (
              <>
                <Text style={type.label}>Rien de prévu aujourd'hui</Text>
                <Text style={type.caption}>Ouvrir la journée pour ajouter une étape</Text>
              </>
            ) : (
              <Text style={type.label}>Voir le programme</Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={18} color={THEME.inkFaint} />
        </Pressable>
      ) : (
        <Pressable onPress={onPress} style={({ pressed }) => [styles.stub, pressed && { backgroundColor: THEME.pressed }]} accessibilityRole="button" accessibilityLabel={`Ouvrir ${trip.name}`}>
          <View style={styles.stubCounter}>
            <Text style={[type.caption, { color: THEME.inkMuted }]}>Départ dans</Text>
            <View style={styles.stubCounterRow}>
              {diff != null && diff > 1 ? (
                <>
                  <Text style={styles.stubNumber}>{diff}</Text>
                  <Text style={styles.stubOf}> jours</Text>
                </>
              ) : (
                <Text style={styles.stubNumber}>{diff === 0 ? "Auj." : diff === 1 ? "Demain" : "–"}</Text>
              )}
            </View>
          </View>
          <View style={styles.stubBody}>
            <Text style={type.caption}>Premier jour</Text>
            <Text style={type.label} numberOfLines={2}>
              {trip.days[0] ? trip.days[0].title : "À planifier"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={THEME.inkFaint} />
        </Pressable>
      )}
    </View>
  );
}

// Tear-off line: two notches cut into the card edges and a dotted rule.
function Perforation() {
  return (
    <View style={styles.perforation} pointerEvents="none">
      <View style={[styles.notch, { left: -NOTCH / 2 }]} />
      <View style={styles.dots}>
        {Array.from({ length: 26 }).map((_, i) => (
          <View key={i} style={styles.dot} />
        ))}
      </View>
      <View style={[styles.notch, { right: -NOTCH / 2 }]} />
    </View>
  );
}

function UpcomingRow({ trip, today, onPress }) {
  const { start, end } = tripRange(trip);
  const tone = tripTone(trip);
  const meta = tripTypeMeta(trip);
  const diff = start ? dayDiff(start, today) : null;
  const label = countdownText(diff);
  return (
    <Row
      lead={<Thumb uri={trip.coverImage?.url} icon={meta.icon} tone={tone} />}
      title={trip.name}
      subtitle={start ? formatDateRange(start, end) : "Pas encore daté"}
      right={label ? <Text style={[type.numeral, { color: THEME[tone] }]}>{label}</Text> : null}
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
      <Text style={[type.caption, { color: THEME.inkFaint }]}>{start ? formatDateRange(start, end) : ""}</Text>
    </Pressable>
  );
}

const NOTCH = 22;

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  scrollContent: { paddingHorizontal: layout.gutter, paddingTop: space.sm, paddingBottom: layout.tabBarClearance },
  header: { flexDirection: "row", alignItems: "center", gap: space.md, marginBottom: space.xl },
  skeleton: { height: 300, backgroundColor: THEME.bgCard, opacity: 0.5 },
  section: { marginTop: space.xl },
  ticketGap: { marginBottom: space.md },

  ticket: { backgroundColor: THEME.bgCard, overflow: "hidden" },
  ticketTop: { height: 212, justifyContent: "space-between", padding: space.lg },
  ticketWatermark: { position: "absolute", right: space.lg, top: space.xl, opacity: 0.16 },
  ticketScrim: { position: "absolute", left: 0, right: 0, bottom: 0, top: 40 },
  ticketBadgeRow: { flexDirection: "row" },
  ticketTitleBlock: { gap: space.xs },
  ticketTitle: { color: THEME.ink },
  ticketMetaRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  ticketDates: { ...type.subhead, color: THEME.ink },
  credit: { position: "absolute", right: space.md, top: space.md, ...type.caption, color: THEME.inkMuted },
  weatherRow: { flexDirection: "row", alignItems: "center", gap: space.xs + 2 },
  weatherEmoji: { fontSize: 15 },
  weatherText: { ...type.numeralSmall, color: THEME.ink },

  perforation: { height: NOTCH, justifyContent: "center" },
  notch: { position: "absolute", width: NOTCH, height: NOTCH, borderRadius: NOTCH / 2, backgroundColor: THEME.bg },
  dots: { flexDirection: "row", justifyContent: "space-between", marginHorizontal: NOTCH },
  dot: { width: 4, height: 2, borderRadius: 1, backgroundColor: THEME.hairStrong },

  stub: { flexDirection: "row", alignItems: "center", gap: space.lg, paddingHorizontal: space.lg + 4, paddingTop: space.xs, paddingBottom: space.lg + 2, minHeight: 84 },
  stubCounter: { minWidth: 76 },
  stubCounterRow: { flexDirection: "row", alignItems: "baseline" },
  stubNumber: { ...type.numeralLarge, fontSize: 34, lineHeight: 38, color: THEME.ink },
  stubOf: { ...type.numeral, color: THEME.inkFaint },
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
