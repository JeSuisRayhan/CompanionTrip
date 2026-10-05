import React, { useState, useCallback, useEffect, useContext, useRef } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Modal, Alert, Image, LayoutAnimation, Platform, UIManager, Dimensions } from "react-native";
import { SafeAreaView, SafeAreaInsetsContext } from "react-native-safe-area-context";
import Icon from "../components/Icon";
import { useFocusEffect } from "@react-navigation/native";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import { THEME, TONES, space, layout, radius, type, themedStyles, withAlpha, paperEdge, shadow } from "../lib/theme";
import { getTrip, editActivity, updateTripSettings, addExpense, addPhrases, updateExpense, removeExpense, addChecklistItem, addChecklistItems, toggleChecklistItem, removeChecklistItem, addPhrase, removePhrase, shiftTripDatesBy, duplicateDay, moveDay, setDayType, addDay } from "../lib/trips";
import { resolveDayDate, formatDateLabel, formatDayLabel, formatShortDate, formatDateRange, tripRange, tripStatus, addDaysISO } from "../lib/dates";
import { decodeBoardingPass, resolveJulianDate } from "../lib/boardingPass";
import { tripActivityTotal, transportTotal, accommodationTotal, repasTotal, otherExpensesTotal, expensesTotal, expensesByCategory, expenseCategory, EXPENSE_CATEGORIES, formatMoney, convertAmount, budgetOverview, budgetSummary, parseBudgetInput } from "../lib/budget";
import { pickImage, pickPdfFile, openDocumentFile, isPdfDoc, addDocument, removeDocument, setDocumentCategory, DOCUMENT_CATEGORIES, documentCategory, suggestDocumentCategory } from "../lib/documents";
import { WeatherBadge } from "./DayDetailScreen";
import { todayPlan } from "../lib/today";
import { pendingBookings } from "../lib/booking";
import { PHRASE_LANGUAGES, packFor, missingFromPack } from "../lib/phrases";
import { detectCountry } from "../lib/countries";
import CountrySheet from "../components/CountrySheet";
import { shareTripAsText, shareTripAsICS } from "../lib/share";
import { exportTripFile } from "../lib/backup";
import DonutChart from "../components/DonutChart";
import { Txt, Button, IconButton, Badge, Stamp, Chip, Group, Row, Thumb, SectionTitle, Field, ProgressBar, EmptyState, Sheet, ActionSheet, round } from "../components/ui";
import TripScroll, { TripChromeContext } from "../components/TripScroll";
import TripCover from "../components/TripCover";
import IdeasTab from "./IdeasTab";
import AttractionsTab from "./AttractionsTab";

