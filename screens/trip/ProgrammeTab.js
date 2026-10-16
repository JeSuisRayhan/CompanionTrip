// "Programme": the days of the trip as a route, then the ideas still to place.
import React, { useState, useMemo } from "react";
import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import Icon from "../../components/Icon";
import { THEME, space, type, themedStyles, withAlpha, FONTS } from "../../lib/theme";
import { resolveDayDate, tripRange, tripStatus, isoDate, formatRangeLong, formatDateLabel } from "../../lib/dates";
import { duplicateDay, moveDay, deleteDay, addDay, deleteDayMessage, updateTripSettings } from "../../lib/trips";
import { addDaysISO } from "../../lib/dates";
import { placementIndex, sortIdeas, getIdeaCategory, ideaAddressLine, formatIdeaDuration, placeIdeaOnDay } from "../../lib/ideas";
import { detectCountry } from "../../lib/countries";
import { shareTripAsText, shareTripAsICS } from "../../lib/share";
import { exportTripFile } from "../../lib/backup";
import { useTripInk } from "../../lib/tripInk";
import { dayState } from "../../lib/dayState";
import { Group, Row, Thumb, Button, Field, EmptyState, Sheet, ActionSheet, Stamp } from "../../components/ui";
import { Section, PageHead, TopButton, DayNum, MAIN } from "../../components/mix";
import CountrySheet from "../../components/CountrySheet";
import DayPickerModal from "../../components/DayPickerModal";

// "avion" -> "vol", "voiture" -> "trajet": what a step is, in one word, for the line under a day.
const MODE_WORD = { avion: "vol", train: "train", bus: "bus", bateau: "bateau", voiture: "trajet", autre: "trajet" };
function stepWord(a) {
  if (a.type === "transport") return MODE_WORD[a.transportMode] || "trajet";
  if (a.type === "hotel") return "hôtel";
  if (a.type === "repas") return "repas";
  return a.title;
}
function daySubtitle(day, isPark) {
  const acts = day.activities || [];
  if (!acts.length) return "Aucune étape";
  const words = [];
  [...acts].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99")).forEach((a) => {
    const w = stepWord(a);
    if (w && !words.includes(w)) words.push(w);
  });
  const count = isPark ? `${acts.filter((a) => a.done).length}/${acts.length} faites` : `${acts.length} étape${acts.length > 1 ? "s" : ""}`;
  return `${count} · ${words.slice(0, 3).join(", ")}`;
}

