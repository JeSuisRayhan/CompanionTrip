import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, Switch, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { THEME, TONES, space, layout, radius, type, themedStyles } from "../lib/theme";
import { PARK_PRIORITIES, getIdeaCategory, placementIndex, priorityMeta } from "../lib/ideas";
import { getTrip } from "../lib/trips";
import { setPark, setMinHeight, tooTall, groupByLand, attractionInputs, importParkAttractions } from "../lib/park";
import { fetchParks, searchParks, fetchQueueTimes, liveByRideId, liveSummary, latestUpdate, ageLabel } from "../lib/queueTimes";
import { logError } from "../lib/errorLog";
import { ALERT_CHOICES, alertSettings, setParkAlerts, watchedIdeas, hasAlertDays } from "../lib/parkAlerts";
import { syncParkAlertTask, checkAlertsOnScreen, requestNotificationPermission } from "../lib/parkAlertsTask";
import AttractionSheet from "../components/AttractionSheet";
import WaitBadge from "../components/WaitBadge";
import DayPickerModal from "../components/DayPickerModal";
import TripScroll from "../components/TripScroll";
import QueueTimesCredit from "../components/QueueTimesCredit";
import { Txt, Button, IconButton, Chip, Badge, Surface, Group, Row, Thumb, Field, EmptyState, Sheet } from "../components/ui";

const REFRESH_MS = 5 * 60 * 1000; // Queue-Times refreshes its data every 5 minutes
const SUGGESTIONS = ["Disneyland", "Astérix", "Europa", "Efteling", "Walibi"];
const PRIORITY_TONE = { must: "stamp", want: "gold", maybe: "neutral", skip: "neutral" };

