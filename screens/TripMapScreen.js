import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { View, Text, ScrollView, ActivityIndicator, Linking, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import { THEME, TONES, space, layout, radius, type, themedStyles } from "../lib/theme";
import { getTrip } from "../lib/trips";
import { previewTrip } from "../lib/planner";
import { formatIdeaDuration, placeIdeaOnDay } from "../lib/ideas";
import { buildMapModel, pinsForFilter, filterOptions, externalMapUrl, locateIdeas, saveIdeaPositions } from "../lib/map";
import { isParkTrip, hasParkPosition, locateParkAttractions } from "../lib/park";
import { withParkSteps } from "../lib/parkPlanner";
import { fetchQueueTimes, liveByRideId } from "../lib/queueTimes";
import TileMap from "../components/TileMap";
import DayPickerModal from "../components/DayPickerModal";
import AttractionSheet from "../components/AttractionSheet";
import WaitBadge from "../components/WaitBadge";
import { Txt, Button, IconButton, Chip, Badge, Surface, Thumb, ProgressBar, EmptyState, BackHeader } from "../components/ui";

// The pin stores its colour; the tone with the same foreground gives the tinted pair.
function toneOfColor(color) {
  return Object.keys(TONES).find((k) => TONES[k].fg === color) || "neutral";
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const PARK_MAX_KM = 5; // a park is small: a lookup result farther than this is a namesake

// "Construire mon voyage", phase 4: the trip on a map. Every idea with a
// position is a pin; a day shows its steps in order with the route between
// them. Ideas with no position can be looked up in one go.
//
// With route.params.plan ({ assign, order }) it shows the proposed planning
// instead, before it is added: same map, read-only. route.params.parkPlan
// ({ dayId, steps }) does the same for a park day.
//
// On a park trip it is the park's map: attractions instead of ideas, positions
// looked up in the park first (OpenStreetMap), live queues on the pin card.
export default function TripMapScreen({ route, navigation }) {
  const { tripId, plan, parkPlan } = route.params;
  const isPreview = !!(plan || parkPlan);
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(route.params.dayId || "all");
  const [selectedId, setSelectedId] = useState(null);
  const [pickerIdea, setPickerIdea] = useState(null);
  const [editing, setEditing] = useState(null); // attraction being edited (park trips)
  const [live, setLive] = useState(null); // live queues by ride id (park trips)
  const [locating, setLocating] = useState(null); // { done, total } while searching
  const [result, setResult] = useState(null); // sentence after a search
  const stopRef = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopRef.current = true; // leaving the screen ends the search
    };
  }, []);

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

  const isPark = isParkTrip(trip);
  const qtId = trip && trip.park ? trip.park.qtId : null;

  // Live queues for the pin cards: from the cache when the park tab just loaded them, silent when offline.
  useEffect(() => {
    if (qtId == null) return undefined;
    let cancelled = false;
    fetchQueueTimes(qtId)
      .then((d) => !cancelled && setLive(liveByRideId(d)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [qtId]);

  const shownTrip = useMemo(() => {
    if (!trip) return trip;
    if (parkPlan) return withParkSteps(trip, parkPlan.dayId, parkPlan.steps);
    return plan ? previewTrip(trip, plan.assign, plan.order) : trip;
  }, [trip, plan, parkPlan]);
  const model = useMemo(() => (shownTrip ? buildMapModel(shownTrip) : null), [shownTrip]);
  const options = useMemo(() => (model ? filterOptions(model) : []), [model]);
  const activeFilter = options.some((o) => o.id === filter) ? filter : "all";
  const shown = useMemo(() => (model ? pinsForFilter(model, activeFilter) : { pins: [], route: [], day: null }), [model, activeFilter]);
  const selected = model && selectedId ? model.pins.find((p) => p.id === selectedId) : null;

  const back = () => navigation.goBack();
  const header = <BackHeader title={isPreview ? (parkPlan ? "Carte du parcours" : "Carte du planning") : isPark ? "Plan du parc" : "Carte"} subtitle={trip ? (isPark && trip.park ? trip.park.name : trip.name) : undefined} onBack={back} />;

  if (loading || !trip) {
    return (
      <SafeAreaView style={styles.safe}>
        {header}
        <View style={styles.center}>
          {loading ? (
            <ActivityIndicator color={THEME.teal} />
          ) : (
            <EmptyState icon="alert-circle-outline" title="Voyage introuvable" text="Ce voyage n'existe plus sur cet appareil." action={{ label: "Retour", onPress: back }} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  function pickFilter(id) {
    setFilter(id);
    setSelectedId(null);
  }

  async function onLocate() {
    stopRef.current = false;
    setResult(null);
    setLocating({ done: 0, total: model.unlocated.length });
    // In a park, OpenStreetMap knows the rides by name: one request places most of them.
    let fromPark = 0;
    let current = trip;
    if (isPark && hasParkPosition(trip.park)) {
      const p = await locateParkAttractions(trip);
      fromPark = p.foundCount;
      await saveIdeaPositions(trip.id, p.found);
      current = await getTrip(trip.id);
    }
    const rest = current.ideas.filter((i) => !Number.isFinite(i.lat) || !Number.isFinite(i.lng)).length;
    const r = rest
      ? await locateIdeas(current, {
          onProgress: (done, total) => mounted.current && setLocating({ done, total }),
          shouldStop: () => stopRef.current,
          ...(isPark && hasParkPosition(current.park) ? { near: current.park, maxKm: PARK_MAX_KM, fallbackCity: current.park.name } : {}),
        })
      : { found: {}, foundCount: 0, missing: 0, stopped: false, error: null };
    await saveIdeaPositions(trip.id, r.found);
    if (!mounted.current) return;
    const noun = isPark ? ["attraction localisée", "attractions localisées"] : ["idée localisée", "idées localisées"];
    const bits = [];
    if (r.foundCount + fromPark) bits.push(plural(r.foundCount + fromPark, noun[0], noun[1]));
    if (r.missing) bits.push(plural(r.missing, "introuvable", "introuvables"));
    let sentence = bits.join(", ") || "Aucune position trouvée";
    if (r.error) sentence += `. ${r.error.message}`;
    else if (r.stopped) sentence += ". Recherche arrêtée.";
    setResult(sentence);
    setLocating(null);
    setTrip(await getTrip(trip.id));
  }

  async function onPlace(dayId) {
    const idea = pickerIdea;
    setPickerIdea(null);
    await placeIdeaOnDay(trip.id, idea.id, dayId);
    if (activeFilter === "todo") setFilter("all"); // it is no longer "à placer"
    setTrip(await getTrip(trip.id));
  }

  const unlocatedCount = model.unlocated.length;
  const unlocatedLabel = isPark ? plural(unlocatedCount, "attraction sans position", "attractions sans position") : plural(unlocatedCount, "idée sans position", "idées sans position");
  const showBanner = !isPreview && (unlocatedCount > 0 || !!result || !!locating);
  const nothingToShow = model.pins.length === 0;

  return (
    <SafeAreaView style={styles.safe}>
      {header}

      {options.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
          {options.map((o) => (
            <Chip key={o.id} label={o.label} count={o.count} selected={activeFilter === o.id} tone="gold" accessibilityLabel={`${o.label}, ${o.count}`} onPress={() => pickFilter(o.id)} />
          ))}
        </ScrollView>
      ) : null}

      {isPreview ? (
        <Txt variant="caption" color="inkFaint" style={styles.dayNote}>
          Aperçu : ces étapes ne sont pas encore ajoutées au programme.
        </Txt>
      ) : null}

      {shown.day && shown.day.missing > 0 ? (
        <Txt variant="caption" color="inkFaint" style={styles.dayNote}>
          {`${plural(shown.day.missing, "étape sans position n'est", "étapes sans position ne sont")} pas sur la carte.`}
        </Txt>
      ) : null}

      {showBanner ? (
        <Surface tone="raised" r="lg" pad="md" style={styles.banner}>
          <View style={styles.bannerRow}>
            <Ionicons name={result && !unlocatedCount ? "checkmark-circle" : "location-outline"} size={20} color={result && !unlocatedCount ? THEME.teal : THEME.gold} />
            <View style={styles.bannerText}>
              <Txt variant="label" numberOfLines={2}>
                {locating ? (locating.done === 0 && isPark ? "Recherche des positions dans le parc…" : `Recherche des positions, ${locating.done}/${locating.total}`) : result || unlocatedLabel}
              </Txt>
              {!locating && !result ? (
                <Txt variant="caption" numberOfLines={2}>
                  Elles ne sont pas sur la carte.
                </Txt>
              ) : null}
            </View>
            {locating ? (
              <Button title="Arrêter" size="sm" variant="secondary" onPress={() => (stopRef.current = true)} />
            ) : unlocatedCount > 0 ? (
              <Button title="Localiser" size="sm" tone="gold" accessibilityLabel={`Localiser ${plural(unlocatedCount, isPark ? "attraction" : "idée", isPark ? "attractions" : "idées")} sur la carte`} onPress={onLocate} />
            ) : null}
          </View>
          {locating ? <ProgressBar value={locating.total ? locating.done / locating.total : 0} tone="gold" style={styles.bannerProgress} /> : null}
        </Surface>
      ) : null}

      {nothingToShow ? (
        <View style={styles.center}>
          <EmptyState
            icon="map-outline"
            tone="gold"
            title="Aucun lieu sur la carte"
            text={
              isPreview
                ? isPark
                  ? "Les attractions de ce parcours n'ont pas de position. Localisez-les depuis le plan du parc (onglet Attractions)."
                  : "Les idées de ce planning n'ont pas de position. Localisez-les depuis la carte du voyage (onglet Idées)."
                : isPark
                ? "Les attractions n'ont pas encore de position. Lancez la recherche ci-dessus : elles sont cherchées dans le parc sur OpenStreetMap."
                : (trip.ideas || []).length
                ? "Vos idées n'ont pas encore de position. Lancez la recherche ci-dessus, ou choisissez une adresse dans chaque fiche."
                : "Ajoutez des idées avec une adresse : elles apparaissent ici."
            }
            action={isPreview || isPark || (trip.ideas || []).length ? undefined : { label: "Ajouter une idée", icon: "add", onPress: () => navigation.navigate("IdeaEditor", { tripId: trip.id }) }}
          />
        </View>
      ) : (
        <TileMap pins={shown.pins} route={shown.route} selectedId={selectedId} onSelect={setSelectedId} fitKey={`${activeFilter}:${shown.pins.length}`} style={styles.map} />
      )}

      {selected ? (
        <PinCard
          pin={selected}
          ride={isPark && selected.ideaId ? live && live.get((trip.ideas.find((i) => i.id === selected.ideaId) || {}).qtId) : null}
          idea={isPark && selected.ideaId ? trip.ideas.find((i) => i.id === selected.ideaId) : null}
          readOnly={isPreview}
          onClose={() => setSelectedId(null)}
          onPlace={() => setPickerIdea({ id: selected.ideaId, name: selected.name })}
          onBook={() =>
            navigation.navigate("Hotels", { tripId: trip.id, prefill: { name: selected.name, address: selected.address, ideaId: selected.ideaId, lat: selected.lat, lng: selected.lng } })
          }
          onOpenDay={() => navigation.navigate("DayDetail", { tripId: trip.id, dayId: selected.dayId })}
          onEdit={() => (isPark ? setEditing(trip.ideas.find((i) => i.id === selected.ideaId) || null) : navigation.navigate("IdeaEditor", { tripId: trip.id, ideaId: selected.ideaId }))}
          onGo={() => Linking.openURL(externalMapUrl(selected, Platform.OS))}
        />
      ) : null}

      {isPark ? (
        <AttractionSheet
          visible={!!editing}
          trip={trip}
          idea={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            setSelectedId(null);
            setTrip(await getTrip(trip.id));
          }}
        />
      ) : null}

      <DayPickerModal visible={!!pickerIdea} trip={trip} title={pickerIdea ? `Placer « ${pickerIdea.name} »` : ""} onClose={() => setPickerIdea(null)} onPick={onPlace} />
    </SafeAreaView>
  );
}

// The selected pin: what it is, where it is in the programme, what to do next.
function PinCard({ pin, ride, idea, readOnly, onClose, onPlace, onBook, onOpenDay, onEdit, onGo }) {
  const placed = pin.dayId != null;
  const duration = pin.isHotel ? null : formatIdeaDuration(pin.durationMin);
  const dayLabel = placed ? `Jour ${pin.dayIndex + 1}${pin.time ? ` · ${pin.time}` : ""}` : null;

  return (
    <Surface tone="card" r="lg" pad="lg" style={styles.card}>
      <View style={styles.cardHead}>
        <Thumb icon={pin.icon} tone={toneOfColor(pin.color)} size={44} />
        <View style={styles.cardTitle}>
          <Txt variant="name" numberOfLines={2}>
            {pin.name}
          </Txt>
          {pin.address ? (
            <Txt variant="subhead" numberOfLines={1}>
              {pin.address}
            </Txt>
          ) : null}
        </View>
        <IconButton icon="close" label="Fermer la fiche" onPress={onClose} />
      </View>

      <View style={styles.cardMeta}>
        {placed ? <Badge label={dayLabel} icon={readOnly ? undefined : "checkmark"} tone={readOnly ? "gold" : "teal"} /> : <Badge label="À placer" tone="gold" />}
        {pin.priorityLabel ? (
          <View style={styles.metaItem}>
            <View style={[styles.dot, { backgroundColor: pin.priority === "must" ? THEME.stamp : pin.priority === "want" ? THEME.gold : THEME.inkMuted }]} />
            <Text style={type.caption}>{pin.priorityLabel}</Text>
          </View>
        ) : null}
        {duration && !idea ? <Text style={type.numeralSmall}>{duration}</Text> : null}
        {idea ? <WaitBadge ride={ride || null} idea={idea} /> : null}
      </View>

      <View style={styles.cardActions}>
        {!readOnly && !placed && pin.kind === "idea" ? (
          pin.isHotel ? <Button title="Réserver" size="sm" tone="gold" style={styles.action} onPress={onBook} /> : <Button title="Placer" size="sm" tone="gold" style={styles.action} onPress={onPlace} />
        ) : null}
        {!readOnly && placed ? <Button title="Voir le jour" size="sm" variant="secondary" style={styles.action} onPress={onOpenDay} /> : null}
        {!readOnly && pin.kind === "idea" ? <Button title="Modifier" size="sm" variant="secondary" style={styles.action} onPress={onEdit} /> : null}
        <Button title="Y aller" icon="navigate-outline" size="sm" variant="secondary" style={styles.action} accessibilityLabel={`Ouvrir ${pin.name} dans une application de cartes`} onPress={onGo} />
      </View>
    </Surface>
  );
}

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: layout.gutter },
  chipScroll: { flexGrow: 0, marginTop: space.sm },
  chipRow: { paddingHorizontal: layout.gutter, gap: space.sm, alignItems: "center" },
  dayNote: { marginHorizontal: layout.gutter, marginTop: space.sm },
  banner: { marginHorizontal: layout.gutter, marginTop: space.md },
  bannerRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  bannerText: { flex: 1, gap: 2 },
  bannerProgress: { marginTop: space.md },
  map: { marginTop: space.md },
  card: { marginHorizontal: layout.gutter, marginTop: space.md, marginBottom: space.md, gap: space.md },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  cardTitle: { flex: 1, gap: 2 },
  cardMeta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space.md, rowGap: space.xs },
  metaItem: { flexDirection: "row", alignItems: "center", gap: space.xs + 2 },
  dot: { width: space.sm, height: space.sm, borderRadius: radius.full },
  cardActions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  action: { flexGrow: 1 },
}));