function DayRow({ day, index, date, state, isPark, linked, onPress, onLongPress }) {
  const ink = useTripInk();
  const label = `Jour ${index + 1}, ${day.title}${date ? ", " + formatDateLabel(date) : ""}${state === "today" ? ", aujourd'hui" : state === "done" ? ", fait" : ""}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Appui long : déplacer, dupliquer, supprimer"
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [styles.dayRow, pressed && { backgroundColor: THEME.pressed }]}
    >
      <DayNum date={date} index={index} state={state} linked={linked} />
      <View style={styles.dayText}>
        <View style={styles.dayTitleRow}>
          <Text style={[type.name, { flexShrink: 1 }]} numberOfLines={2}>{day.title}</Text>
          {state === "today" ? <Stamp label="Aujourd'hui" tone="gold" small decorative tilt={0} /> : null}
          {day.dayType === "flight" ? <Icon name="airplane" size={15} color={THEME.blue} /> : null}
          {day.dayType === "park" ? <Icon name="sparkles" size={15} color={THEME.pink} /> : null}
        </View>
        <Text style={type.subhead} numberOfLines={1}>{daySubtitle(day, isPark)}</Text>
      </View>
      <Icon name="chevron-forward" size={18} color={THEME.inkFaint} />
    </Pressable>
  );
}

export default function ProgrammeTab({ trip, navigation, onChange, onOpenTab, onShiftDates }) {
  const ink = useTripInk();
  const isPark = trip.tripType === "park";
  const today = isoDate(new Date());
  const [menuDay, setMenuDay] = useState(null); // { day, index } while the day menu is open
  const [menuOpen, setMenuOpen] = useState(false); // "Ce voyage"
  const [countryOpen, setCountryOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pickerIdea, setPickerIdea] = useState(null);

  const { start, end } = tripRange(trip);
  const q = query.trim().toLowerCase();
  const country = detectCountry(trip);
  const stepCount = trip.days.reduce((n, d) => n + d.activities.length, 0);
  const hasMap = !isPark && (trip.days.some((d) => d.activities.length > 0) || (trip.ideas || []).length > 0);
  const status = tripStatus(trip, today);

  const placed = useMemo(() => placementIndex(trip), [trip]);
  const loose = sortIdeas((trip.ideas || []).filter((i) => !placed.has(i.id) && getIdeaCategory(trip, i.categoryId).activityType !== "hotel"));
  const shownIdeas = loose.slice(0, 3);

  const days = trip.days
    .map((day, index) => ({ day, index, date: resolveDayDate(trip, day, index) }))
    .filter(({ day, date }) => {
      if (!q) return true;
      const dateLabel = date ? formatDateLabel(date) : "";
      return day.title.toLowerCase().includes(q) || dateLabel.toLowerCase().includes(q) || day.activities.some((a) => a.title.toLowerCase().includes(q));
    });

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
  function confirmDeleteDay(day) {
    Alert.alert(`Supprimer « ${day.title} » ?`, deleteDayMessage(day), [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          await deleteDay(trip.id, day.id);
          onChange();
        },
      },
    ]);
  }
  async function addOneDay() {
    const lastIndex = trip.days.length - 1;
    const lastDate = lastIndex >= 0 ? resolveDayDate(trip, trip.days[lastIndex], lastIndex) : null;
    await addDay(trip.id, { title: `Jour ${trip.days.length + 1}`, date: lastDate ? addDaysISO(lastDate, 1) : null });
    onChange();
  }

  const sub = [`${trip.days.length} jour${trip.days.length !== 1 ? "s" : ""}`, stepCount ? `${stepCount} étape${stepCount !== 1 ? "s" : ""}` : null, start ? formatRangeLong(start, end) : null].filter(Boolean).join(" · ");

  return (
    <ScrollView contentContainerStyle={MAIN} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <PageHead title="Programme" sub={sub} right={<TopButton icon="ellipsis-horizontal" label="Plus d'actions pour ce voyage" plain onPress={() => setMenuOpen(true)} style={{ marginRight: -8 }} />} />

      {trip.days.length >= 6 && !isPark ? (
        <Field placeholder="Rechercher un jour, une étape…" value={query} onChangeText={setQuery} style={{ marginBottom: 0 }} accessibilityLabel="Rechercher" left={<Icon name="search" size={18} color={THEME.inkFaint} style={{ marginRight: space.sm }} />} />
      ) : null}

      <Section title="Jours" count={trip.days.length || null}>
        {days.length === 0 ? (
          q ? (
            <EmptyState icon="search-outline" title="Aucun résultat" text={`Aucun jour ne correspond à « ${query} ».`} />
          ) : (
            <EmptyState icon="calendar-outline" tone="gold" title="Aucun jour pour l'instant" action={{ label: "Ajouter un jour", icon: "add", onPress: addOneDay }} />
          )
        ) : (
          <Group separators={false}>
            {days.map(({ day, index, date }, i) => (
              <DayRow
                key={day.id}
                day={day}
                index={index}
                date={date}
                state={dayState(day, date, today)}
                isPark={isPark}
                linked={i < days.length - 1}
                onPress={() => navigation.navigate("DayDetail", { tripId: trip.id, dayId: day.id })}
                onLongPress={!q ? () => setMenuDay({ day, index }) : undefined}
              />
            ))}
            {!q ? (
              <Row
                lead={
                  <View style={styles.dashTile}>
                    <Icon name="add" size={24} color={THEME.inkMuted} />
                  </View>
                }
                title="Ajouter un jour"
                onPress={addOneDay}
                style={styles.addRow}
              />
            ) : null}
          </Group>
        )}
      </Section>

      {!isPark ? (
        <Section title="Idées à placer" count={loose.length || null} action={(trip.ideas || []).length > 0 ? { label: "Tout voir", onPress: () => navigation.navigate("Ideas", { tripId: trip.id }) } : undefined}>
          <Group>
            {shownIdeas.map((idea) => {
              const cat = getIdeaCategory(trip, idea.categoryId);
              const line = [ideaAddressLine(idea), formatIdeaDuration(idea.durationMin) ? `visite d'${formatIdeaDuration(idea.durationMin)}`.replace("d'1h", "d'1 h") : null].filter(Boolean).join(" · ");
              return (
                <Row
                  key={idea.id}
                  lead={<Thumb icon="location" tone={ink.name} size={40} />}
                  title={idea.name}
                  subtitle={ideaAddressLine(idea) || formatIdeaDuration(idea.durationMin) || cat.label}
                  onPress={() => navigation.navigate("IdeaEditor", { tripId: trip.id, ideaId: idea.id })}
                  right={<Button title="Placer" size="sm" variant="secondary" accessibilityLabel={`Placer ${idea.name}`} onPress={() => setPickerIdea(idea)} />}
                />
              );
            })}
            <Row
              lead={
                <View style={styles.dashTile}>
                  <Icon name="add" size={24} color={THEME.inkMuted} />
                </View>
              }
              title="Ajouter une idée"
              subtitle="Un lieu, un lien, une adresse"
              onPress={() => navigation.navigate("IdeaEditor", { tripId: trip.id })}
            />
            {loose.length > shownIdeas.length ? (
              <Row title={`Voir les ${loose.length} idées à placer`} onPress={() => navigation.navigate("Ideas", { tripId: trip.id })} chevron style={{ minHeight: 58 }} />
            ) : null}
          </Group>
        </Section>
      ) : (
        <Section title="Attractions">
          <Group>
            <Row icon="rocket-outline" tone={ink.name} title="Attractions du parc" subtitle="Ce qui vous fait envie, les temps d'attente" onPress={() => navigation.navigate("Attractions", { tripId: trip.id })} chevron />
          </Group>
        </Section>
      )}

      <DayPickerModal
        visible={!!pickerIdea}
        trip={trip}
        title={pickerIdea ? `Placer « ${pickerIdea.name} »` : ""}
        onClose={() => setPickerIdea(null)}
        onPick={async (dayId) => {
          const idea = pickerIdea;
          setPickerIdea(null);
          await placeIdeaOnDay(trip.id, idea.id, dayId);
          onChange();
        }}
      />

      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Ce voyage"
        actions={[
          { icon: "calendar-outline", title: "Décaler les dates", subtitle: "Tout le voyage, d'un nombre de jours", onPress: onShiftDates },
          !isPark && trip.days.length > 0 && { icon: "sunny-outline", title: "Météo du voyage", subtitle: "Réorganiser selon le temps prévu", onPress: () => navigation.navigate("WeatherReorg", { tripId: trip.id }) },
          { icon: "document-text-outline", title: "Importer un script", subtitle: "Prix, hôtels et étapes d'un programme collé", onPress: () => navigation.navigate("ImportScript", { tripId: trip.id }) },
          { icon: "globe-outline", title: "Fiche pays", subtitle: country ? `${country.name} : monnaie, prises, urgences…` : "Monnaie, prises, urgences, décalage horaire", onPress: () => setCountryOpen(true) },
          { icon: "images-outline", title: "Bilan et souvenirs", subtitle: "Ce qui a été fait, le budget, les photos", onPress: () => navigation.navigate("TripRecap", { tripId: trip.id }) },
          { icon: "share-outline", title: "Partager", subtitle: "En texte, ou en fichier à importer", onPress: shareTrip },
          { icon: "download-outline", title: "Exporter vers un calendrier", subtitle: "Fichier .ics", onPress: () => shareTripAsICS(trip) },
          hasMap && { icon: "map-outline", title: "Voir sur la carte", onPress: () => navigation.navigate("TripMap", { tripId: trip.id }) },
        ]}
      />

      <CountrySheet
        visible={countryOpen}
        trip={trip}
        country={country}
        onClose={() => setCountryOpen(false)}
        onPick={async (key) => {
          await updateTripSettings(trip.id, { country: key });
          onChange();
        }}
        onOpenPhrases={() => {
          setCountryOpen(false);
          onOpenTab("pratique");
        }}
      />

      <Sheet visible={!!menuDay} onClose={() => setMenuDay(null)} title={menuDay ? menuDay.day.title : ""}>
        {menuDay ? (
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
            {menuDay.index > 0 ? (
              <Row
                icon="arrow-up-outline"
                title="Monter"
                onPress={async () => {
                  const d = menuDay.day;
                  setMenuDay(null);
                  await moveDay(trip.id, d.id, "up");
                  onChange();
                }}
              />
            ) : null}
            {menuDay.index < trip.days.length - 1 ? (
              <Row
                icon="arrow-down-outline"
                title="Descendre"
                onPress={async () => {
                  const d = menuDay.day;
                  setMenuDay(null);
                  await moveDay(trip.id, d.id, "down");
                  onChange();
                }}
              />
            ) : null}
            <Row
              icon="copy-outline"
              title="Dupliquer"
              onPress={async () => {
                const d = menuDay.day;
                setMenuDay(null);
                await duplicateDay(trip.id, d.id);
                onChange();
              }}
            />
            <Row
              icon="trash-outline"
              tone="stamp"
              title="Supprimer ce jour"
              onPress={() => {
                const d = menuDay.day;
                setMenuDay(null);
                setTimeout(() => confirmDeleteDay(d), 350); // let the sheet finish closing (iOS)
              }}
            />
          </Group>
        ) : null}
      </Sheet>
    </ScrollView>
  );
}

const styles = themedStyles(() => ({
  dayRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 78, paddingVertical: 10, paddingHorizontal: space.lg },
  addRow: { borderTopWidth: 1, borderTopColor: THEME.hair },
  dayText: { flex: 1, gap: 2 },
  dayTitleRow: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  dashTile: { width: 40, height: 40, borderRadius: 8, borderWidth: 1.5, borderStyle: "dashed", borderColor: THEME.inkFaint, alignItems: "center", justifyContent: "center" },
}));
