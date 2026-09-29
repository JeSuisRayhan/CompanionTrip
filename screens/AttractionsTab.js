import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { THEME, TONES, space, layout, radius, type } from "../lib/theme";
import { PARK_PRIORITIES, getIdeaCategory, placementIndex, priorityMeta } from "../lib/ideas";
import { setPark, setMinHeight, tooTall, groupByLand, attractionInputs, importParkAttractions } from "../lib/park";
import { fetchParks, searchParks, fetchQueueTimes, liveByRideId, liveSummary, latestUpdate, ageLabel, QUEUE_TIMES_CREDIT } from "../lib/queueTimes";
import AttractionSheet from "../components/AttractionSheet";
import WaitBadge from "../components/WaitBadge";
import DayPickerModal from "../components/DayPickerModal";
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
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new, idea = editing
  const [notice, setNotice] = useState(null);
  const mounted = useRef(true);
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
        return data;
      } catch (e) {
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
    // an empty list is filled straight away: that is what choosing a park is for
    if (!ideas.length) {
      try {
        const data = await fetchQueueTimes(p.qtId, { force: true });
        const r = await importParkAttractions(trip.id, data.rides);
        if (mounted.current) setNotice(`${plural(r.added, "attraction ajoutée", "attractions ajoutées")}.`);
      } catch (e) {
        if (mounted.current) setNotice(e.message);
      }
    }
    onChange();
  }

  function prepareDay(dayId) {
    setDayPickerOpen(false);
    navigation.navigate("ParkPlan", { tripId: trip.id, dayId });
  }

  const shown = filter === "all" ? ideas : ideas.filter((i) => i.priority === filter);
  const groups = groupByLand(shown);
  const countFor = (key) => ideas.filter((i) => i.priority === key).length;

  if (!park) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <EmptyState
          icon="sparkles-outline"
          tone="pink"
          title="Choisissez votre parc"
          text="La liste des attractions et les temps d'attente en direct viennent de Queue-Times.com. Vous pourrez ensuite dire lesquelles comptent le plus et préparer votre journée."
          action={{ label: "Choisir le parc", icon: "search", onPress: () => setPickerOpen(true) }}
        />
        <ParkPickerSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} onPick={pickPark} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
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
                <Txt variant="label" numberOfLines={2}>
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

      <Pressable
        onPress={() => Linking.openURL(QUEUE_TIMES_CREDIT.url)}
        accessibilityRole="link"
        accessibilityLabel={`${QUEUE_TIMES_CREDIT.text}, ouvrir queue-times.com`}
        style={({ pressed }) => [styles.credit, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="open-outline" size={16} color={THEME.teal} />
        <Text style={[type.label, { color: THEME.teal }]}>{QUEUE_TIMES_CREDIT.text}</Text>
      </Pressable>

      {ideas.length > 0 && planCount > 0 && trip.days.length > 0 ? (
        <Button
          title="Préparer ma journée"
          icon="sparkles-outline"
          tone="gold"
          full
          accessibilityLabel={`Préparer ma journée avec ${plural(planCount, "attraction à placer", "attractions à placer")}`}
          onPress={() => (trip.days.length === 1 ? prepareDay(trip.days[0].id) : setDayPickerOpen(true))}
        />
      ) : null}

      {newRides > 0 ? (
        <Button
          title={ideas.length ? `Ajouter les ${newRides} nouvelles du parc` : `Charger les ${newRides} attractions`}
          icon="download-outline"
          tone={ideas.length ? "teal" : "gold"}
          full
          style={styles.gap}
          onPress={addFromPark}
        />
      ) : null}

      <View style={[styles.actionRow, styles.gap]}>
        <Button title="Plan du parc" icon="map-outline" variant="secondary" style={styles.flex} accessibilityLabel="Voir les attractions sur le plan du parc" onPress={() => navigation.navigate("TripMap", { tripId: trip.id })} />
        <Button title="Ajouter" icon="add" variant="secondary" style={styles.flex} accessibilityLabel="Ajouter une attraction à la main" onPress={() => setEditing(null)} />
      </View>

      {notice ? (
        <Txt variant="caption" color="inkFaint" style={styles.notice}>
          {notice}
        </Txt>
      ) : null}

      <Group style={styles.gap}>
        <Row
          icon="resize-outline"
          tone="blue"
          title="Taille du plus petit du groupe"
          subtitle={park.minHeightCm ? `${park.minHeightCm} cm` : "Non renseignée"}
          right={tallCount > 0 ? <Badge label={`${tallCount} trop haute${tallCount !== 1 ? "s" : ""}`} tone="stamp" /> : null}
          chevron
          accessibilityLabel={`Taille du plus petit du groupe, ${park.minHeightCm ? park.minHeightCm + " centimètres" : "non renseignée"}`}
          onPress={() => setHeightOpen(true)}
        />
      </Group>

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
    </ScrollView>
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
      .catch((e) => !cancelled && setError(e.message));
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { padding: layout.gutter, paddingBottom: space.xxxl },
  parkHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  parkTitle: { flex: 1, gap: 2 },
  liveRow: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.lg },
  liveText: { flex: 1, gap: 2 },
  credit: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, minHeight: layout.minTouch, marginBottom: space.sm },
  gap: { marginTop: space.md },
  actionRow: { flexDirection: "row", gap: space.sm },
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
});