// A category stores its colour; the tone with the same foreground gives the tinted pair.
function toneOfCategory(cat) {
  return Object.keys(TONES).find((k) => TONES[k].fg === cat.color) || "neutral";
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// The "Attractions" tab of a park trip: pick the park, load its attractions
// with the live queues, say which ones matter, then prepare a day from them.
export default function AttractionsTab({ trip, navigation, onChange }) {
  const park = trip.park || null;
  const ideas = trip.ideas || [];
  const [live, setLive] = useState(null); // { rides, fetchedAt }
  const [liveError, setLiveError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [heightOpen, setHeightOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new, idea = editing
  const [notice, setNotice] = useState(null);
  const mounted = useRef(true);
  const tripRef = useRef(trip); // loadLive only restarts with the park: it reads the alert settings from here
  tripRef.current = trip;
  const qtId = park ? park.qtId : null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadLive = useCallback(
    async (force) => {
      if (qtId == null) return null;
      setLoading(true);
      setLiveError(null);
      try {
        const data = await fetchQueueTimes(qtId, { force });
        if (mounted.current) setLive(data);
        checkAlertsOnScreen(tripRef.current, data);
        return data;
      } catch (e) {
        logError(e, { source: "Queue-Times" });
        if (mounted.current) setLiveError(e.message);
        return null;
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [qtId]
  );

  useEffect(() => {
    setLive(null);
    loadLive(false);
    const id = setInterval(() => loadLive(true), REFRESH_MS);
    return () => clearInterval(id);
  }, [loadLive]);

  const liveMap = useMemo(() => liveByRideId(live), [live]);
  const summary = useMemo(() => (live ? liveSummary(live.rides) : null), [live]);
  const updated = live ? ageLabel(latestUpdate(live.rides)) : null;
  const placed = useMemo(() => placementIndex(trip), [trip]);
  const newRides = useMemo(() => (live ? attractionInputs(live.rides, trip).inputs.length : 0), [live, trip]);
  const tallCount = ideas.filter((i) => tooTall(i, trip)).length;
  const alerts = alertSettings(trip);
  const watchedCount = useMemo(() => watchedIdeas(trip).length, [trip]);
  const planCount = ideas.filter((i) => i.priority !== "skip" && !placed.has(i.id) && getIdeaCategory(trip, i.categoryId).activityType !== "repas").length;

  async function addFromPark() {
    const data = live || (await loadLive(true));
    if (!data) return;
    const r = await importParkAttractions(trip.id, data.rides);
    if (mounted.current) setNotice(r.added ? `${plural(r.added, "attraction ajoutée", "attractions ajoutées")}.` : "Rien de nouveau : tout est déjà dans la liste.");
    onChange();
  }

  async function pickPark(p) {
    setPickerOpen(false);
    await setPark(trip.id, p);
    setNotice(null);
    // an empty list is filled straight away: that is what choosing a park is for.
    // (A park day keeps one list per park: it is the new park's list that counts.)
    const now = await getTrip(trip.id);
    if (!now || !(now.ideas || []).length) {
      try {
        const data = await fetchQueueTimes(p.qtId, { force: true });
        const r = await importParkAttractions(trip.id, data.rides);
        if (mounted.current) setNotice(`${plural(r.added, "attraction ajoutée", "attractions ajoutées")}.`);
      } catch (e) {
        logError(e, { source: "Queue-Times" });
        if (mounted.current) setNotice(e.message);
      }
    }
    onChange();
  }

  async function setAlerts(change) {
    if (change.on) {
      const perm = await requestNotificationPermission();
      if (perm !== "granted") {
        Alert.alert("Notifications refusées", "Activez les notifications de l'application dans les réglages du téléphone pour recevoir l'alerte.");
        return;
      }
    }
    await setParkAlerts(trip.id, change);
    await syncParkAlertTask();
    onChange();
  }

  function prepareDay(dayId) {
    setDayPickerOpen(false);
    navigation.navigate("ParkPlan", { tripId: trip.id, dayId });
  }

  // On a park day of a normal trip there is one day to prepare: this one.
  const scopeDayId = trip.scope ? trip.scope.dayId : null;

  const shown = filter === "all" ? ideas : ideas.filter((i) => i.priority === filter);
  const groups = groupByLand(shown);
  const countFor = (key) => ideas.filter((i) => i.priority === key).length;

  if (!park) {
    return (
      <TripScroll contentContainerStyle={styles.scrollContent}>
        <EmptyState
          icon="sparkles-outline"
          tone="pink"
          title="Choisissez votre parc"
          text="La liste des attractions et les temps d'attente en direct viennent de Queue-Times.com. Vous pourrez ensuite dire lesquelles comptent le plus et préparer votre journée."
          action={{ label: "Choisir le parc", icon: "search", onPress: () => setPickerOpen(true) }}
        />
        <ParkPickerSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} onPick={pickPark} />
      </TripScroll>
    );
  }

  return (
    <TripScroll contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <Surface tone="card" r="lg" pad="lg">
        <View style={styles.parkHead}>
          <Thumb icon="sparkles" tone="pink" size={44} />
          <View style={styles.parkTitle}>
            <Txt variant="heading" numberOfLines={2}>
              {park.name}
            </Txt>
            {park.country ? <Txt variant="subhead">{park.country}</Txt> : null}
          </View>
          <Button title="Changer" size="sm" variant="secondary" accessibilityLabel="Changer de parc" onPress={() => setPickerOpen(true)} />
        </View>

        <View style={styles.liveRow}>
          {loading ? (
            <ActivityIndicator size="small" color={THEME.teal} />
          ) : (
            <Ionicons name={liveError ? "cloud-offline-outline" : "pulse"} size={18} color={liveError ? THEME.stamp : THEME.teal} />
          )}
          <View style={styles.liveText}>
            {liveError ? (
              <Txt variant="label" color="stamp" numberOfLines={3}>
                {liveError}
              </Txt>
            ) : summary ? (
              <>
                <Txt variant="label" numberOfLines={3}>
                  {`${summary.open} ouvertes sur ${summary.total}${summary.avgWait != null ? `, attente moyenne ${summary.avgWait} min` : ""}`}
                </Txt>
                {updated ? <Txt variant="caption">{`Attentes mises à jour ${updated}`}</Txt> : null}
              </>
            ) : (
              <Txt variant="subhead">Chargement des attentes…</Txt>
            )}
          </View>
          <IconButton icon="refresh" label="Actualiser les attentes" filled size={20} disabled={loading} onPress={() => loadLive(true)} />
        </View>
      </Surface>

      <QueueTimesCredit />

      {/* One big action at a time: load the park's list first, then prepare a day. */}
      {ideas.length === 0 && newRides > 0 ? (
        <Button title={`Charger les ${newRides} attractions`} icon="download-outline" tone="gold" full onPress={addFromPark} />
      ) : ideas.length > 0 && planCount > 0 && trip.days.length > 0 ? (
        <Button
          title="Préparer ma journée"
          icon="sparkles-outline"
          tone="gold"
          full
          accessibilityLabel={`Préparer ma journée avec ${plural(planCount, "attraction à placer", "attractions à placer")}`}
          onPress={() => (scopeDayId ? prepareDay(scopeDayId) : trip.days.length === 1 ? prepareDay(trip.days[0].id) : setDayPickerOpen(true))}
        />
      ) : null}

      {notice ? (
        <Txt variant="caption" color="inkFaint" style={styles.notice}>
          {notice}
        </Txt>
      ) : null}

      <View style={[styles.settings, styles.gap]}>
        <Chip
          icon="resize-outline"
          tone="blue"
          label={park.minHeightCm ? `${park.minHeightCm} cm` : "Taille du groupe"}
          selected={!!park.minHeightCm}
          accessibilityLabel={`Taille du plus petit du groupe, ${park.minHeightCm ? park.minHeightCm + " centimètres" : "non renseignée"}`}
          onPress={() => setHeightOpen(true)}
        />
        {scopeDayId ? null : (
          <Chip
            icon="notifications-outline"
            tone="teal"
            label={alerts.on ? `Alerte sous ${alerts.maxWait} min` : "Alerte de file"}
            selected={alerts.on}
            accessibilityLabel={`Alerte de file courte, ${alerts.on ? "activée, sous " + alerts.maxWait + " minutes" : "désactivée"}`}
            onPress={() => setAlertOpen(true)}
          />
        )}
      </View>
      {tallCount > 0 ? (
        <Txt variant="caption" style={[styles.tallNote, { color: THEME.stamp }]}>
          {`${plural(tallCount, "attraction trop haute", "attractions trop hautes")} pour le groupe, ${tallCount === 1 ? "écartée" : "écartées"} du parcours.`}
        </Txt>
      ) : null}

      <View style={styles.listHead}>
        <Txt variant="subhead" style={styles.listCount}>
          {ideas.length ? plural(ideas.length, "attraction", "attractions") : ""}
        </Txt>
        <Button title="Plan" icon="map-outline" variant="secondary" size="sm" accessibilityLabel="Voir les attractions sur le plan du parc" onPress={() => navigation.navigate("TripMap", { tripId: trip.id })} />
        <Button title="Ajouter" icon="add" variant="secondary" size="sm" accessibilityLabel="Ajouter une attraction à la main" onPress={() => setEditing(null)} />
      </View>

      {ideas.length > 0 && newRides > 0 ? (
        <Pressable onPress={addFromPark} accessibilityRole="button" style={({ pressed }) => [styles.newRides, pressed && { opacity: 0.7 }]}>
          <Ionicons name="download-outline" size={18} color={THEME.teal} />
          <Text style={[type.label, { color: THEME.teal, flex: 1 }]}>{newRides === 1 ? "Ajouter 1 nouvelle attraction du parc" : `Ajouter les ${newRides} nouvelles attractions du parc`}</Text>
        </Pressable>
      ) : null}

      {ideas.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
          <Chip label="Tout" count={ideas.length} selected={filter === "all"} tone="gold" accessibilityLabel={`Tout, ${ideas.length}`} onPress={() => setFilter("all")} />
          {PARK_PRIORITIES.map((p) => (
            <Chip key={p.key} label={p.label} count={countFor(p.key)} selected={filter === p.key} tone={PRIORITY_TONE[p.key]} accessibilityLabel={`${p.label}, ${countFor(p.key)}`} onPress={() => setFilter(p.key)} />
          ))}
        </ScrollView>
      ) : null}

      {ideas.length === 0 ? (
        <EmptyState
          icon="rocket-outline"
          tone="pink"
          title="Aucune attraction"
          text={liveError ? "Impossible de charger la liste du parc pour l'instant. Réessayez, ou ajoutez vos attractions à la main." : "Chargez celles du parc ou ajoutez-les à la main."}
          action={liveError ? { label: "Réessayer", icon: "refresh", onPress: () => loadLive(true) } : undefined}
        />
      ) : shown.length === 0 ? (
        <Txt variant="subhead" style={styles.none}>
          Aucune attraction dans cette priorité.
        </Txt>
      ) : (
        groups.map((g) => (
          <View key={g.land || "_"} style={styles.section}>
            <View style={styles.sectionTitle}>
              <Text style={type.heading} accessibilityRole="header">
                {g.name}
              </Text>
              <Text style={[type.numeralSmall, { color: THEME.inkFaint }]}>{g.ideas.length}</Text>
            </View>
            <Group>
              {g.ideas.map((idea) => (
                <AttractionRow key={idea.id} idea={idea} trip={trip} ride={idea.qtId != null ? liveMap.get(idea.qtId) : null} placement={placed.get(idea.id)} onOpen={() => setEditing(idea)} />
              ))}
            </Group>
          </View>
        ))
      )}

      <ParkPickerSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} onPick={pickPark} />
      <HeightSheet
        visible={heightOpen}
        value={park.minHeightCm}
        onClose={() => setHeightOpen(false)}
        onSave={async (cm) => {
          setHeightOpen(false);
          await setMinHeight(trip.id, cm);
          onChange();
        }}
      />
      <AlertSheet visible={alertOpen} trip={trip} settings={alerts} watched={watchedCount} onClose={() => setAlertOpen(false)} onChange={setAlerts} />
      <AttractionSheet
        visible={editing !== undefined}
        trip={trip}
        idea={editing || null}
        onClose={() => setEditing(undefined)}
        onSaved={() => {
          setEditing(undefined);
          onChange();
        }}
      />
      <DayPickerModal visible={dayPickerOpen} trip={trip} title="Préparer quel jour ?" onClose={() => setDayPickerOpen(false)} onPick={prepareDay} />
    </TripScroll>
  );
}

function AttractionRow({ idea, trip, ride, placement, onOpen }) {
  const cat = getIdeaCategory(trip, idea.categoryId);
  const pr = priorityMeta(idea.priority);
  const skipped = idea.priority === "skip";
  const tall = tooTall(idea, trip);
  const waitLabel = ride ? (ride.open ? (ride.wait != null ? `, attente ${ride.wait} minutes` : "") : ", fermée") : "";
  return (
    <Row
      icon={skipped ? "close-circle-outline" : cat.icon}
      tone={skipped ? "neutral" : toneOfCategory(cat)}
      title={
        <Text style={[styles.name, skipped && { color: THEME.inkFaint }]} numberOfLines={2}>
          {idea.name}
        </Text>
      }
      accessibilityLabel={`${idea.name}, ${pr.label}${waitLabel}${placement ? `, jour ${placement.dayIndex + 1}` : ""}`}
      onPress={onOpen}
      right={<WaitBadge ride={ride} idea={idea} />}
    >
      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <View style={[styles.dot, { backgroundColor: pr.color }]} />
          <Text style={type.caption}>{pr.label}</Text>
        </View>
        {idea.showTime ? <Text style={type.numeralSmall}>{idea.showTime}</Text> : null}
        {idea.minHeightCm ? <Text style={type.numeralSmall}>{`≥ ${idea.minHeightCm} cm`}</Text> : null}
        {tall ? <Badge label="Trop petit" tone="stamp" /> : null}
        {placement ? <Badge label={`J${placement.dayIndex + 1}`} icon="checkmark" tone="teal" /> : null}
      </View>
    </Row>
  );
}

// Search in the list of Queue-Times parks (loaded once, kept 6 hours).
function ParkPickerSheet({ visible, onClose, onPick }) {
  const [parks, setParks] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    setQuery("");
    setError(null);
    fetchParks()
      .then((p) => !cancelled && setParks(p))
      .catch((e) => {
        logError(e, { source: "Queue-Times" });
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const results = useMemo(() => (parks ? searchParks(parks, query) : []), [parks, query]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Choisir le parc">
      <Field value={query} onChangeText={setQuery} placeholder="Disneyland Paris, Parc Astérix…" accessibilityLabel="Rechercher un parc" autoFocus autoCorrect={false} />
      {error ? (
        <Txt variant="subhead" color="stamp" style={styles.sheetText}>
          {error}
        </Txt>
      ) : !parks ? (
        <View style={styles.sheetLoading}>
          <ActivityIndicator color={THEME.teal} />
        </View>
      ) : !query.trim() ? (
        <>
          <Txt variant="caption" style={styles.sheetText}>
            Essayez :
          </Txt>
          <View style={styles.suggestions}>
            {SUGGESTIONS.map((s) => (
              <Chip key={s} label={s} selected={false} onPress={() => setQuery(s)} />
            ))}
          </View>
        </>
      ) : results.length === 0 ? (
        <Txt variant="subhead" style={styles.sheetText}>
          {`Aucun parc ne correspond à « ${query.trim()} ».`}
        </Txt>
      ) : (
        <Group style={styles.results}>
          {results.map((p) => (
            <Row
              key={p.qtId}
              icon="sparkles-outline"
              tone="pink"
              title={p.name}
              subtitle={[p.country, p.company && p.company !== p.name ? p.company : null].filter(Boolean).join(", ")}
              accessibilityLabel={`${p.name}${p.country ? ", " + p.country : ""}`}
              onPress={() => onPick(p)}
            />
          ))}
        </Group>
      )}
      <Button title="Annuler" variant="secondary" full onPress={onClose} style={styles.sheetCancel} />
    </Sheet>
  );
}

function HeightSheet({ visible, value, onClose, onSave }) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (visible) setText(value ? String(value) : "");
  }, [visible, value]);
  return (
    <Sheet visible={visible} onClose={onClose} title="Taille du plus petit du groupe">
      <Txt variant="subhead" style={styles.sheetText}>
        Les attractions qui demandent une taille plus haute sont écartées du parcours et marquées « Trop petit ».
      </Txt>
      <Field label="Taille en centimètres" value={text} onChangeText={(v) => setText(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="102" maxLength={3} autoFocus />
      <View style={styles.sheetButtons}>
        <Button title="Effacer" variant="secondary" style={styles.flex} onPress={() => onSave("")} />
        <Button title="Enregistrer" style={styles.flex} disabled={!text} onPress={() => onSave(text)} />
      </View>
    </Sheet>
  );
}

function AlertSheet({ visible, trip, settings, watched, onClose, onChange }) {
  const dated = hasAlertDays(trip);
  return (
    <Sheet visible={visible} onClose={onClose} title="Alerte de file courte">
      <Txt variant="subhead" style={styles.sheetText}>
        Une notification quand une attraction « Indispensable » ouverte passe sous l'attente que vous choisissez.
      </Txt>
      <Group>
        <Row
          icon="notifications-outline"
          tone="teal"
          title="Me prévenir"
          selected={settings.on}
          accessibilityLabel={`Me prévenir : ${settings.on ? "activé" : "désactivé"}`}
          onPress={() => onChange({ on: !settings.on })}
          // The row is the touch target; the switch only shows the state.
          right={
            <View pointerEvents="none">
              <Switch value={settings.on} trackColor={{ false: THEME.bgRaised, true: THEME.teal }} thumbColor={THEME.ink} ios_backgroundColor={THEME.bgRaised} />
            </View>
          }
        />
      </Group>
      <Txt variant="caption" color="inkFaint" style={styles.alertLabel}>
        Attente maximale
      </Txt>
      <View style={styles.alertChips}>
        {ALERT_CHOICES.map((m) => (
          <Chip key={m} label={`${m} min`} selected={settings.maxWait === m} tone="teal" accessibilityLabel={`Attente maximale ${m} minutes`} onPress={() => onChange({ maxWait: m })} />
        ))}
      </View>
      <Txt variant="caption" color="inkFaint" style={styles.alertNote}>
        {watched > 0 ? `${plural(watched, "attraction surveillée", "attractions surveillées")}.` : "Aucune attraction surveillée : marquez-en comme « Indispensable »."}
        {" "}
        Les attractions trop hautes pour le groupe et déjà faites sont ignorées.
      </Txt>
      <Txt variant="caption" color="inkFaint" style={styles.alertNote}>
        {dated
          ? "Application fermée, le téléphone vérifie environ toutes les 15 à 30 minutes, les jours du voyage entre 8 h et 23 h. Il peut espacer les vérifications en économie d'énergie."
          : "Sans dates de voyage, l'alerte ne fonctionne que lorsque l'application est ouverte."}
      </Txt>
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1 },
  alertLabel: { marginTop: space.lg, marginBottom: space.sm },
  alertChips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  alertNote: { marginTop: space.md },
  scrollContent: { padding: layout.gutter, paddingBottom: space.xxxl },
  parkHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  parkTitle: { flex: 1, gap: 2 },
  liveRow: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.lg },
  liveText: { flex: 1, gap: 2 },
  gap: { marginTop: space.md },
  settings: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tallNote: { marginTop: space.sm },
  listHead: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.xl },
  listCount: { flex: 1 },
  newRides: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: layout.minTouch, marginTop: space.xs },
  notice: { textAlign: "center", marginTop: space.md },
  chipScroll: { flexGrow: 0, marginHorizontal: -layout.gutter, marginTop: space.lg },
  chipRow: { paddingHorizontal: layout.gutter, gap: space.sm, alignItems: "center" },
  none: { marginTop: space.xl, textAlign: "center" },
  section: { marginTop: space.xl },
  sectionTitle: { flexDirection: "row", alignItems: "baseline", gap: space.sm, marginBottom: space.md },
  name: { ...type.name },
  metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space.md, rowGap: space.xs, marginTop: space.xs },
  metaItem: { flexDirection: "row", alignItems: "center", gap: space.xs + 2 },
  dot: { width: space.sm, height: space.sm, borderRadius: radius.full },
  sheetText: { marginTop: space.md, marginBottom: space.sm },
  sheetLoading: { paddingVertical: space.xl, alignItems: "center" },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  results: { marginTop: space.md, backgroundColor: THEME.bgCardAlt },
  sheetCancel: { marginTop: space.md },
  sheetButtons: { flexDirection: "row", gap: space.md },
}));
