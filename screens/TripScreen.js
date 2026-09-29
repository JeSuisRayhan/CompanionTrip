import React, { useState, useCallback, useEffect, useContext, useRef } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Modal, Alert, Image, ImageBackground, LayoutAnimation, Platform, UIManager } from "react-native";
import { SafeAreaView, SafeAreaInsetsContext } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import { THEME, TONES, space, layout, radius, type } from "../lib/theme";
import { TYPES } from "../lib/constants";
import { getTrip, addChecklistItem, toggleChecklistItem, removeChecklistItem, addPhrase, removePhrase, shiftTripDatesBy, duplicateDay, moveDay, setDayType, addDay } from "../lib/trips";
import { resolveDayDate, formatDateLabel, formatDayLabel, formatDateRange, tripRange, tripStatus, addDaysISO } from "../lib/dates";
import { decodeBoardingPass, resolveJulianDate } from "../lib/boardingPass";
import { tripActivityTotal, transportTotal, accommodationTotal, repasTotal, otherExpensesTotal, formatMoney, convertAmount } from "../lib/budget";
import { pickImage, addDocument, removeDocument } from "../lib/documents";
import { WeatherBadge } from "./DayDetailScreen";
import { shareTripAsText, shareTripAsICS } from "../lib/share";
import DonutChart from "../components/DonutChart";
import { Txt, Button, IconButton, Badge, Group, Row, Thumb, SectionTitle, Field, ProgressBar, EmptyState, Sheet, round } from "../components/ui";
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

  useEffect(() => {
    if (route.params?.scannedUri) {
      setTab("documents");
      setIncomingScan({ uri: route.params.scannedUri, scannedCode: route.params.scannedCode || null });
      navigation.setParams({ scannedUri: undefined, scannedCode: undefined });
    }
  }, [route.params?.scannedUri]);

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
  const isBuildMode = trip.planMode === "build" && trip.tripType !== "park";
  const isParkTrip = trip.tripType === "park";
  const tabList = isBuildMode ? [TABS[0], IDEAS_TAB, ...TABS.slice(1)] : isParkTrip ? [TABS[0], ATTRACTIONS_TAB, ...TABS.slice(1)] : TABS;

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
      <TripHeader trip={trip} start={start} end={end} status={status} onBack={() => navigation.goBack()} onSettings={() => navigation.navigate("TripSettings", { tripId: trip.id })} />
      <TabBar tabs={tabList} value={tab} onChange={setTab} />

      {tab === "days" && (
        <DaysTab
          trip={trip}
          navigation={navigation}
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
      {tab === "ideas" && isBuildMode && <IdeasTab trip={trip} navigation={navigation} onChange={refresh} />}
      {tab === "attractions" && isParkTrip && <AttractionsTab trip={trip} navigation={navigation} onChange={refresh} />}
      {tab === "budget" && <BudgetTab trip={trip} />}
      {tab === "checklists" && <ChecklistsTab trip={trip} onChange={refresh} />}
      {tab === "documents" && (
        <DocumentsTab
          trip={trip}
          onChange={refresh}
          navigation={navigation}
          incomingScan={incomingScan}
          onConsumeIncomingScan={() => setIncomingScan(null)}
        />
      )}
      {tab === "phrases" && <PhrasesTab trip={trip} onChange={refresh} />}

      <ShiftDatesModal
        visible={shiftModalOpen}
        onClose={() => setShiftModalOpen(false)}
        onConfirm={async (delta) => {
          await shiftTripDatesBy(trip.id, delta);
          setShiftModalOpen(false);
          refresh();
        }}
      />
    </SafeAreaView>
  );
}