const IDEAS_TAB = { key: "ideas", label: "Idées" };
const ATTRACTIONS_TAB = { key: "attractions", label: "Attractions" };
const TABS = [
  { key: "days", label: "Jours" },
  { key: "budget", label: "Budget" },
  { key: "checklists", label: "Checklists" },
  { key: "documents", label: "Documents" },
  { key: "phrases", label: "Phrases" },
];

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TripScreen({ route, navigation }) {
  const { tripId } = route.params;
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(route.params?.initialTab || "days");
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [gridView, setGridView] = useState(false);
  const [incomingScan, setIncomingScan] = useState(null);
  const [incomingAction, setIncomingAction] = useState(null);

  // The title block scrolls away with the content; once it is gone the tabs are
  // pinned to the top (see components/TripScroll.js). `stuck` is true then.
  const insets = useContext(SafeAreaInsetsContext);
  const topInset = insets ? insets.top : 0;
  const [headH, setHeadH] = useState(0);
  const [stuck, setStuck] = useState(false);
  const stuckRef = useRef(false);
  const restoreRef = useRef(0); // where the next tab's scroll starts

  function onBodyScroll(y) {
    const s = headH > 0 && y >= headH - topInset;
    if (s !== stuckRef.current) {
      stuckRef.current = s;
      setStuck(s);
    }
  }
  function changeTab(key) {
    if (key === tab) return;
    restoreRef.current = stuckRef.current ? Math.max(0, headH - topInset) : 0;
    stuckRef.current = false;
    setStuck(false);
    setTab(key);
  }

  useEffect(() => {
    if (route.params?.scannedUri) {
      changeTab("documents");
      setIncomingScan({ uri: route.params.scannedUri, scannedCode: route.params.scannedCode || null, dayId: route.params.dayId || null });
      navigation.setParams({ scannedUri: undefined, scannedCode: undefined, dayId: undefined });
    }
  }, [route.params?.scannedUri]);

  // A day (flight or train) sends here to add a ticket from the gallery, or to look at one.
  useEffect(() => {
    const { addFrom, viewDocId, dayId } = route.params || {};
    if (addFrom || viewDocId) {
      changeTab("documents");
      setIncomingAction({ addFrom: addFrom || null, viewDocId: viewDocId || null, dayId: dayId || null });
      navigation.setParams({ addFrom: undefined, viewDocId: undefined, dayId: undefined });
    }
  }, [route.params?.addFrom, route.params?.viewDocId]);

  const refresh = useCallback(async () => {
    const t = await getTrip(tripId);
    setTrip(t);
    setLoading(false);
  }, [tripId]);

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

  React.useLayoutEffect(() => {
    if (trip) navigation.setOptions({ title: trip.name });
  }, [trip, navigation]);

  if (loading || !trip) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ paddingHorizontal: space.md }}>
          <IconButton icon="chevron-back" label="Retour" filled onPress={() => navigation.goBack()} />
        </View>
        <View style={styles.center}>
          {loading ? (
            <ActivityIndicator color={THEME.teal} />
          ) : (
            <EmptyState icon="alert-circle-outline" title="Voyage introuvable" text="Ce voyage n'existe plus sur cet appareil." action={{ label: "Retour", onPress: () => navigation.goBack() }} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const { start, end } = tripRange(trip);
  const status = tripStatus(trip, isoToday());
  const isParkTrip = trip.tripType === "park";
  // The map opens as soon as there is something to put on it: a step or an idea (the map finds the positions).
  const showMap = !isParkTrip && (trip.days.some((d) => d.activities.length > 0) || (trip.ideas || []).length > 0);
  const hasIdeasTab = !isParkTrip; // a trip with a ready-made programme can also get ideas, to place on its days
  const tabList = hasIdeasTab ? [TABS[0], IDEAS_TAB, ...TABS.slice(1)] : isParkTrip ? [TABS[0], ATTRACTIONS_TAB, ...TABS.slice(1)] : TABS;

  const chrome = {
    top: (
      <View>
        <View onLayout={(e) => setHeadH(e.nativeEvent.layout.height)}>
          <TripHeader trip={trip} start={start} end={end} status={status} onBack={() => navigation.goBack()} onSettings={() => navigation.navigate("TripSettings", { tripId: trip.id })} onMap={showMap ? () => navigation.navigate("TripMap", { tripId: trip.id }) : null} />
        </View>
        <TabBar tabs={tabList} value={tab} onChange={changeTab} />
      </View>
    ),
    onScroll: onBodyScroll,
    takeRestore: () => {
      const y = restoreRef.current;
      restoreRef.current = 0;
      return y;
    },
  };

  return (
    <TripChromeContext.Provider value={chrome}>
    <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
      {tab === "days" && (
        <DaysTab
          trip={trip}
          navigation={navigation}
          onChange={refresh}
          onOpenTab={setTab}
          onShiftDates={() => setShiftModalOpen(true)}
          onDuplicateDay={async (dayId) => {
            await duplicateDay(trip.id, dayId);
            refresh();
          }}
          onMoveDay={async (dayId, direction) => {
            await moveDay(trip.id, dayId, direction);
            refresh();
          }}
          onAddDay={async () => {
            const lastIndex = trip.days.length - 1;
            const lastDate = lastIndex >= 0 ? resolveDayDate(trip, trip.days[lastIndex], lastIndex) : null;
            await addDay(trip.id, { title: `Jour ${trip.days.length + 1}`, date: lastDate ? addDaysISO(lastDate, 1) : null });
            refresh();
          }}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          gridView={gridView}
          onToggleGrid={() => setGridView((v) => !v)}
        />
      )}
      {tab === "ideas" && hasIdeasTab && <IdeasTab trip={trip} navigation={navigation} onChange={refresh} />}
      {tab === "attractions" && isParkTrip && <AttractionsTab trip={trip} navigation={navigation} onChange={refresh} />}
      {tab === "budget" && <BudgetTab trip={trip} onChange={refresh} />}
      {tab === "checklists" && <ChecklistsTab trip={trip} onChange={refresh} />}
      {tab === "documents" && (
        <DocumentsTab
          trip={trip}
          onChange={refresh}
          navigation={navigation}
          incomingScan={incomingScan}
          onConsumeIncomingScan={() => setIncomingScan(null)}
          incomingAction={incomingAction}
          onConsumeIncomingAction={() => setIncomingAction(null)}
        />
      )}
      {tab === "phrases" && <PhrasesTab trip={trip} navigation={navigation} onChange={refresh} country={detectCountry(trip)} />}

      <ShiftDatesModal
        visible={shiftModalOpen}
        onClose={() => setShiftModalOpen(false)}
        onConfirm={async (delta) => {
          await shiftTripDatesBy(trip.id, delta);
          setShiftModalOpen(false);
          refresh();
        }}
      />

      {stuck ? (
        <View style={[styles.stickyTabs, { paddingTop: topInset }]}>
          <TabBar tabs={tabList} value={tab} onChange={changeTab} />
        </View>
      ) : null}
    </SafeAreaView>
    </TripChromeContext.Provider>
  );
}

// The cover (a drawing, or the photo of the trip) runs under the status bar with the round buttons on it; the
// name, dates and status sit on a paper label that overlaps its lower edge.
const HERO = 176;
function TripHeader({ trip, start, end, status, onBack, onSettings, onMap }) {
  const insets = useContext(SafeAreaInsetsContext);
  const top = insets ? insets.top : 0;
  return (
    <View>
      <TripCover trip={trip} height={HERO + top} photoUri={trip.coverImage?.url} postmarkStyle={{ top: top + 52 }}>
        <View style={[styles.headerBar, { paddingTop: space.xs + top }]}>
          <IconButton icon="chevron-back" label="Retour" filled style={styles.heroButton} onPress={onBack} />
          <View style={styles.headerActions}>
            {onMap ? <IconButton icon="map-outline" label="Voir le voyage sur la carte" filled style={styles.heroButton} onPress={onMap} /> : null}
            <IconButton icon="options-outline" label="Réglages du voyage" filled style={styles.heroButton} onPress={onSettings} />
          </View>
        </View>
      </TripCover>
      <View style={[styles.headerLabel, round("lg")]}>
        <Txt variant="display" numberOfLines={2} accessibilityRole="header">
          {trip.name}
        </Txt>
        <View style={styles.headerMeta}>
          {start ? <Txt variant="subhead">{formatDateRange(start, end)}</Txt> : <Txt variant="subhead">Pas encore daté</Txt>}
          {status === "current" ? <Stamp label="En cours" tone="teal" icon="radio-button-on" thump delay={200} /> : null}
        </View>
      </View>
    </View>
  );
}

// Underlined text tabs. The active tab is ink + a rule; no pills.
function TabBar({ tabs, value, onChange }) {
  const scrollRef = useRef(null);
  return (
    <View style={styles.tabBarWrap}>
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
        {tabs.map((t) => {
          const active = value === t.key;
          return (
            <Pressable
              key={t.key}
              // Keep the open tab in view when the bar overflows (6 tabs in build mode):
              // the bar is built again with each tab, so this runs as it appears.
              onLayout={(e) => {
                if (!active || !scrollRef.current) return;
                const { x, width } = e.nativeEvent.layout;
                const hidden = x + width + layout.gutter - Dimensions.get("window").width;
                if (hidden > 0) scrollRef.current.scrollTo({ x: hidden, animated: false });
              }}
              onPress={() => onChange(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={styles.tab}
            >
              <Text style={[type.label, { color: active ? THEME.ink : THEME.inkMuted, fontFamily: active ? type.label.fontFamily : type.body.fontFamily }]}>{t.label}</Text>
              <View style={[styles.tabRule, active && { backgroundColor: THEME.mark }]} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// State of a day on the route: today / done / past / future.
function dayState(day, date, today) {
  if (date && date === today) return "today";
  const acts = day.activities || [];
  if (acts.length > 0 && acts.every((a) => a.done)) return "done";
  if (date && date < today) return "past";
  return "future";
}

function DayNode({ state, number }) {
  if (state === "today") {
    return (
      <View style={[styles.node, styles.nodeToday]}>
        <Text style={[styles.nodeNumber, { color: THEME.onGold }]}>{number}</Text>
      </View>
    );
  }
  if (state === "done") {
    return (
      <View style={[styles.node, styles.nodeDone]}>
        <Icon name="checkmark" size={15} color={THEME.onAccent} />
      </View>
    );
  }
  return (
    <View style={[styles.node, state === "past" ? styles.nodePast : styles.nodeFuture]}>
      <Text style={[styles.nodeNumber, { color: state === "past" ? THEME.inkMuted : THEME.inkFaint }]}>{number}</Text>
    </View>
  );
}

// The way into "Aujourd'hui" while the trip is under way: what is next, at a glance.
function TodayCard({ plan, onPress }) {
  const { next, countdown, total, done, allDone } = plan;
  const subtitle = allDone
    ? `${total} étape${total !== 1 ? "s" : ""} faite${total !== 1 ? "s" : ""}`
    : next
      ? `${next.time ? next.time + " · " : ""}${next.title}`
      : "Journée libre";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Aujourd'hui, jour ${plan.dayNumber}. ${allDone ? "Journée terminée" : next ? "Prochaine étape : " + next.title : "Journée libre"}`}
      style={({ pressed }) => [styles.todayCard, round("lg"), pressed && { opacity: 0.85 }]}
    >
      <View style={styles.todayIcon}>
        <Icon name={allDone ? "checkmark-done" : "today"} size={22} color={THEME.onGold} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.caption}>{`Aujourd'hui · jour ${plan.dayNumber}${total ? ` · ${done.length}/${total} faites` : ""}`}</Text>
        <Text style={type.name} numberOfLines={2}>{subtitle}</Text>
        {countdown && !allDone ? <Text style={[type.caption, { color: countdown.tone === "stamp" ? THEME.stamp : THEME.gold }]}>{countdown.label}</Text> : null}
      </View>
      <Icon name="chevron-forward" size={18} color={THEME.inkFaint} />
    </Pressable>
  );
}

// The way into the summary once the trip is over.
function RecapCard({ trip, onPress }) {
  const photos = (trip.souvenirs || []).length;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Voir le bilan du voyage et les souvenirs"
      style={({ pressed }) => [styles.todayCard, round("lg"), pressed && { opacity: 0.85 }]}
    >
      <View style={styles.todayIcon}>
        <Icon name="images" size={22} color={THEME.onGold} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.caption}>Voyage terminé</Text>
        <Text style={type.name} numberOfLines={2}>{photos > 0 ? `Bilan et ${photos} photo${photos > 1 ? "s" : ""} souvenir${photos > 1 ? "s" : ""}` : "Voir le bilan et ajouter des souvenirs"}</Text>
      </View>
      <Icon name="chevron-forward" size={18} color={THEME.inkFaint} />
    </Pressable>
  );
}

// The steps still to book: a count and the nearest deadline; a tap opens the list.
function BookingsCard({ items, onPress }) {
  const first = items[0];
  const urgent = items.some((i) => i.info && i.info.tone === "stamp");
  const n = items.length;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${n} réservation${n !== 1 ? "s" : ""} à faire. Voir la liste`}
      style={({ pressed }) => [styles.bookCard, round("lg"), pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.bookIcon, urgent && { backgroundColor: THEME.stampDim }]}>
        <Icon name="ticket-outline" size={22} color={urgent ? THEME.stamp : THEME.inkMuted} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.caption}>{`${n} réservation${n !== 1 ? "s" : ""} à faire`}</Text>
        <Text style={type.name} numberOfLines={1}>{first.step.title}</Text>
        {first.info ? <Text style={[type.caption, first.info.tone === "stamp" && { color: THEME.stamp }]}>{first.info.text}</Text> : null}
      </View>
      <Icon name="chevron-forward" size={18} color={THEME.inkFaint} />
    </Pressable>
  );
}

// Every step to book, the nearest deadline first. A row opens its day; the tick says it is booked.
function BookingsSheet({ visible, items, onClose, onOpen, onBooked }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="À réserver">
      {items.length === 0 ? (
        <Txt variant="subhead">Tout est réservé.</Txt>
      ) : (
        <Group style={{ marginBottom: space.md }}>
          {items.map((it) => (
            <Row
              key={it.step.id}
              icon="ticket-outline"
              tone={it.info && it.info.tone === "stamp" ? "stamp" : "neutral"}
              title={it.step.title}
              subtitle={[it.dayTitle, it.info ? it.info.text : null].filter(Boolean).join(" · ")}
              accessibilityLabel={`${it.step.title}, ${it.dayTitle}${it.info ? ", " + it.info.text : ""}`}
              onPress={() => onOpen(it)}
              right={<IconButton icon="checkmark" label={`Marquer comme réservé : ${it.step.title}`} size={20} filled onPress={() => onBooked(it)} />}
            />
          ))}
        </Group>
      )}
    </Sheet>
  );
}

// The rail of the day list: the day number, big, on a vertical line that links the days. Today is an amber
// disc, a finished day is faded, the others are plain ink. The line is decoration: the card says it all.
function DayRail({ state, number, first, last, ending }) {
  const big = String(number).length > 1;
  const color = state === "today" ? THEME.onGold : state === "done" ? withAlpha(THEME.teal, 0.6) : state === "past" ? THEME.inkMuted : THEME.ink;
  // the line runs from the middle of this number to the middle of the next one (or stops at the last number)
  const line = [styles.railLine, { top: first ? RAIL_NODE / 2 : 0 }, last && !ending ? { height: first ? 0 : RAIL_NODE / 2 } : { bottom: -DAY_GAP }];
  return (
    <View style={styles.rail} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {first && last && !ending ? null : <View style={[line, state === "done" && { backgroundColor: withAlpha(THEME.teal, 0.4) }]} />}
      <View style={[styles.railNode, state === "today" && styles.railNodeToday]}>
        <Text style={[styles.railNumber, big && styles.railNumberBig, state === "today" && styles.railNumberToday, { color }]}>{number}</Text>
      </View>
    </View>
  );
}

// A day as a ticket: its title, date and what it holds on the left; the options on the stub, behind the perforation.
function DayTicket({ day, index, date, state, isPark, trip, first, last, ending, onPress, onMenu, onLive }) {
  const count = day.activities.length;
  const kinds = new Set(day.activities.map((a) => a.type));
  const note = state === "today" ? ", aujourd'hui" : state === "done" ? ", fait" : "";
  return (
    <View style={styles.dayRow}>
      <DayRail state={state} number={index + 1} first={first} last={last} ending={ending} />
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Jour ${index + 1}, ${day.title}${date ? ", " + formatDayLabel(date) : ""}${note}, ${count} étape${count !== 1 ? "s" : ""}`}
        style={({ pressed }) => [styles.dayTicket, round("lg"), state === "today" && styles.dayTicketToday, pressed && { backgroundColor: THEME.pressed, transform: [{ scale: 0.985 }] }]}
      >
        <View style={styles.dayBody}>
          {state === "today" || state === "done" ? (
            <View style={styles.dayHead}>
              {state === "today" ? <Badge label="Aujourd'hui" tone="gold" solid /> : <Stamp label="Fait" tone="teal" icon="checkmark" small decorative />}
            </View>
          ) : null}
          <View style={[styles.dayText, state === "done" && styles.dayTextDone]}>
            <View style={styles.routeTitleRow}>
              <Text style={[type.heading, { flexShrink: 1 }]} numberOfLines={2}>
                {day.title}
              </Text>
              {day.dayType === "flight" && <Icon name="airplane" size={15} color={THEME.blue} />}
              {day.dayType === "park" && <Icon name="sparkles" size={15} color={THEME.pink} />}
            </View>
            {date ? (
              <View style={styles.routeMeta}>
                <Text style={type.subhead}>{formatDayLabel(date)}</Text>
                <WeatherBadge day={day} dateISO={date} compact fallbackLocation={trip.defaultLocation} />
              </View>
            ) : null}
            <View style={styles.dayTags}>
              <Text style={[type.caption, { color: THEME.inkFaint }]}>
                {count === 0 ? "Aucune étape" : isPark ? `${day.activities.filter((a) => a.done).length}/${count} faites` : `${count} étape${count !== 1 ? "s" : ""}`}
              </Text>
              {kinds.has("hotel") ? <Text style={[type.caption, { color: THEME.stamp }]}>hôtel</Text> : null}
              {kinds.has("transport") ? <Text style={[type.caption, { color: THEME.blue }]}>transport</Text> : null}
            </View>
          </View>
          {onLive ? <Button title="Jour J" icon="play" size="sm" tone="teal" accessibilityLabel={`Suivre ${day.title} en direct`} style={styles.dayLive} onPress={onLive} /> : null}
        </View>
        {onMenu ? (
          <View style={styles.dayStub}>
            <View style={styles.perfDots} pointerEvents="none">
              {Array.from({ length: 9 }).map((_, i) => (
                <View key={i} style={styles.perfDot} />
              ))}
            </View>
            <IconButton icon="ellipsis-horizontal" label={`Options de ${day.title}`} onPress={onMenu} size={20} />
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

function DaysTab({ trip, navigation, onChange, onOpenTab, onShiftDates, onDuplicateDay, onMoveDay, onAddDay, searchQuery, gridView, onSearchChange, onToggleGrid }) {
  const isPark = trip.tripType === "park";
  const [menuDay, setMenuDay] = useState(null); // { day, index } while the day menu sheet is open
  const [menuOpen, setMenuOpen] = useState(false); // the "Ce voyage" actions
  const [bookingsOpen, setBookingsOpen] = useState(false); // the list of steps to book
  const [countryOpen, setCountryOpen] = useState(false); // la fiche pays
  const [searchOpen, setSearchOpen] = useState(false);

  // "Partager": as text for a message, or as a file the companion imports in their own app.
  async function sendTripFile(withDocuments) {
    try {
      await exportTripFile(trip, { withDocuments });
    } catch (e) {
      Alert.alert("Envoi impossible", "Le fichier n'a pas pu être créé. Réessayez.");
    }
  }
  function chooseDocuments() {
    const count = (trip.documents || []).length;
    const photos = (trip.souvenirs || []).length;
    if (!count && !photos) return sendTripFile(false);
    const parts = [count ? `${count} document${count > 1 ? "s" : ""} (photos de billets, réservations…)` : null, photos ? `${photos} photo${photos > 1 ? "s" : ""} souvenir${photos > 1 ? "s" : ""}` : null].filter(Boolean);
    Alert.alert("Joindre les documents ?", `${parts.join(" et ")}. Ne les envoyez qu'à des personnes de confiance.`, [
      { text: "Avec les documents", onPress: () => sendTripFile(true) },
      { text: "Sans", onPress: () => sendTripFile(false) },
      { text: "Annuler", style: "cancel" },
    ]);
  }
  function shareTrip() {
    Alert.alert(`Partager « ${trip.name} »`, "En texte pour un message, ou en fichier à importer dans l'application (budget inclus, sans la fiche d'urgence).", [
      { text: "Texte", onPress: () => shareTripAsText(trip) },
      { text: "Fichier", onPress: chooseDocuments },
      { text: "Annuler", style: "cancel" },
    ]);
  }

  const q = (searchQuery || "").trim().toLowerCase();
  const today = isoToday();
  const bookings = pendingBookings(trip, today);
  const country = detectCountry(trip);
  const onAddBooking = () => navigation.navigate("ImportConfirmation", { tripId: trip.id });
  // The map has something to show once a step or an idea has a position.
  // The map opens as soon as there is something to put on it: a step or an idea, located or not (the map finds the positions).
  const hasMap = !isPark && (trip.days.some((d) => d.activities.length > 0) || (trip.ideas || []).length > 0);
  const canSearch = !isPark && trip.days.length >= 6;
  const showSearch = canSearch && (searchOpen || !!searchQuery);

  return (
    <TripScroll contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <View style={styles.toolbar}>
        <Txt variant="subhead" style={styles.toolbarCount}>
          {trip.days.length ? `${trip.days.length} jour${trip.days.length !== 1 ? "s" : ""}` : ""}
        </Txt>
        {canSearch && (
          <IconButton
            icon={showSearch ? "close" : "search"}
            label={showSearch ? "Fermer la recherche" : "Rechercher un jour ou une étape"}
            filled
            size={20}
            onPress={() => {
              if (showSearch) onSearchChange("");
              setSearchOpen(!showSearch);
            }}
          />
        )}
        {!isPark && (
          <IconButton
            icon={gridView ? "list-outline" : "grid-outline"}
            label={gridView ? "Afficher les jours en liste" : "Afficher les jours en grille"}
            filled
            size={20}
            onPress={onToggleGrid}
          />
        )}
        <IconButton icon="ellipsis-horizontal" label="Plus d'actions pour ce voyage" filled size={20} onPress={() => setMenuOpen(true)} />
      </View>

      {showSearch && (
        <Field
          placeholder="Rechercher un jour, une étape…"
          value={searchQuery}
          onChangeText={onSearchChange}
          style={{ marginBottom: space.md }}
          accessibilityLabel="Rechercher"
          autoFocus
          left={<Icon name="search" size={18} color={THEME.inkFaint} style={{ marginRight: space.sm }} />}
          right={
            searchQuery ? (
              <Pressable onPress={() => onSearchChange("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Effacer la recherche">
                <Icon name="close-circle" size={18} color={THEME.inkFaint} />
              </Pressable>
            ) : null
          }
        />
      )}

      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Ce voyage"
        actions={[
          { icon: "calendar-outline", title: "Décaler les dates", subtitle: "Tout le voyage, d'un nombre de jours", onPress: onShiftDates },
          { icon: "document-text-outline", title: "Importer un script", subtitle: "Prix, hôtels et étapes d'un programme collé", onPress: () => navigation.navigate("ImportScript", { tripId: trip.id }) },
          { icon: "mail-outline", title: "Ajouter une réservation", subtitle: "Mail, capture ou PDF : vol, train, bus, hôtel…", onPress: onAddBooking },
          { icon: "globe-outline", title: "Fiche pays", subtitle: country ? `${country.name} : monnaie, prises, urgences…` : "Monnaie, prises, urgences, décalage horaire", onPress: () => setCountryOpen(true) },
          { icon: "images-outline", title: "Bilan et souvenirs", subtitle: "Ce qui a été fait, le budget, les photos", onPress: () => navigation.navigate("TripRecap", { tripId: trip.id }) },
          { icon: "share-outline", title: "Partager", subtitle: "En texte, ou en fichier à importer", onPress: shareTrip },
          { icon: "download-outline", title: "Exporter vers un calendrier", subtitle: "Fichier .ics", onPress: () => shareTripAsICS(trip) },
          !isPark && { icon: "partly-sunny-outline", title: "Réorganiser selon la météo", subtitle: "Déplacer les sorties en extérieur", onPress: () => navigation.navigate("WeatherReorg", { tripId: trip.id }) },
          hasMap && { icon: "map-outline", title: "Voir sur la carte", onPress: () => navigation.navigate("TripMap", { tripId: trip.id }) },
        ]}
      />

      {!isPark && !q && tripStatus(trip, today) === "current" ? (() => {
        const plan = todayPlan(trip, today, new Date());
        return plan ? <TodayCard plan={plan} onPress={() => navigation.navigate("Today", { tripId: trip.id })} /> : null;
      })() : null}

      {!q && bookings.length > 0 ? <BookingsCard items={bookings} onPress={() => setBookingsOpen(true)} /> : null}

      <CountrySheet
        visible={countryOpen}
        trip={trip}
        country={country}
        onClose={() => setCountryOpen(false)}
        onPick={async (key) => {
          await updateTripSettings(trip.id, { country: key });
          if (onChange) onChange();
        }}
        onOpenPhrases={() => {
          setCountryOpen(false);
          if (onOpenTab) onOpenTab("phrases");
        }}
      />

      <BookingsSheet
        visible={bookingsOpen}
        items={bookings}
        onClose={() => setBookingsOpen(false)}
        onOpen={(it) => {
          setBookingsOpen(false);
          navigation.navigate("DayDetail", { tripId: trip.id, dayId: it.dayId });
        }}
        onBooked={async (it) => {
          await editActivity(trip.id, it.dayId, it.step.id, { booking: "done", bookBy: null });
          if (onChange) onChange();
        }}
      />

      {!isPark && !q && tripStatus(trip, today) === "past" ? <RecapCard trip={trip} onPress={() => navigation.navigate("TripRecap", { tripId: trip.id })} /> : null}

      {(() => {
        const filtered = trip.days
          .map((day, index) => ({ day, index }))
          .filter(({ day, index }) => {
            if (!q) return true;
            const date = resolveDayDate(trip, day, index);
            const dateLabel = date ? formatDateLabel(date) : "";
            const activityMatch = day.activities.some((a) => a.title.toLowerCase().includes(q));
            return day.title.toLowerCase().includes(q) || dateLabel.toLowerCase().includes(q) || activityMatch;
          });

        if (filtered.length === 0) {
          if (!q) {
            return (
              <EmptyState
                icon="calendar-outline"
                tone="gold"
                title="Aucun jour pour l'instant"
                action={{ label: "Ajouter un jour", icon: "add", onPress: onAddDay }}
              />
            );
          }
          return <EmptyState icon="search-outline" title="Aucun résultat" text={`Aucun jour ne correspond à « ${searchQuery} ».`} />;
        }

        function openDayMenu(day, index) {
          setMenuDay({ day, index });
        }

        if (gridView) {
          return (
            <View style={styles.dayGrid}>
              {filtered.map(({ day, index }) => {
                const date = resolveDayDate(trip, day, index);
                const state = dayState(day, date, today);
                return (
                  <Pressable
                    key={day.id}
                    onPress={() => navigation.navigate("DayDetail", { tripId: trip.id, dayId: day.id })}
                    accessibilityRole="button"
                    accessibilityLabel={`${day.title}, ${day.activities.length} étapes`}
                    style={({ pressed }) => [styles.tile, round("lg"), state === "today" && styles.tileToday, pressed && { opacity: 0.8 }]}
                  >
                    <View style={styles.tileTop}>
                      <DayNode state={state} number={index + 1} />
                      {day.dayType === "flight" && <Icon name="airplane" size={15} color={THEME.blue} />}
                      {day.dayType === "park" && <Icon name="sparkles" size={15} color={THEME.pink} />}
                    </View>
                    <Text style={[type.label, { marginTop: space.md }]} numberOfLines={2}>
                      {day.title}
                    </Text>
                    {date ? <Text style={[type.caption, { marginTop: 2 }]}>{formatDayLabel(date)}</Text> : null}
                    <Text style={[type.numeralSmall, { marginTop: space.sm, color: THEME.inkFaint }]}>
                      {day.activities.length} étape{day.activities.length !== 1 ? "s" : ""}
                    </Text>
                  </Pressable>
                );
              })}
              {!q && (
                <View style={styles.gridAdd}>
                  <Button title="Ajouter un jour" icon="add" variant="secondary" full onPress={onAddDay} />
                  {!isPark && <Button title="Ajouter une réservation" icon="mail-outline" variant="secondary" full onPress={onAddBooking} style={styles.bookAdd} />}
                </View>
              )}
            </View>
          );
        }

        return (
          <View style={styles.dayList}>
            {filtered.map(({ day, index }, i) => {
              const date = resolveDayDate(trip, day, index);
              const state = dayState(day, date, today);
              return (
                <DayTicket
                  key={day.id}
                  day={day}
                  index={index}
                  date={date}
                  state={state}
                  first={i === 0}
                  last={i === filtered.length - 1}
                  ending={!q}
                  isPark={isPark}
                  trip={trip}
                  onPress={() => navigation.navigate("DayDetail", { tripId: trip.id, dayId: day.id })}
                  onMenu={!q ? () => openDayMenu(day, index) : null}
                  onLive={isPark && state === "today" && day.activities.length > 0 ? () => navigation.navigate("ParkLive", { tripId: trip.id, dayId: day.id }) : null}
                />
              );
            })}
            {!q && (
              <View style={styles.dayRow}>
                <View style={styles.rail} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <View style={[styles.railLine, { top: 0, height: ADD_H / 2 }]} />
                  <View style={styles.railAdd}>
                    <Icon name="add" size={16} color={THEME.inkFaint} />
                  </View>
                </View>
                <Pressable onPress={onAddDay} accessibilityRole="button" accessibilityLabel="Ajouter un jour" style={({ pressed }) => [styles.dayAdd, round("lg"), pressed && { backgroundColor: THEME.pressed }]}>
                  <Text style={[type.label, { color: THEME.inkMuted, fontFamily: type.body.fontFamily }]}>Ajouter un jour</Text>
                </Pressable>
              </View>
            )}
            {!q && !isPark && <Button title="Ajouter une réservation" icon="mail-outline" variant="secondary" full onPress={onAddBooking} style={styles.bookAdd} />}
          </View>
        );
      })()}

      <Sheet visible={!!menuDay} onClose={() => setMenuDay(null)} title={menuDay ? menuDay.day.title : ""}>
        {menuDay && (
          <Group style={{ marginBottom: space.md }}>
            {isPark ? (
              <Row
                icon="sparkles-outline"
                title="Préparer le parcours"
                onPress={() => {
                  const d = menuDay.day;
                  setMenuDay(null);
                  navigation.navigate("ParkPlan", { tripId: trip.id, dayId: d.id });
                }}
              />
            ) : null}
            {isPark && menuDay.day.activities.length > 0 ? (
              <Row
                icon="play"
                title="Jour J"
                onPress={() => {
                  const d = menuDay.day;
                  setMenuDay(null);
                  navigation.navigate("ParkLive", { tripId: trip.id, dayId: d.id });
                }}
              />
            ) : null}
            {menuDay.index > 0 && (
              <Row
                icon="arrow-up-outline"
                title="Monter"
                onPress={() => {
                  const d = menuDay.day;
                  setMenuDay(null);
                  onMoveDay(d.id, "up");
                }}
              />
            )}
            {menuDay.index < trip.days.length - 1 && (
              <Row
                icon="arrow-down-outline"
                title="Descendre"
                onPress={() => {
                  const d = menuDay.day;
                  setMenuDay(null);
                  onMoveDay(d.id, "down");
                }}
              />
            )}
            <Row
              icon="copy-outline"
              title="Dupliquer"
              onPress={() => {
                const d = menuDay.day;
                setMenuDay(null);
                onDuplicateDay(d.id);
              }}
            />
          </Group>
        )}
      </Sheet>
    </TripScroll>
  );
}

const BUDGET_CATEGORIES = [
  { key: "transport", label: "Transport", icon: "airplane", tone: "blue" },
  { key: "hotel", label: "Hébergement", icon: "bed", tone: "stamp" },
  { key: "repas", label: "Repas", icon: "restaurant", tone: "gold" },
  { key: "other", label: "Autres dépenses", icon: "pricetag", tone: "pink" },
];

function BudgetTab({ trip, onChange }) {
  const [converterOpen, setConverterOpen] = useState(false);
  const [expenseSheet, setExpenseSheet] = useState(null); // null | { expense } (expense null = a new one)
  const [goalOpen, setGoalOpen] = useState(false); // the budget for the whole trip
  const total = tripActivityTotal(trip);
  const spent = expensesTotal(trip);
  const spentBy = expensesByCategory(trip);
  const expenses = [...(trip.expenses || [])].reverse().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const showConverter = trip.currency && trip.homeCurrency && trip.currency !== trip.homeCurrency;
  const values = {
    transport: transportTotal(trip),
    hotel: accommodationTotal(trip),
    repas: repasTotal(trip),
    other: otherExpensesTotal(trip),
  };
  const categories = BUDGET_CATEGORIES.map((c) => ({ ...c, value: values[c.key], color: TONES[c.tone].fg }));

  const inHome = trip.homeCurrency !== trip.currency;
  const homeCode = trip.homeCurrency || trip.currency || "EUR";
  const goal = budgetOverview(trip, isoToday());

  return (
    <TripScroll contentContainerStyle={styles.scrollContent}>
      {total > 0 && <DonutChart segments={categories.map((c) => ({ value: c.value, color: c.color }))} />}
      <View style={styles.totalBlock}>
        <Txt variant="subhead">Total estimé</Txt>
        <Text style={styles.totalValue}>{formatMoney(total, trip.currency)}</Text>
        {inHome && <Text style={type.numeralSmall}>≈ {formatMoney(convertAmount(total, trip.rate), trip.homeCurrency)}</Text>}
        {showConverter && <Button title="Convertisseur rapide" icon="swap-horizontal" variant="secondary" size="sm" onPress={() => setConverterOpen(true)} style={{ marginTop: space.md }} />}
      </View>
      <BudgetGoal overview={goal} code={homeCode} onPress={() => setGoalOpen(true)} />
      {spent > 0 ? (
        <View style={styles.spentBlock} accessible accessibilityLabel={`Dépensé ${formatMoney(spent, trip.currency)} sur ${formatMoney(total, trip.currency)} prévus`}>
          <View style={styles.spentRow}>
            <Txt variant="subhead">Dépensé</Txt>
            <Text style={[type.numeral, spent > total && { color: THEME.stamp }]}>{formatMoney(spent, trip.currency)}</Text>
          </View>
          <ProgressBar value={total > 0 ? Math.min(spent / total, 1) : 1} tone={spent > total ? "stamp" : "teal"} height={6} style={{ backgroundColor: THEME.surfaceSunk }} />
          <Text style={[type.caption, spent > total && { color: THEME.stamp }]}>
            {spent > total ? `Dépassé de ${formatMoney(spent - total, trip.currency)} sur le prévu` : `Reste ${formatMoney(total - spent, trip.currency)} sur le prévu`}
          </Text>
        </View>
      ) : null}
      <Group>
        {categories.map((c) => {
          const target = trip.budgetTargets && trip.budgetTargets[c.key];
          const spentInHome = convertAmount(c.value, trip.rate);
          const overTarget = target != null && spentInHome > target;
          return (
            <Row
              key={c.key}
              icon={c.icon}
              tone={c.tone}
              title={c.label}
              right={
                <View style={styles.amountCol}>
                  <Text style={[type.numeral, overTarget && { color: THEME.stamp }]}>{formatMoney(c.value, trip.currency)}</Text>
                  {inHome && c.value > 0 ? <Text style={type.caption}>≈ {formatMoney(spentInHome, trip.homeCurrency)}</Text> : null}
                  {spentBy[c.key] > 0 ? <Text style={[type.caption, { color: THEME.teal }]}>dépensé {formatMoney(spentBy[c.key], trip.currency)}</Text> : null}
                </View>
              }
            >
              {target != null && (
                <View style={{ gap: space.sm, marginTop: space.xs }}>
                  <ProgressBar value={target > 0 ? Math.max(spentInHome / target, c.value > 0 ? 0.02 : 0) : 0} tone={overTarget ? "stamp" : c.tone} height={6} style={{ backgroundColor: THEME.surfaceSunk }} />
                  <Text style={[type.caption, overTarget && { color: THEME.stamp }]}>
                    {overTarget ? `Dépassé de ${formatMoney(Math.round(spentInHome - target), trip.homeCurrency)}` : `Reste ${formatMoney(Math.round(target - spentInHome), trip.homeCurrency)} sur ${formatMoney(target, trip.homeCurrency)}`}
                  </Text>
                </View>
              )}
            </Row>
          );
        })}
      </Group>

      <SectionTitle title="Dépenses" count={expenses.length > 0 ? expenses.length : undefined} style={styles.expensesTitle} action={expenses.length > 0 ? { label: "Ajouter", onPress: () => setExpenseSheet({ expense: null }) } : undefined} />
      {expenses.length === 0 ? (
        <View style={styles.starter}>
          <Txt variant="subhead">Notez ce que vous dépensez sur place : le total se compare au prévu.</Txt>
          <Button title="Ajouter une dépense" icon="add" variant="secondary" size="sm" style={{ alignSelf: "flex-start" }} onPress={() => setExpenseSheet({ expense: null })} />
        </View>
      ) : (
        <Group>
          {expenses.map((e) => {
            const cat = EXPENSE_CATEGORIES.find((c) => c.key === expenseCategory(e));
            return (
              <Row
                key={e.id}
                icon={cat.icon}
                tone={cat.tone}
                title={e.label}
                subtitle={[cat.label, e.date ? formatShortDate(e.date) : null].filter(Boolean).join(" · ")}
                accessibilityLabel={`${e.label}, ${formatMoney(e.amount, trip.currency)}`}
                onPress={() => setExpenseSheet({ expense: e })}
                right={
                  <View style={styles.amountCol}>
                    <Text style={type.numeral}>{formatMoney(e.amount, trip.currency)}</Text>
                    {inHome ? <Text style={type.caption}>≈ {formatMoney(convertAmount(e.amount, trip.rate), trip.homeCurrency)}</Text> : null}
                  </View>
                }
              />
            );
          })}
        </Group>
      )}

      <BudgetGoalSheet
        visible={goalOpen}
        current={goal ? goal.target : null}
        code={homeCode}
        onClose={() => setGoalOpen(false)}
        onSave={async (value) => {
          await updateTripSettings(trip.id, { budgetTotal: value });
          setGoalOpen(false);
          onChange();
        }}
      />
      <ExpenseSheet
        visible={!!expenseSheet}
        expense={expenseSheet ? expenseSheet.expense : null}
        currency={trip.currency}
        onClose={() => setExpenseSheet(null)}
        onSave={async (values) => {
          if (expenseSheet.expense) await updateExpense(trip.id, expenseSheet.expense.id, values);
          else await addExpense(trip.id, { ...values, date: isoToday() });
          setExpenseSheet(null);
          onChange();
        }}
        onDelete={async () => {
          await removeExpense(trip.id, expenseSheet.expense.id);
          setExpenseSheet(null);
          onChange();
        }}
      />
      <CurrencyConverterModal visible={converterOpen} onClose={() => setConverterOpen(false)} trip={trip} />
    </TripScroll>
  );
}

// The budget for the whole trip: what is left, and what that makes per day. Empty: one line to set it.
function BudgetGoal({ overview, code, onPress }) {
  if (!overview) {
    return (
      <Group style={{ marginBottom: space.xl }}>
        <Row icon="wallet-outline" tone="neutral" title="Définir un budget total" subtitle="Pour savoir combien dépenser par jour" chevron onPress={onPress} accessibilityLabel="Définir un budget total pour le voyage" />
      </Group>
    );
  }
  const sum = budgetSummary(overview, code);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Budget total ${formatMoney(overview.target, code)}. ${sum.spentLine}.${sum.perDayLine ? " " + sum.perDayLine + "." : ""} Modifier`}
      style={({ pressed }) => [styles.goalCard, round("lg"), pressed && { opacity: 0.85 }]}
    >
      <View style={styles.spentRow}>
        <Txt variant="subhead">Budget total</Txt>
        <Text style={type.numeral}>{formatMoney(overview.target, code)}</Text>
      </View>
      <ProgressBar value={overview.ratio} tone={overview.over ? "stamp" : "teal"} height={6} style={{ backgroundColor: THEME.surfaceSunk }} />
      <Text style={[type.name, overview.over && { color: THEME.stamp }]}>{sum.spentLine}</Text>
      {sum.perDayLine ? <Text style={type.subhead}>{sum.perDayLine}</Text> : null}
      {sum.todayLine ? <Text style={type.caption}>{sum.todayLine}</Text> : null}
      {sum.plannedLine ? <Text style={[type.caption, sum.plannedOver && { color: THEME.stamp }]}>{sum.plannedLine}</Text> : null}
    </Pressable>
  );
}

// Set, change or remove the budget total (in the person's own currency).
function BudgetGoalSheet({ visible, current, code, onClose, onSave }) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setAmount(current ? String(current).replace(".", ",") : "");
    setError("");
    setBusy(false);
  }, [visible, current]);

  async function save(value) {
    setBusy(true);
    try {
      await onSave(value);
    } catch (e) {
      setError("Échec de l'enregistrement.");
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Budget total">
      <Field
        label={`Pour tout le voyage (${code})`}
        value={amount}
        onChangeText={setAmount}
        placeholder="3000"
        keyboardType="decimal-pad"
        hint="Vols et hôtels compris. Le reste se calcule avec les dépenses que vous notez."
        error={error || undefined}
      />
      <View style={styles.sheetButtons}>
        {current ? <Button title="Supprimer" variant="secondary" tone="stamp" disabled={busy} style={{ flex: 1 }} onPress={() => save(null)} /> : <Button title="Annuler" variant="secondary" disabled={busy} style={{ flex: 1 }} onPress={onClose} />}
        <Button
          title="Enregistrer"
          loading={busy}
          style={{ flex: 1 }}
          onPress={() => {
            const value = parseBudgetInput(amount);
            if (!value) return setError("Indiquez un montant.");
            save(value);
          }}
        />
      </View>
    </Sheet>
  );
}

// Add or edit one expense: what, how much, which kind. Deleting is offered when editing.
function ExpenseSheet({ visible, expense, currency, onClose, onSave, onDelete }) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("repas");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLabel(expense ? expense.label : "");
    setAmount(expense ? String(expense.amount).replace(".", ",") : "");
    setCategory(expense ? expenseCategory(expense) : "repas");
    setError("");
    setBusy(false);
  }, [visible, expense]);

  async function save() {
    const n = parseFloat(String(amount).replace(/\s/g, "").replace(",", "."));
    if (!(n > 0)) return setError("Indiquez un montant.");
    setBusy(true);
    try {
      await onSave({ label, amount: n, category });
    } catch (e) {
      setError("Échec de l'enregistrement.");
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={expense ? "Modifier la dépense" : "Nouvelle dépense"}>
      <Field label={`Montant (${currency})`} value={amount} onChangeText={setAmount} placeholder="0" keyboardType="decimal-pad" error={error || undefined} />
      <Field label="Description (optionnel)" value={label} onChangeText={setLabel} placeholder="Ex : ramen, taxi, souvenirs" />
      <Text style={[type.caption, { marginBottom: space.sm }]}>Catégorie</Text>
      <View style={styles.categoryChips}>
        {EXPENSE_CATEGORIES.map((c) => (
          <Chip key={c.key} label={c.label} icon={c.icon} tone={c.tone} selected={category === c.key} onPress={() => setCategory(c.key)} />
        ))}
      </View>
      <View style={styles.sheetButtons}>
        {expense ? <Button title="Supprimer" variant="secondary" tone="stamp" disabled={busy} style={{ flex: 1 }} onPress={onDelete} /> : <Button title="Annuler" variant="secondary" disabled={busy} style={{ flex: 1 }} onPress={onClose} />}
        <Button title="Enregistrer" loading={busy} style={{ flex: 1 }} onPress={save} />
      </View>
    </Sheet>
  );
}

function CurrencyConverterModal({ visible, onClose, trip }) {
  const [localVal, setLocalVal] = useState("");
  const [homeVal, setHomeVal] = useState("");

  function onLocalChange(v) {
    setLocalVal(v);
    const n = parseFloat(v.replace(",", "."));
    setHomeVal(!isNaN(n) ? String(Math.round(convertAmount(n, trip.rate) * 100) / 100) : "");
  }

  function onHomeChange(v) {
    setHomeVal(v);
    const n = parseFloat(v.replace(",", "."));
    setLocalVal(!isNaN(n) && trip.rate ? String(Math.round((n / trip.rate) * 100) / 100) : "");
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Convertisseur rapide">
      <Field label={`En ${trip.currency}`} value={localVal} onChangeText={onLocalChange} placeholder="0" keyboardType="decimal-pad" />
      <Field label={`En ${trip.homeCurrency}`} value={homeVal} onChangeText={onHomeChange} placeholder="0" keyboardType="decimal-pad" />
      <Button title="Fermer" variant="secondary" full onPress={onClose} />
    </Sheet>
  );
}

function ChecklistsTab({ trip, onChange }) {
  return (
    <TripScroll contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <ChecklistSection title="Bagages" trip={trip} listKey="packingList" onChange={onChange} />
      <ChecklistSection title="Avant le départ" trip={trip} listKey="departureChecklist" onChange={onChange} />
    </TripScroll>
  );
}

// What most trips need: offered once, when a list is still empty.
const STARTER_ITEMS = {
  packingList: ["Pièce d'identité ou passeport", "Chargeur et câble du téléphone", "Adaptateur de prise", "Trousse de toilette", "Médicaments personnels", "Vêtements adaptés à la météo", "Carte bancaire et un peu d'espèces"],
  departureChecklist: ["Vérifier les dates de validité des papiers", "Télécharger ou imprimer les billets", "Confirmer les réservations (hébergement, transport)", "Prévenir la banque du voyage", "Vérifier l'assurance voyage", "Mettre les appareils à charger"],
};

function ChecklistSection({ title, trip, listKey, onChange }) {
  const [newLabel, setNewLabel] = useState("");
  const items = trip[listKey] || [];
  const doneCount = items.filter((i) => i.checked).length;

  function animateThenChange() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onChange();
  }

  async function addItem() {
    if (!newLabel.trim()) return;
    await addChecklistItem(trip.id, listKey, newLabel);
    setNewLabel("");
    animateThenChange();
  }

  async function addStarter() {
    await addChecklistItems(trip.id, listKey, STARTER_ITEMS[listKey] || []);
    animateThenChange();
  }

  return (
    <View style={styles.checklistSection}>
      <SectionTitle title={title} count={items.length > 0 ? `${doneCount}/${items.length}` : null} />
      {items.length === 0 && STARTER_ITEMS[listKey] && (
        <View style={styles.starter}>
          <Txt variant="subhead">Rien ici pour l'instant.</Txt>
          <Button title="Ajouter les essentiels" icon="list-outline" variant="secondary" size="sm" style={{ alignSelf: "flex-start" }} onPress={addStarter} />
        </View>
      )}
      {items.length > 0 && (
        <Group style={{ marginBottom: space.md }}>
          {items.map((item) => (
            <Row
              key={item.id}
              lead={<Icon name={item.checked ? "checkmark-circle" : "ellipse-outline"} size={24} color={item.checked ? THEME.teal : THEME.inkFaint} />}
              title={<Text style={[type.body, item.checked && styles.checkedLabel]}>{item.label}</Text>}
              accessibilityLabel={`${item.label}, ${item.checked ? "fait" : "à faire"}`}
              onPress={async () => {
                await toggleChecklistItem(trip.id, listKey, item.id);
                animateThenChange();
              }}
              right={
                <IconButton
                  icon="close"
                  label={`Supprimer ${item.label}`}
                  size={18}
                  onPress={async () => {
                    await removeChecklistItem(trip.id, listKey, item.id);
                    animateThenChange();
                  }}
                />
              }
              style={{ minHeight: 52, paddingVertical: space.xs, paddingRight: space.xs }}
            />
          ))}
        </Group>
      )}
      <View style={styles.addItemRow}>
        <Field
          placeholder="Ajouter un élément…"
          value={newLabel}
          onChangeText={setNewLabel}
          onSubmitEditing={addItem}
          returnKeyType="done"
          style={{ flex: 1, marginBottom: 0 }}
          accessibilityLabel={`Ajouter à ${title}`}
        />
        <IconButton icon="add" label="Ajouter" tone="gold" filled onPress={addItem} style={styles.addItemButton} />
      </View>
    </View>
  );
}

function DocumentsTab({ trip, onChange, navigation, incomingScan, onConsumeIncomingScan, incomingAction, onConsumeIncomingAction }) {
  const [pendingUri, setPendingUri] = useState(null);
  const [pendingScannedCode, setPendingScannedCode] = useState(null);
  const [pendingKind, setPendingKind] = useState("image"); // "image" or "pdf"
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [viewingDoc, setViewingDoc] = useState(null);
  const [forDayId, setForDayId] = useState(null); // the flight or train day a ticket is being added for
  const [chosenCategory, setChosenCategory] = useState(null); // set once the person picks a drawer; until then it follows the best guess
  const [openCats, setOpenCats] = useState({}); // drawer key → opened or closed by hand
  const [docMenu, setDocMenu] = useState(null);
  const docs = trip.documents || [];
  const byCategory = {};
  for (const c of DOCUMENT_CATEGORIES) byCategory[c.key] = [];
  for (const d of docs) byCategory[documentCategory(d)].push(d);
  const category = chosenCategory || suggestDocumentCategory(trip, { title, scannedCode: pendingScannedCode, dayId: forDayId });
  // A drawer with documents is open; with none at all, the first one is, to say what goes there.
  const isOpen = (key) => (openCats[key] !== undefined ? openCats[key] : byCategory[key].length > 0 || (docs.length === 0 && key === DOCUMENT_CATEGORIES[0].key));
  const openCategory = (key) => setOpenCats((o) => ({ ...o, [key]: true }));

  useEffect(() => {
    if (incomingScan) {
      setPendingUri(incomingScan.uri);
      setPendingScannedCode(incomingScan.scannedCode);
      setForDayId(incomingScan.dayId || null);
      const boardingPass = incomingScan.scannedCode ? decodeBoardingPass(incomingScan.scannedCode) : null;
      const forDay = incomingScan.dayId ? trip.days.find((d) => d.id === incomingScan.dayId) : null;
      if (boardingPass && forDay) {
        // scanned from a day: no date to guess, it is that day's ticket
        setTitle(`Vol ${boardingPass.flightNumber} — ${boardingPass.origin} → ${boardingPass.destination}`);
        Alert.alert("Carte d'embarquement détectée", `Vol ${boardingPass.flightNumber} (${boardingPass.origin} → ${boardingPass.destination}). Remplir le trajet de « ${forDay.title} » avec ce billet ?`, [
          { text: "Non merci", style: "cancel" },
          {
            text: "Oui",
            onPress: async () => {
              await setDayType(trip.id, forDay.id, "flight", {
                origin: boardingPass.origin,
                destination: boardingPass.destination,
                flightNumber: boardingPass.flightNumber,
                seat: boardingPass.seat,
              });
              onChange();
            },
          },
        ]);
      } else if (boardingPass) {
        setTitle(`Vol ${boardingPass.flightNumber} — ${boardingPass.origin} → ${boardingPass.destination}`);
        const flightDateISO = resolveJulianDate(boardingPass.julianDay, trip.startDate);
        const matchIndex = trip.days.findIndex((d, i) => resolveDayDate(trip, d, i) === flightDateISO);
        if (matchIndex !== -1) {
          const matchDay = trip.days[matchIndex];
          Alert.alert(
            "Carte d'embarquement détectée",
            `Vol ${boardingPass.flightNumber} (${boardingPass.origin} → ${boardingPass.destination}) le ${formatDateLabel(flightDateISO)}. Marquer "${matchDay.title}" comme jour de vol ?`,
            [
              { text: "Non merci", style: "cancel" },
              {
                text: "Oui",
                onPress: async () => {
                  await setDayType(trip.id, matchDay.id, "flight", {
                    origin: boardingPass.origin,
                    destination: boardingPass.destination,
                    flightNumber: boardingPass.flightNumber,
                    seat: boardingPass.seat,
                  });
                  onChange();
                },
              },
            ]
          );
        }
      } else {
        setTitle(incomingScan.scannedCode ? "Billet scanné" : "Photo scannée");
      }
      onConsumeIncomingScan();
    }
  }, [incomingScan]);

  // Sent from a day: look at one of its tickets, or add one from the gallery.
  useEffect(() => {
    if (!incomingAction) return;
    if (incomingAction.viewDocId) {
      const doc = docs.find((d) => d.id === incomingAction.viewDocId);
      if (doc) openDoc(doc);
    } else if (incomingAction.addFrom) {
      setForDayId(incomingAction.dayId || null);
      setTimeout(() => pick(incomingAction.addFrom), 350); // let the screen finish opening
    }
    onConsumeIncomingAction();
  }, [incomingAction]);

  // A photo opens in the viewer; a PDF goes to the phone's own readers.
  function openDoc(doc) {
    if (!isPdfDoc(doc)) return setViewingDoc(doc);
    openDocumentFile(doc).catch(() => setError("Impossible d'ouvrir ce PDF depuis l'application."));
  }

  function closePending() {
    setPendingUri(null);
    setPendingKind("image");
    setPendingScannedCode(null);
    setForDayId(null);
    setChosenCategory(null);
  }

  const [addMenuOpen, setAddMenuOpen] = useState(false);

  function choosePhoto() {
    setError("");
    setAddMenuOpen(true);
  }

  async function pickPdf() {
    try {
      const file = await pickPdfFile();
      if (!file) return setForDayId(null);
      setPendingKind("pdf");
      setTitle(file.title);
      setPendingUri(file.uri);
    } catch (e) {
      setForDayId(null);
      setError("Échec de la sélection du PDF.");
    }
  }

  async function pick(source) {
    try {
      const uri = await pickImage(source);
      if (uri) {
        setPendingKind("image");
        setPendingUri(uri);
      } else setForDayId(null);
    } catch (e) {
      setForDayId(null);
      setError(e && e.code === "PERMISSION_DENIED" ? "Autorisation refusée. Activez l'accès à la caméra/aux photos dans les réglages du téléphone." : "Échec de la sélection.");
    }
  }

  async function confirmAdd() {
    setBusy(true);
    try {
      await addDocument(trip.id, { title, category, tempUri: pendingUri, scannedCode: pendingScannedCode, dayId: forDayId, kind: pendingKind });
      const backToDay = forDayId;
      openCategory(category);
      closePending();
      setTitle("");
      onChange();
      if (backToDay) navigation.navigate("DayDetail", { tripId: trip.id, dayId: backToDay });
    } catch (e) {
      setError("Échec de l'enregistrement du document.");
    } finally {
      setBusy(false);
    }
  }

  // A photo of a ticket cannot be brought back: ask first
  function onRemove(doc) {
    Alert.alert("Supprimer ce document ?", `« ${doc.title} » sera retiré du voyage. Cette action est définitive.`, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          await removeDocument(trip.id, doc.id);
          onChange();
        },
      },
    ]);
  }

  return (
    <TripScroll contentContainerStyle={styles.scrollContent}>
      <View style={styles.toolbar}>
        <Text style={[type.subhead, styles.toolbarCount]}>{docs.length === 0 ? "Billets, réservations, codes Wi-Fi…" : `${docs.length} document${docs.length !== 1 ? "s" : ""}`}</Text>
        <Button title="Ajouter" icon="add" size="sm" variant="secondary" accessibilityLabel="Ajouter un document" onPress={choosePhoto} />
      </View>
      {error ? <Text style={[type.caption, { color: THEME.stamp, marginBottom: space.md }]}>{error}</Text> : null}

      <View style={styles.docDrawers}>
        {DOCUMENT_CATEGORIES.map((c) => {
          const list = byCategory[c.key];
          const open = isOpen(c.key);
          const countText = list.length === 0 ? "Aucun document" : `${list.length} document${list.length !== 1 ? "s" : ""}`;
          return (
            <Group key={c.key}>
              <Row
                icon={c.icon}
                tone={c.tone}
                title={c.label}
                subtitle={countText}
                accessibilityLabel={`${c.label}, ${countText}, ${open ? "ouvert" : "fermé"}`}
                onPress={() => setOpenCats((o) => ({ ...o, [c.key]: !open }))}
                right={<Icon name={open ? "chevron-up" : "chevron-down"} size={18} color={THEME.inkFaint} />}
              />
              {open && list.length === 0 ? <Row subtitle="Aucun document pour l'instant." /> : null}
              {open
                ? list.map((doc) => (
                    <Row
                      key={doc.id}
                      lead={isPdfDoc(doc) ? <Thumb icon="document-text" tone="stamp" size={44} /> : <Thumb uri={doc.uri} icon="document-text" size={44} />}
                      title={doc.title}
                      subtitle={[isPdfDoc(doc) ? "PDF" : null, doc.dayId && trip.days.find((d) => d.id === doc.dayId) ? trip.days.find((d) => d.id === doc.dayId).title : null].filter(Boolean).join(" · ") || undefined}
                      accessibilityLabel={isPdfDoc(doc) ? `${doc.title}, PDF` : doc.title}
                      onPress={() => openDoc(doc)}
                      right={<IconButton icon="ellipsis-horizontal" label={`Options de ${doc.title}`} size={20} onPress={() => setDocMenu(doc)} />}
                      style={{ paddingRight: space.xs }}
                    />
                  ))
                : null}
            </Group>
          );
        })}
      </View>

      <ActionSheet
        visible={!!docMenu}
        onClose={() => setDocMenu(null)}
        title={docMenu ? docMenu.title : ""}
        actions={
          docMenu
            ? [
                ...DOCUMENT_CATEGORIES.filter((c) => c.key !== documentCategory(docMenu)).map((c) => ({
                  icon: c.icon,
                  title: `Classer dans « ${c.label} »`,
                  onPress: async () => {
                    await setDocumentCategory(trip.id, docMenu.id, c.key);
                    openCategory(c.key);
                    onChange();
                  },
                })),
                { icon: "trash-outline", tone: "stamp", title: "Supprimer", onPress: () => onRemove(docMenu) },
              ]
            : []
        }
      />

      <Sheet visible={addMenuOpen} onClose={() => setAddMenuOpen(false)} title="Ajouter un document">
        <Group style={{ marginBottom: space.md }}>
          <Row
            icon="qr-code-outline"
            tone="teal"
            title="Scanner un billet ou un code-barres"
            chevron
            onPress={() => {
              setAddMenuOpen(false);
              navigation.navigate("TicketScanner", { tripId: trip.id });
            }}
          />
          <Row
            icon="camera-outline"
            tone="teal"
            title="Prendre une photo"
            chevron
            onPress={() => {
              setAddMenuOpen(false);
              setTimeout(() => pick("camera"), 350); // let the sheet finish closing (iOS)
            }}
          />
          <Row
            icon="images-outline"
            tone="teal"
            title="Depuis la galerie"
            chevron
            onPress={() => {
              setAddMenuOpen(false);
              setTimeout(() => pick("library"), 350);
            }}
          />
          <Row
            icon="document-attach-outline"
            tone="teal"
            title="Importer un PDF"
            subtitle="Réservation, billet électronique…"
            chevron
            onPress={() => {
              setAddMenuOpen(false);
              setTimeout(pickPdf, 350);
            }}
          />
        </Group>
      </Sheet>

      <Modal visible={!!viewingDoc} transparent animationType="fade" onRequestClose={() => setViewingDoc(null)}>
        <Pressable style={styles.viewerOverlay} onPress={() => setViewingDoc(null)} accessibilityLabel="Fermer le document">
          {viewingDoc && <Image source={{ uri: viewingDoc.uri }} style={styles.viewerImage} resizeMode="contain" />}
          {viewingDoc?.scannedCode && (
            <View style={[styles.scannedCodeBadge, { position: "absolute", bottom: 90, left: 20, right: 20 }]}>
              <Icon name="qr-code-outline" size={14} color={THEME.teal} />
              <Text style={styles.scannedCodeText} numberOfLines={1}>
                {viewingDoc.scannedCode}
              </Text>
            </View>
          )}
          <View style={styles.viewerTitleBar}>
            <Text style={[type.label, { flex: 1 }]}>{viewingDoc?.title}</Text>
            <IconButton icon="close" label="Fermer" size={24} onPress={() => setViewingDoc(null)} tone="neutral" />
          </View>
        </Pressable>
      </Modal>

      <Sheet visible={!!pendingUri} onClose={closePending} title="Nouveau document">
        {pendingUri && pendingKind === "pdf" ? (
          <View style={[styles.pdfPreview, round("md")]}>
            <Icon name="document-text" size={40} color={THEME.stamp} />
            <Text style={type.label}>PDF</Text>
          </View>
        ) : pendingUri ? (
          <Image source={{ uri: pendingUri }} style={[styles.previewImage, round("md")]} />
        ) : null}
        {pendingScannedCode && (
          <View style={styles.scannedCodeBadge}>
            <Icon name="qr-code-outline" size={14} color={THEME.teal} />
            <Text style={styles.scannedCodeText} numberOfLines={1}>
              {pendingScannedCode}
            </Text>
          </View>
        )}
        <Field label="Titre" value={title} onChangeText={setTitle} placeholder="Ex : voucher hôtel" style={{ marginTop: space.lg }} />
        <Text style={[type.caption, { marginBottom: space.sm }]}>Rubrique</Text>
        <View style={styles.categoryChips}>
          {DOCUMENT_CATEGORIES.map((c) => (
            <Chip key={c.key} label={c.label} icon={c.icon} tone={c.tone} selected={category === c.key} onPress={() => setChosenCategory(c.key)} />
          ))}
        </View>
        {error ? <Text style={[type.caption, { color: THEME.stamp, marginBottom: space.md }]}>{error}</Text> : null}
        <View style={styles.sheetButtons}>
          <Button
            title="Annuler"
            variant="secondary"
            disabled={busy}
            style={{ flex: 1 }}
            onPress={closePending}
          />
          <Button title="Enregistrer" loading={busy} style={{ flex: 1 }} onPress={confirmAdd} />
        </View>
      </Sheet>
    </TripScroll>
  );
}

function PhrasesTab({ trip, navigation, onChange, country }) {
  const [phrase, setPhrase] = useState("");
  const [translation, setTranslation] = useState("");
  const [packOpen, setPackOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const phrases = trip.phrases || [];
  // the language of the country of the trip comes first in the list
  const suggested = country && country.phrases ? country.phrases : null;
  const languages = [...PHRASE_LANGUAGES].sort((a, b) => (a.key === suggested ? -1 : 0) - (b.key === suggested ? -1 : 0));

  async function add() {
    if (!phrase.trim() || !translation.trim()) return;
    await addPhrase(trip.id, phrase, translation);
    setPhrase("");
    setTranslation("");
    onChange();
  }

  async function addPack(lang) {
    setPackOpen(false);
    const n = await addPhrases(trip.id, packFor(lang.key));
    setNotice(n > 0 ? `${n} phrase${n > 1 ? "s" : ""} ajoutée${n > 1 ? "s" : ""} (${lang.label.toLowerCase()})` : "Ces phrases sont déjà dans la liste");
    onChange();
  }

  const show = (index) => navigation.navigate("ShowPhrase", { phrases: phrases.map((p) => ({ phrase: p.phrase, translation: p.translation, reading: p.reading || null })), index });

  return (
    <TripScroll contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      {phrases.length === 0 && (
        <EmptyState
          icon="chatbubbles-outline"
          title="Aucune phrase"
          text="Les phrases qui sauvent : « où sont les toilettes ? », « c'est trop épicé »…"
          action={{ label: "Ajouter les phrases de base", icon: "sparkles-outline", onPress: () => setPackOpen(true) }}
        />
      )}
      {phrases.length > 0 && (
        <Group style={{ marginBottom: space.md }}>
          {phrases.map((p, i) => (
            <Row
              key={p.id}
              title={p.phrase}
              subtitle={<Text style={[type.subhead, { color: THEME.teal }]}>{p.translation}</Text>}
              accessibilityLabel={`${p.phrase}, ${p.translation}. Afficher en grand`}
              onPress={() => show(i)}
              right={
                <IconButton
                  icon="trash-outline"
                  label={`Supprimer ${p.phrase}`}
                  size={18}
                  onPress={async () => {
                    await removePhrase(trip.id, p.id);
                    onChange();
                  }}
                />
              }
              style={{ paddingRight: space.xs }}
            >
              {p.reading ? <Text style={type.caption}>{p.reading}</Text> : null}
            </Row>
          ))}
        </Group>
      )}
      {phrases.length > 0 ? <Text style={[type.caption, { marginBottom: space.xl }]}>Touchez une phrase pour l'afficher en grand.</Text> : null}
      {notice ? <Text style={[type.caption, { marginBottom: space.md, color: THEME.teal }]} accessibilityLiveRegion="polite">{notice}</Text> : null}
      {phrases.length > 0 ? <Button title="Ajouter les phrases de base" icon="sparkles-outline" variant="secondary" full onPress={() => setPackOpen(true)} style={{ marginBottom: space.xl }} /> : null}
      <SectionTitle title="Ajouter une phrase" />
      <Field label="En français" value={phrase} onChangeText={setPhrase} placeholder="Où sont les toilettes ?" />
      <Field label="Traduction" value={translation} onChangeText={setTranslation} placeholder="Where is the toilet?" />
      <Button title="Ajouter" icon="add" disabled={!phrase.trim() || !translation.trim()} onPress={add} full />

      <Sheet visible={packOpen} onClose={() => setPackOpen(false)} title="Phrases de base">
        <Txt variant="subhead" style={{ marginBottom: space.lg }}>
          Quinze phrases utiles (bonjour, merci, l'addition, un médecin…) dans la langue du voyage. Celles déjà dans la liste ne sont pas ajoutées deux fois.
        </Txt>
        <Group style={{ marginBottom: space.md }}>
          {languages.map((l) => {
            const left = missingFromPack(trip, l.key).length;
            const hello = packFor(l.key)[0];
            const forCountry = l.key === suggested ? `Pour ${country.name}` : null;
            return (
              <Row
                key={l.key}
                icon="language-outline"
                tone="neutral"
                title={l.label}
                subtitle={left === 0 ? "Déjà toutes dans la liste" : [forCountry, hello ? hello.translation : null].filter(Boolean).join(" · ") || undefined}
                chevron={left > 0}
                onPress={left > 0 ? () => addPack(l) : undefined}
                accessibilityLabel={left === 0 ? `${l.label}, déjà toutes dans la liste` : `Ajouter les phrases de base en ${l.label.toLowerCase()}`}
              />
            );
          })}
        </Group>
      </Sheet>
    </TripScroll>
  );
}

function ShiftDatesModal({ visible, onClose, onConfirm }) {
  const [amount, setAmount] = useState("");

  function confirm(sign) {
    const n = parseInt(amount, 10);
    if (!n || isNaN(n)) return;
    onConfirm(sign * n);
    setAmount("");
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Décaler les dates">
      <Text style={[type.subhead, { marginBottom: space.lg }]}>Décale la date de départ et toutes les dates explicites du voyage.</Text>
      <Field label="Nombre de jours" value={amount} onChangeText={setAmount} placeholder="Ex : 3" keyboardType="number-pad" />
      <View style={styles.sheetButtons}>
        <Button title="Avancer" icon="arrow-back" variant="secondary" style={{ flex: 1 }} disabled={!parseInt(amount, 10)} onPress={() => confirm(-1)} />
        <Button title="Retarder" icon="arrow-forward" variant="secondary" style={{ flex: 1 }} disabled={!parseInt(amount, 10)} onPress={() => confirm(1)} />
      </View>
    </Sheet>
  );
}

const NODE = 30;
const NOTCH = 14; // the perforation of a day ticket stops this far from its edges
const DAY_GAP = space.lg; // between two days of the list
const RAIL = 52; // width of the column that holds the day numbers
const RAIL_NODE = 48; // height of a number's box: the line joins their middles
const ADD_H = 56;
const STUB = 56; // width of the ticket stub that holds the options button

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  headerBar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: space.md },
  headerActions: { flexDirection: "row", gap: space.sm },
  heroButton: { backgroundColor: THEME.veil, boxShadow: shadow.raised },
  headerLabel: { marginTop: -space.xl - space.xs, marginHorizontal: layout.gutter, marginBottom: space.lg, padding: space.lg, gap: space.sm, backgroundColor: THEME.bgCard, ...paperEdge() },
  headerMeta: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" },

  tabBarWrap: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: THEME.hairStrong, backgroundColor: THEME.bg },
  stickyTabs: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: THEME.bg, zIndex: 10 },
  tabBar: { paddingHorizontal: layout.gutter, gap: space.xl },
  tab: { minHeight: layout.minTouch, justifyContent: "flex-end" },
  tabRule: { height: 3, borderRadius: 2, backgroundColor: "transparent", marginTop: space.sm },

  scrollContent: { padding: layout.gutter, paddingBottom: space.xxxl },
  toolbar: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.md },
  toolbarCount: { flex: 1 },

  routeTitleRow: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  routeMeta: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" },

  dayList: { gap: DAY_GAP },
  dayRow: { flexDirection: "row", alignItems: "stretch", gap: space.sm },
  rail: { width: RAIL, alignItems: "center" },
  railLine: { position: "absolute", left: RAIL / 2 - 1, width: 2, borderRadius: 1, backgroundColor: THEME.hairStrong },
  railNode: { width: RAIL, height: RAIL_NODE, alignItems: "center", justifyContent: "center", borderRadius: RAIL_NODE / 2 },
  railNodeToday: { width: RAIL_NODE, backgroundColor: THEME.goldFill, boxShadow: `0 0 0 4px ${withAlpha(THEME.goldFill, 0.3)}` },
  railNumber: { ...type.display, fontSize: 30, lineHeight: 34, letterSpacing: -1, backgroundColor: THEME.bg, paddingHorizontal: 4 },
  railNumberBig: { fontSize: 26, letterSpacing: -1.5 },
  railNumberToday: { backgroundColor: "transparent", fontSize: 28, paddingHorizontal: 0 },
  railAdd: { width: 28, height: 28, borderRadius: 14, marginTop: ADD_H / 2 - 14, alignItems: "center", justifyContent: "center", backgroundColor: THEME.bg, borderWidth: 1.5, borderStyle: "dashed", borderColor: THEME.hairStrong },
  todayCard: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: THEME.bgCard, ...paperEdge(), borderWidth: 1.5, borderColor: THEME.gold, padding: space.md, marginBottom: space.lg },
  bookCard: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: THEME.bgCard, ...paperEdge(), borderWidth: 1, borderColor: THEME.hairStrong, padding: space.md, marginBottom: space.lg },
  bookIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: THEME.bgCardAlt, alignItems: "center", justifyContent: "center" },
  todayIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: THEME.goldFill, alignItems: "center", justifyContent: "center" },
  dayTicket: { flex: 1, flexDirection: "row", alignItems: "stretch", backgroundColor: THEME.bgCard, borderWidth: 1, borderColor: THEME.hairStrong, ...paperEdge() },
  dayTicketToday: { borderWidth: 1.5, borderColor: THEME.gold },
  dayBody: { flex: 1, padding: space.lg, gap: space.xs },
  dayHead: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.xs },
  dayText: { gap: space.xs },
  dayTextDone: { opacity: 0.6 },
  dayTags: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap", marginTop: 2 },
  dayLive: { alignSelf: "flex-start", marginTop: space.sm },
  dayStub: { width: STUB, alignItems: "center", justifyContent: "center" },
  perfDots: { position: "absolute", left: 0, top: NOTCH, bottom: NOTCH, width: 2, alignItems: "center", justifyContent: "space-evenly" },
  perfDot: { width: 2, height: 4, borderRadius: 1, backgroundColor: THEME.hairStrong },
  dayAdd: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, minHeight: ADD_H, borderWidth: 1.5, borderStyle: "dashed", borderColor: THEME.hairStrong },

  node: { width: NODE, height: NODE, borderRadius: NODE / 2, alignItems: "center", justifyContent: "center" },
  nodeNumber: { ...type.numeralSmall },
  nodeToday: { backgroundColor: THEME.goldFill, boxShadow: `0 0 0 4px ${withAlpha(THEME.goldFill, 0.3)}` },
  nodeDone: { backgroundColor: THEME.teal },
  nodePast: { borderWidth: 2, borderColor: withAlpha(THEME.teal, 0.45) },
  nodeFuture: { borderWidth: 2, borderColor: THEME.hairStrong },

  dayGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: space.md },
  gridAdd: { width: "100%" },
  bookAdd: { marginTop: space.md },
  tile: { width: "48%", backgroundColor: THEME.bgCard, ...paperEdge(), padding: space.lg, borderWidth: 1.5, borderColor: THEME.light ? THEME.border : "transparent" },
  tileToday: { borderColor: THEME.gold },
  tileTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  totalBlock: { alignItems: "center", gap: space.xs, paddingTop: space.md, paddingBottom: space.xl },
  spentBlock: { gap: space.sm, marginBottom: space.xl },
  goalCard: { gap: space.sm, backgroundColor: THEME.bgCard, ...paperEdge(), borderWidth: 1, borderColor: THEME.hairStrong, padding: space.md, marginBottom: space.xl },
  spentRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  expensesTitle: { marginTop: space.xl },
  amountCol: { alignItems: "flex-end", gap: 2 },
  totalValue: { ...type.numeralLarge, color: THEME.mark },

  checklistSection: { marginBottom: space.xl },
  starter: { gap: space.md, marginBottom: space.md },
  checkedLabel: { color: THEME.inkFaint, textDecorationLine: "line-through" },
  addItemRow: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  addItemButton: { width: 50, height: 50 },

  docDrawers: { gap: space.md },
  categoryChips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.lg },
  sheetButtons: { flexDirection: "row", gap: space.md, marginTop: space.xs },
  previewImage: { width: "100%", height: 200, backgroundColor: THEME.bgCardAlt },
  pdfPreview: { width: "100%", height: 120, backgroundColor: THEME.bgCardAlt, alignItems: "center", justifyContent: "center", gap: space.sm },
  scannedCodeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: THEME.tealDim,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginTop: space.md,
  },
  scannedCodeText: { ...type.numeralSmall, color: THEME.teal, flex: 1 },
  viewerOverlay: { flex: 1, backgroundColor: "#000000EE", alignItems: "center", justifyContent: "center" },
  viewerImage: { width: "100%", height: "80%" },
  viewerTitleBar: {
    position: "absolute",
    top: 50,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: layout.gutter,
  },
}));
