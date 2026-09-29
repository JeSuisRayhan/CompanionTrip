import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { View, Text, ScrollView, ActivityIndicator, Linking, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import { THEME, TONES, space, layout, radius, type } from "../lib/theme";
import { getTrip } from "../lib/trips";
import { formatIdeaDuration, placeIdeaOnDay } from "../lib/ideas";
import { buildMapModel, pinsForFilter, filterOptions, externalMapUrl, locateIdeas, saveIdeaPositions } from "../lib/map";
import TileMap from "../components/TileMap";
import DayPickerModal from "../components/DayPickerModal";
import { Txt, Button, IconButton, Chip, Badge, Surface, Thumb, ProgressBar, EmptyState, BackHeader } from "../components/ui";

// The pin stores its colour; the tone with the same foreground gives the tinted pair.
function toneOfColor(color) {
  return Object.keys(TONES).find((k) => TONES[k].fg === color) || "neutral";
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// "Construire mon voyage", phase 4: the trip on a map. Every idea with a
// position is a pin; a day shows its steps in order with the route between
// them. Ideas with no position can be looked up in one go.
export default function TripMapScreen({ route, navigation }) {
  const { tripId } = route.params;
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(route.params.dayId || "all");
  const [selectedId, setSelectedId] = useState(null);
  const [pickerIdea, setPickerIdea] = useState(null);
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

  const model = useMemo(() => (trip ? buildMapModel(trip) : null), [trip]);
  const options = useMemo(() => (model ? filterOptions(model) : []), [model]);
  const activeFilter = options.some((o) => o.id === filter) ? filter : "all";
  const shown = useMemo(() => (model ? pinsForFilter(model, activeFilter) : { pins: [], route: [], day: null }), [model, activeFilter]);
  const selected = model && selectedId ? model.pins.find((p) => p.id === selectedId) : null;

  const back = () => navigation.goBack();
  const header = <BackHeader title="Carte" subtitle={trip ? trip.name : undefined} onBack={back} />;

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
    const r = await locateIdeas(trip, {
      onProgress: (done, total) => mounted.current && setLocating({ done, total }),
      shouldStop: () => stopRef.current,
    });
    await saveIdeaPositions(trip.id, r.found);
    if (!mounted.current) return;
    const bits = [];
    if (r.foundCount) bits.push(plural(r.foundCount, "idée localisée", "idées localisées"));
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
  const showBanner = unlocatedCount > 0 || !!result || !!locating;
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
                {locating ? `Recherche des positions, ${locating.done}/${locating.total}` : result || plural(unlocatedCount, "idée sans position", "idées sans position")}
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
              <Button title="Localiser" size="sm" tone="gold" accessibilityLabel={`Localiser ${plural(unlocatedCount, "idée", "idées")} sur la carte`} onPress={onLocate} />
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
              (trip.ideas || []).length
                ? "Vos idées n'ont pas encore de position. Lancez la recherche ci-dessus, ou choisissez une adresse dans chaque fiche."
                : "Ajoutez des idées avec une adresse : elles apparaissent ici."
            }
            action={(trip.ideas || []).length ? undefined : { label: "Ajouter une idée", icon: "add", onPress: () => navigation.navigate("IdeaEditor", { tripId: trip.id }) }}
          />
        </View>
      ) : (
        <TileMap pins={shown.pins} route={shown.route} selectedId={selectedId} onSelect={setSelectedId} fitKey={`${activeFilter}:${shown.pins.length}`} style={styles.map} />
      )}

      {selected ? (
        <PinCard
          pin={selected}
          onClose={() => setSelectedId(null)}
          onPlace={() => setPickerIdea({ id: selected.ideaId, name: selected.name })}
          onBook={() =>
            navigation.navigate("Hotels", { tripId: trip.id, prefill: { name: selected.name, address: selected.address, ideaId: selected.ideaId, lat: selected.lat, lng: selected.lng } })
          }
          onOpenDay={() => navigation.navigate("DayDetail", { tripId: trip.id, dayId: selected.dayId })}
          onEdit={() => navigation.navigate("IdeaEditor", { tripId: trip.id, ideaId: selected.ideaId })}
          onGo={() => Linking.openURL(externalMapUrl(selected, Platform.OS))}
        />
      ) : null}

      <DayPickerModal visible={!!pickerIdea} trip={trip} title={pickerIdea ? `Placer « ${pickerIdea.name} »` : ""} onClose={() => setPickerIdea(null)} onPick={onPlace} />
    </SafeAreaView>
  );
}

// The selected pin: what it is, where it is in the programme, what to do next.
function PinCard({ pin, onClose, onPlace, onBook, onOpenDay, onEdit, onGo }) {
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
        {placed ? <Badge label={dayLabel} icon="checkmark" tone="teal" /> : <Badge label="À placer" tone="gold" />}
        {pin.priorityLabel ? (
          <View style={styles.metaItem}>
            <View style={[styles.dot, { backgroundColor: pin.priority === "must" ? THEME.stamp : pin.priority === "want" ? THEME.gold : THEME.inkMuted }]} />
            <Text style={type.caption}>{pin.priorityLabel}</Text>
          </View>
        ) : null}
        {duration ? <Text style={type.numeralSmall}>{duration}</Text> : null}
      </View>

      <View style={styles.cardActions}>
        {!placed && pin.kind === "idea" ? (
          pin.isHotel ? <Button title="Réserver" size="sm" tone="gold" style={styles.action} onPress={onBook} /> : <Button title="Placer" size="sm" tone="gold" style={styles.action} onPress={onPlace} />
        ) : null}
        {placed ? <Button title="Voir le jour" size="sm" variant="secondary" style={styles.action} onPress={onOpenDay} /> : null}
        {pin.kind === "idea" ? <Button title="Modifier" size="sm" variant="secondary" style={styles.action} onPress={onEdit} /> : null}
        <Button title="Y aller" icon="navigate-outline" size="sm" variant="secondary" style={styles.action} accessibilityLabel={`Ouvrir ${pin.name} dans une application de cartes`} onPress={onGo} />
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
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
});