// Trip name, dates and status. The cover photo (when there is one) sits behind it.
function TripHeader({ trip, start, end, status, onBack, onSettings }) {
  const insets = useContext(SafeAreaInsetsContext);
  const cover = trip.coverImage;
  const body = (
    <>
      <View style={[styles.headerBar, { paddingTop: space.xs + (insets ? insets.top : 0) }]}>
        <IconButton icon="chevron-back" label="Retour" filled onPress={onBack} />
        <IconButton icon="options-outline" label="Réglages du voyage" filled onPress={onSettings} />
      </View>
      <View style={[styles.headerTitleBlock, cover?.url && { paddingTop: space.xl }]}>
        <Txt variant="display" numberOfLines={2} accessibilityRole="header">
          {trip.name}
        </Txt>
        <View style={styles.headerMeta}>
          {start ? <Txt variant="subhead">{formatDateRange(start, end)}</Txt> : <Txt variant="subhead">Pas encore daté</Txt>}
          {status === "current" ? <Badge label="En cours" tone="teal" solid icon="radio-button-on" /> : null}
        </View>
      </View>
    </>
  );
  if (cover?.url) {
    return (
      <ImageBackground source={{ uri: cover.url }} style={styles.headerPhoto} imageStyle={{ resizeMode: "cover" }}>
        <LinearGradient colors={["rgba(23,15,31,0.25)", "rgba(23,15,31,0.75)", THEME.bg]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
        {body}
      </ImageBackground>
    );
  }
  return <View>{body}</View>;
}

// Underlined text tabs. The active tab is ink + a gold rule; no pills.
function TabBar({ tabs, value, onChange }) {
  const scrollRef = useRef(null);
  const xs = useRef({});
  // Keep the active tab in view when the bar overflows (6 tabs in build mode).
  useEffect(() => {
    const x = xs.current[value];
    if (x != null && scrollRef.current) scrollRef.current.scrollTo({ x: Math.max(0, x - layout.gutter), animated: true });
  }, [value]);
  return (
    <View style={styles.tabBarWrap}>
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
        {tabs.map((t) => {
          const active = value === t.key;
          return (
            <Pressable
              key={t.key}
              onLayout={(e) => {
                xs.current[t.key] = e.nativeEvent.layout.x;
              }}
              onPress={() => onChange(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={styles.tab}
            >
              <Text style={[type.label, { color: active ? THEME.ink : THEME.inkMuted, fontFamily: active ? type.label.fontFamily : type.body.fontFamily }]}>{t.label}</Text>
              <View style={[styles.tabRule, active && { backgroundColor: THEME.gold }]} />
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
        <Ionicons name="checkmark" size={15} color={THEME.onGold} />
      </View>
    );
  }
  return (
    <View style={[styles.node, state === "past" ? styles.nodePast : styles.nodeFuture]}>
      <Text style={[styles.nodeNumber, { color: state === "past" ? THEME.inkMuted : THEME.inkFaint }]}>{number}</Text>
    </View>
  );
}

function DaysTab({ trip, navigation, onShiftDates, onDuplicateDay, onMoveDay, onAddDay, searchQuery, gridView, onSearchChange, onToggleGrid }) {
  const isPark = trip.tripType === "park";
  const [menuDay, setMenuDay] = useState(null); // { day, index } while the day menu sheet is open

  const q = (searchQuery || "").trim().toLowerCase();
  const today = isoToday();
  // The map has something to show once a step or an idea has a position.
  const hasMap = !isPark && (trip.days.some((d) => d.activities.some((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng))) || (trip.ideas || []).some((i) => Number.isFinite(i.lat) && Number.isFinite(i.lng)));

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <View style={styles.actionRow}>
        <Button title="Décaler" icon="calendar-outline" variant="secondary" size="sm" onPress={onShiftDates} />
        <Button title="Partager" icon="share-outline" variant="secondary" size="sm" onPress={() => shareTripAsText(trip)} />
        <Button title=".ics" icon="download-outline" variant="secondary" size="sm" onPress={() => shareTripAsICS(trip)} accessibilityLabel="Exporter au format calendrier .ics" />
        <View style={{ flex: 1 }} />
        {!isPark && (
          <IconButton
            icon={gridView ? "list-outline" : "grid-outline"}
            label={gridView ? "Afficher les jours en liste" : "Afficher les jours en grille"}
            filled
            size={20}
            onPress={onToggleGrid}
            style={styles.gridToggle}
          />
        )}
      </View>

      {!isPark && trip.days.length >= 6 && (
        <Field
          placeholder="Rechercher un jour, une étape…"
          value={searchQuery}
          onChangeText={onSearchChange}
          style={{ marginBottom: space.md }}
          accessibilityLabel="Rechercher"
          left={<Ionicons name="search" size={18} color={THEME.inkFaint} style={{ marginRight: space.sm }} />}
          right={
            searchQuery ? (
              <Pressable onPress={() => onSearchChange("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Effacer la recherche">
                <Ionicons name="close-circle" size={18} color={THEME.inkFaint} />
              </Pressable>
            ) : null
          }
        />
      )}

      {!isPark && (
        <Pressable
          onPress={() => navigation.navigate("WeatherReorg", { tripId: trip.id })}
          accessibilityRole="button"
          accessibilityLabel="Réorganiser selon la météo"
          style={({ pressed }) => [styles.inlineLink, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="partly-sunny-outline" size={18} color={THEME.gold} />
          <Text style={[type.label, { color: THEME.gold, flex: 1 }]}>Réorganiser selon la météo</Text>
          <Ionicons name="chevron-forward" size={16} color={THEME.gold} />
        </Pressable>
      )}

      {hasMap && (
        <Pressable
          onPress={() => navigation.navigate("TripMap", { tripId: trip.id })}
          accessibilityRole="button"
          accessibilityLabel="Voir le voyage sur la carte"
          style={({ pressed }) => [styles.inlineLink, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="map-outline" size={18} color={THEME.gold} />
          <Text style={[type.label, { color: THEME.gold, flex: 1 }]}>Voir sur la carte</Text>
          <Ionicons name="chevron-forward" size={16} color={THEME.gold} />
        </Pressable>
      )}

      {isPark ? (
        <ParkDays trip={trip} navigation={navigation} />
      ) : (
        (() => {
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
                        {day.dayType === "flight" && <Ionicons name="airplane" size={15} color={THEME.blue} />}
                        {day.dayType === "park" && <Ionicons name="sparkles" size={15} color={THEME.pink} />}
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
                  </View>
                )}
              </View>
            );
          }

          return (
            <View>
              {filtered.map(({ day, index }, i) => {
                const date = resolveDayDate(trip, day, index);
                const state = dayState(day, date, today);
                const isFirst = i === 0;
                const showAdd = !q;
                const isLast = i === filtered.length - 1 && !showAdd;
                const count = day.activities.length;
                return (
                  <Pressable
                    key={day.id}
                    onPress={() => navigation.navigate("DayDetail", { tripId: trip.id, dayId: day.id })}
                    accessibilityRole="button"
                    accessibilityLabel={`${day.title}${date ? ", " + formatDayLabel(date) : ""}, ${count} étape${count !== 1 ? "s" : ""}`}
                    style={({ pressed }) => [styles.routeRow, pressed && { backgroundColor: THEME.pressed }]}
                  >
                    <View style={styles.rail}>
                      <View style={[styles.railLine, { height: space.md }, isFirst && { backgroundColor: "transparent" }]} />
                      <DayNode state={state} number={index + 1} />
                      <View style={[styles.railLine, { flex: 1 }, isLast && { backgroundColor: "transparent" }]} />
                    </View>
                    <View style={styles.routeBody}>
                      <View style={styles.routeTitleRow}>
                        <Text style={[type.heading, { flexShrink: 1 }]} numberOfLines={2}>
                          {day.title}
                        </Text>
                        {day.dayType === "flight" && <Ionicons name="airplane" size={15} color={THEME.blue} />}
                        {day.dayType === "park" && <Ionicons name="sparkles" size={15} color={THEME.pink} />}
                      </View>
                      <View style={styles.routeMeta}>
                        {state === "today" ? <Badge label="Aujourd'hui" tone="gold" solid /> : null}
                        {date ? <Text style={type.subhead}>{formatDayLabel(date)}</Text> : null}
                        {date ? <WeatherBadge day={day} dateISO={date} compact fallbackLocation={trip.defaultLocation} /> : null}
                      </View>
                      <Text style={[type.caption, { color: THEME.inkFaint, marginTop: 2 }]}>
                        {count === 0 ? "Aucune étape" : `${count} étape${count !== 1 ? "s" : ""}`}
                      </Text>
                    </View>
                    {!q && (
                      <IconButton icon="ellipsis-horizontal" label={`Options de ${day.title}`} onPress={() => openDayMenu(day, index)} size={20} />
                    )}
                  </Pressable>
                );
              })}
              {!q && (
                <Pressable onPress={onAddDay} accessibilityRole="button" accessibilityLabel="Ajouter un jour" style={({ pressed }) => [styles.routeRow, pressed && { backgroundColor: THEME.pressed }]}>
                  <View style={styles.rail}>
                    <View style={[styles.railLine, { height: space.md, backgroundColor: "transparent" }]} />
                    <View style={[styles.node, styles.nodeAdd]}>
                      <Ionicons name="add" size={16} color={THEME.inkMuted} />
                    </View>
                  </View>
                  <View style={[styles.routeBody, { justifyContent: "center", paddingTop: space.md }]}>
                    <Text style={[type.label, { color: THEME.inkMuted, fontFamily: type.body.fontFamily }]}>Ajouter un jour</Text>
                  </View>
                </Pressable>
              )}
            </View>
          );
        })()
      )}

      <Sheet visible={!!menuDay} onClose={() => setMenuDay(null)} title={menuDay ? menuDay.day.title : ""}>
        {menuDay && (
          <Group style={{ marginBottom: space.md }}>
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
    </ScrollView>
  );
}

// Park trips: every day is a block of its own with the two park actions
// (prepare the route, follow it on the day) and its steps in time order.
function ParkDays({ trip, navigation }) {
  return (
    <View>
      {trip.days.map((day, index) => {
        const date = resolveDayDate(trip, day, index);
        const steps = day.activities
          .map((activity, i) => ({ activity, i }))
          .sort((a, b) => (a.activity.time || "99:99").localeCompare(b.activity.time || "99:99") || a.i - b.i)
          .map((x) => x.activity);
        const done = steps.filter((a) => a.done).length;
        return (
          <View key={day.id} style={styles.parkDay}>
            <View style={styles.parkDayHead}>
              <View style={styles.parkDayTitle}>
                <Text style={type.heading} accessibilityRole="header" numberOfLines={1}>
                  {day.title}
                </Text>
                {date ? <Txt variant="subhead">{formatDayLabel(date)}</Txt> : null}
              </View>
              {steps.length > 0 ? <Text style={[type.numeralSmall, { color: THEME.inkFaint }]}>{`${done}/${steps.length}`}</Text> : null}
            </View>
            <View style={styles.parkDayActions}>
              <Button
                title="Parcours"
                icon="sparkles-outline"
                size="sm"
                tone="gold"
                accessibilityLabel={`Préparer le parcours de ${day.title}`}
                onPress={() => navigation.navigate("ParkPlan", { tripId: trip.id, dayId: day.id })}
              />
              {steps.length > 0 ? (
                <Button title="Jour J" icon="play" size="sm" tone="teal" accessibilityLabel={`Suivre ${day.title} en direct`} onPress={() => navigation.navigate("ParkLive", { tripId: trip.id, dayId: day.id })} />
              ) : null}
              <Button title="Détails" size="sm" variant="secondary" accessibilityLabel={`Ouvrir ${day.title}`} onPress={() => navigation.navigate("DayDetail", { tripId: trip.id, dayId: day.id })} />
            </View>
            {steps.length > 0 ? (
              <Group>
                {steps.map((activity) => {
                  const t = TYPES[activity.type] || TYPES.activite;
                  return (
                    <Row
                      key={activity.id}
                      lead={<Thumb icon={activity.done ? "checkmark" : t.icon} tone={activity.done ? "teal" : typeTone(activity.type)} size={40} />}
                      title={activity.title}
                      subtitle={activity.time || "heure libre"}
                      chevron
                      onPress={() => navigation.navigate("ActivityEditor", { tripId: trip.id, dayId: day.id, activity })}
                    />
                  );
                })}
              </Group>
            ) : (
              <Txt variant="subhead">Aucune étape pour l'instant.</Txt>
            )}
          </View>
        );
      })}
    </View>
  );
}

function typeTone(key) {
  return key === "repas" ? "gold" : key === "hotel" ? "stamp" : key === "transport" ? "blue" : "teal";
}

const BUDGET_CATEGORIES = [
  { key: "transport", label: "Transport", icon: "airplane", tone: "blue" },
  { key: "hotel", label: "Hébergement", icon: "bed", tone: "stamp" },
  { key: "repas", label: "Repas", icon: "restaurant", tone: "gold" },
  { key: "other", label: "Autres dépenses", icon: "pricetag", tone: "pink" },
];

function BudgetTab({ trip }) {
  const [converterOpen, setConverterOpen] = useState(false);
  const total = tripActivityTotal(trip);
  const showConverter = trip.currency && trip.homeCurrency && trip.currency !== trip.homeCurrency;
  const values = {
    transport: transportTotal(trip),
    hotel: accommodationTotal(trip),
    repas: repasTotal(trip),
    other: otherExpensesTotal(trip),
  };
  const categories = BUDGET_CATEGORIES.map((c) => ({ ...c, value: values[c.key], color: TONES[c.tone].fg }));

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {total > 0 && (
        <DonutChart
          segments={categories.map((c) => ({ value: c.value, color: c.color }))}
          centerValue={formatMoney(total, trip.currency).replace(/\s?[A-Z€$£¥]+$/, "")}
          centerLabel={trip.currency}
        />
      )}
      <View style={styles.totalBlock}>
        <Txt variant="subhead">Total estimé</Txt>
        <Text style={styles.totalValue}>{formatMoney(total, trip.currency)}</Text>
        {trip.homeCurrency !== trip.currency && (
          <Text style={type.numeralSmall}>≈ {formatMoney(convertAmount(total, trip.rate), trip.homeCurrency)}</Text>
        )}
        {showConverter && <Button title="Convertisseur rapide" icon="swap-horizontal" variant="secondary" size="sm" onPress={() => setConverterOpen(true)} style={{ marginTop: space.md }} />}
      </View>
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
              right={<Text style={[type.numeral, overTarget && { color: THEME.stamp }]}>{formatMoney(c.value, trip.currency)}</Text>}
            >
              {target != null && (
                <View style={{ gap: space.xs + 2, marginTop: space.xs }}>
                  <ProgressBar value={target > 0 ? spentInHome / target : 0} tone={overTarget ? "stamp" : c.tone} />
                  <Text style={[type.caption, overTarget && { color: THEME.stamp }]}>
                    Objectif : {formatMoney(target, trip.homeCurrency)}
                    {trip.homeCurrency !== trip.currency ? ` (≈ ${formatMoney(spentInHome, trip.homeCurrency)} dépensé)` : ""}
                  </Text>
                </View>
              )}
            </Row>
          );
        })}
      </Group>
      <CurrencyConverterModal visible={converterOpen} onClose={() => setConverterOpen(false)} trip={trip} />
    </ScrollView>
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
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <ChecklistSection title="Bagages" trip={trip} listKey="packingList" onChange={onChange} />
      <ChecklistSection title="Avant le départ" trip={trip} listKey="departureChecklist" onChange={onChange} />
    </ScrollView>
  );
}

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

  return (
    <View style={styles.checklistSection}>
      <SectionTitle title={title} count={items.length > 0 ? `${doneCount}/${items.length}` : null} />
      {items.length > 0 && (
        <Group style={{ marginBottom: space.md }}>
          {items.map((item) => (
            <Row
              key={item.id}
              lead={<Ionicons name={item.checked ? "checkmark-circle" : "ellipse-outline"} size={24} color={item.checked ? THEME.teal : THEME.inkFaint} />}
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

function DocumentsTab({ trip, onChange, navigation, incomingScan, onConsumeIncomingScan }) {
  const [pendingUri, setPendingUri] = useState(null);
  const [pendingScannedCode, setPendingScannedCode] = useState(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [viewingDoc, setViewingDoc] = useState(null);
  const docs = trip.documents || [];

  useEffect(() => {
    if (incomingScan) {
      setPendingUri(incomingScan.uri);
      setPendingScannedCode(incomingScan.scannedCode);
      const boardingPass = incomingScan.scannedCode ? decodeBoardingPass(incomingScan.scannedCode) : null;
      if (boardingPass) {
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

  const [addMenuOpen, setAddMenuOpen] = useState(false);

  function choosePhoto() {
    setError("");
    setAddMenuOpen(true);
  }

  async function pick(source) {
    try {
      const uri = await pickImage(source);
      if (uri) setPendingUri(uri);
    } catch (e) {
      setError(e && e.code === "PERMISSION_DENIED" ? "Autorisation refusée. Activez l'accès à la caméra/aux photos dans les réglages du téléphone." : "Échec de la sélection.");
    }
  }

  async function confirmAdd() {
    setBusy(true);
    try {
      await addDocument(trip.id, { title, category: "autre", tempUri: pendingUri, scannedCode: pendingScannedCode });
      setPendingUri(null);
      setPendingScannedCode(null);
      setTitle("");
      onChange();
    } catch (e) {
      setError("Échec de l'enregistrement du document.");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(docId) {
    await removeDocument(trip.id, docId);
    onChange();
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Button title="Ajouter un document" icon="camera-outline" variant="secondary" full onPress={choosePhoto} style={{ marginBottom: space.lg }} />
      {error ? <Text style={[type.caption, { color: THEME.stamp, marginBottom: space.md }]}>{error}</Text> : null}

      {docs.length === 0 && (
        <EmptyState icon="document-text-outline" title="Aucun document" text="Billets, réservations, codes Wi-Fi de l'hôtel : tout ce qu'on cherche toujours au pire moment." />
      )}

      {docs.length > 0 && (
        <Group>
          {docs.map((doc) => (
            <Row
              key={doc.id}
              lead={<Thumb uri={doc.uri} icon="document-text" size={44} />}
              title={doc.title}
              onPress={() => setViewingDoc(doc)}
              right={<IconButton icon="trash-outline" label={`Supprimer ${doc.title}`} size={18} onPress={() => onRemove(doc.id)} />}
              style={{ paddingRight: space.xs }}
            />
          ))}
        </Group>
      )}

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
        </Group>
      </Sheet>

      <Modal visible={!!viewingDoc} transparent animationType="fade" onRequestClose={() => setViewingDoc(null)}>
        <Pressable style={styles.viewerOverlay} onPress={() => setViewingDoc(null)} accessibilityLabel="Fermer le document">
          {viewingDoc && <Image source={{ uri: viewingDoc.uri }} style={styles.viewerImage} resizeMode="contain" />}
          {viewingDoc?.scannedCode && (
            <View style={[styles.scannedCodeBadge, { position: "absolute", bottom: 90, left: 20, right: 20 }]}>
              <Ionicons name="qr-code-outline" size={14} color={THEME.teal} />
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

      <Sheet
        visible={!!pendingUri}
        onClose={() => {
          setPendingUri(null);
          setPendingScannedCode(null);
        }}
        title="Nouveau document"
      >
        {pendingUri && <Image source={{ uri: pendingUri }} style={[styles.previewImage, round("md")]} />}
        {pendingScannedCode && (
          <View style={styles.scannedCodeBadge}>
            <Ionicons name="qr-code-outline" size={14} color={THEME.teal} />
            <Text style={styles.scannedCodeText} numberOfLines={1}>
              {pendingScannedCode}
            </Text>
          </View>
        )}
        <Field label="Titre" value={title} onChangeText={setTitle} placeholder="Ex : voucher hôtel" style={{ marginTop: space.lg }} />
        {error ? <Text style={[type.caption, { color: THEME.stamp, marginBottom: space.md }]}>{error}</Text> : null}
        <View style={styles.sheetButtons}>
          <Button
            title="Annuler"
            variant="secondary"
            disabled={busy}
            style={{ flex: 1 }}
            onPress={() => {
              setPendingUri(null);
              setPendingScannedCode(null);
            }}
          />
          <Button title="Enregistrer" loading={busy} style={{ flex: 1 }} onPress={confirmAdd} />
        </View>
      </Sheet>
    </ScrollView>
  );
}

function PhrasesTab({ trip, onChange }) {
  const [phrase, setPhrase] = useState("");
  const [translation, setTranslation] = useState("");
  const phrases = trip.phrases || [];

  async function add() {
    if (!phrase.trim() || !translation.trim()) return;
    await addPhrase(trip.id, phrase, translation);
    setPhrase("");
    setTranslation("");
    onChange();
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      {phrases.length === 0 && (
        <EmptyState icon="chatbubbles-outline" title="Aucune phrase" text="Les phrases qui sauvent : « où sont les toilettes ? », « c'est trop épicé »…" />
      )}
      {phrases.length > 0 && (
        <Group style={{ marginBottom: space.xl }}>
          {phrases.map((p) => (
            <Row
              key={p.id}
              title={p.phrase}
              subtitle={<Text style={[type.subhead, { color: THEME.teal }]}>{p.translation}</Text>}
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
            />
          ))}
        </Group>
      )}
      <SectionTitle title="Ajouter une phrase" />
      <Field label="En français" value={phrase} onChangeText={setPhrase} placeholder="Où sont les toilettes ?" />
      <Field label="Traduction" value={translation} onChangeText={setTranslation} placeholder="Where is the toilet?" />
      <Button title="Ajouter" icon="add" disabled={!phrase.trim() || !translation.trim()} onPress={add} full />
    </ScrollView>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  headerPhoto: { width: "100%" },
  headerBar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: space.md },
  headerTitleBlock: { paddingHorizontal: layout.gutter, paddingTop: space.sm, paddingBottom: space.lg, gap: space.sm },
  headerMeta: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" },

  tabBarWrap: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: THEME.hairStrong },
  tabBar: { paddingHorizontal: layout.gutter, gap: space.xl },
  tab: { minHeight: layout.minTouch, justifyContent: "flex-end" },
  tabRule: { height: 3, borderRadius: 2, backgroundColor: "transparent", marginTop: space.sm },

  scrollContent: { padding: layout.gutter, paddingBottom: space.xxxl },
  actionRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm, marginBottom: space.md },
  gridToggle: { width: 40, height: 40, marginRight: -space.xs },
  parkDay: { marginBottom: space.xl },
  parkDayHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md },
  parkDayTitle: { flex: 1, flexDirection: "row", alignItems: "baseline", gap: space.md },
  parkDayActions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginVertical: space.md },
  inlineLink: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: layout.minTouch, marginBottom: space.sm },

  routeRow: { flexDirection: "row", alignItems: "stretch", gap: space.md, paddingRight: space.xs, borderRadius: radius.md },
  rail: { width: NODE, alignItems: "center" },
  railLine: { width: 2, backgroundColor: THEME.hairStrong },
  routeBody: { flex: 1, paddingTop: space.md, paddingBottom: space.md, gap: 2 },
  routeTitleRow: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  routeMeta: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" },

  node: { width: NODE, height: NODE, borderRadius: NODE / 2, alignItems: "center", justifyContent: "center" },
  nodeNumber: { ...type.numeralSmall },
  nodeToday: { backgroundColor: THEME.gold, boxShadow: "0 0 0 4px rgba(244, 183, 64, 0.24)" },
  nodeDone: { backgroundColor: THEME.teal },
  nodePast: { borderWidth: 2, borderColor: "rgba(63, 214, 192, 0.45)" },
  nodeFuture: { borderWidth: 2, borderColor: THEME.hairStrong },
  nodeAdd: { borderWidth: 2, borderColor: THEME.hairStrong, borderStyle: "dashed" },

  dayGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: space.md },
  gridAdd: { width: "100%" },
  tile: { width: "48%", backgroundColor: THEME.bgCard, padding: space.lg, borderWidth: 1.5, borderColor: "transparent" },
  tileToday: { borderColor: THEME.gold },
  tileTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  totalBlock: { alignItems: "center", gap: space.xs, paddingBottom: space.xl },
  totalValue: { ...type.numeralLarge, color: THEME.gold },

  checklistSection: { marginBottom: space.xl },
  checkedLabel: { color: THEME.inkFaint, textDecorationLine: "line-through" },
  addItemRow: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  addItemButton: { width: 50, height: 50 },

  sheetButtons: { flexDirection: "row", gap: space.md, marginTop: space.xs },
  previewImage: { width: "100%", height: 200, backgroundColor: THEME.bgCardAlt },
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
});
