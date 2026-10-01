import React, { useState, useMemo, useEffect } from "react";
import { View, Text, ScrollView, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { THEME, TONES, space, layout, radius, type, themedStyles } from "../lib/theme";
import { formatMoney } from "../lib/budget";
import {
  getIdeaCategories,
  getIdeaCategory,
  placementIndex,
  ideaStats,
  sortIdeas,
  priorityMeta,
  formatIdeaDuration,
  ideaAddressLine,
  hasPosition,
  placeIdeaOnDay,
  addIdeaCategory,
  deleteIdeaCategory,
  needsStayIdeas,
  backfillStayIdeas,
  CUSTOM_CATEGORY_ICONS,
} from "../lib/ideas";
import { planCandidates } from "../lib/planner";
import DayPickerModal from "../components/DayPickerModal";
import TripScroll from "../components/TripScroll";
import { Txt, Button, IconButton, Chip, Badge, Group, Row, Field, EmptyState, Sheet, ActionSheet } from "../components/ui";

// A category stores its colour; the tone with the same foreground gives the
// tinted pair that Chip and Row expect.
function toneOfCategory(cat) {
  return Object.keys(TONES).find((k) => TONES[k].fg === cat.color) || "neutral";
}

// Spoken names for the icon choices (the ids themselves are English).
const ICON_LABELS = {
  star: "étoile",
  heart: "cœur",
  camera: "appareil photo",
  wine: "verre de vin",
  cafe: "café",
  "musical-notes": "musique",
  ticket: "billet",
  walk: "marche",
  boat: "bateau",
  business: "immeuble",
};

// The "Idées" tab of a "Construire mon voyage" trip: a notebook of places
// grouped by category. Each idea is either still loose or placed on a day.
export default function IdeasTab({ trip, navigation, onChange }) {
  const [filter, setFilter] = useState("all");
  const [pickerIdea, setPickerIdea] = useState(null);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const categories = getIdeaCategories(trip);
  const ideas = trip.ideas || [];
  const placed = useMemo(() => placementIndex(trip), [trip]);
  const stats = ideaStats(trip);
  const plannable = useMemo(() => planCandidates(trip).length, [trip]);
  const staysCount = trip.days.reduce((n, d) => n + d.activities.filter((a) => a.type === "hotel" && a.stayId).length, 0);

  // Hotels booked before they became ideas: add them once (the flag stops it from running again).
  const backfill = needsStayIdeas(trip);
  useEffect(() => {
    if (backfill) backfillStayIdeas(trip.id).then(onChange);
  }, [backfill, trip.id]);

  const visibleCategories = filter === "all" ? categories : categories.filter((c) => c.id === filter);
  const countFor = (catId) => ideas.filter((i) => getIdeaCategory(trip, i.categoryId).id === catId).length;

  function openEditor(ideaId) {
    navigation.navigate("IdeaEditor", { tripId: trip.id, ideaId, categoryId: ideaId || filter === "all" ? undefined : filter });
  }

  function bookHotel(idea) {
    navigation.navigate("Hotels", {
      tripId: trip.id,
      prefill: { name: idea.name, address: ideaAddressLine(idea), ideaId: idea.id, lat: idea.lat, lng: idea.lng },
    });
  }

  function confirmDeleteCategory(cat) {
    if (!cat.id.startsWith("c_")) return;
    Alert.alert(`Supprimer « ${cat.label} » ?`, "Les idées de cette catégorie passeront dans « Activités ».", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          await deleteIdeaCategory(trip.id, cat.id);
          if (filter === cat.id) setFilter("all");
          onChange();
        },
      },
    ]);
  }

  // With ideas, Importer and Hôtels sit in the "…" menu; the empty state shows them as buttons.
  const openHotels = () => navigation.navigate("Hotels", { tripId: trip.id });
  const openImport = () => navigation.navigate("ImportIdeas", { tripId: trip.id });
  const hotelsButton = <Button title={`Hôtels${staysCount ? ` (${staysCount})` : ""}`} icon="bed-outline" variant="secondary" size="sm" style={styles.selfCenter} onPress={openHotels} />;
  const importButton = <Button title="Importer" icon="download-outline" variant="secondary" accessibilityLabel="Importer des idées depuis un lien ou un texte" style={styles.selfCenter} onPress={openImport} />;
  const canGenerate = plannable > 0 && trip.days.length > 0;

  return (
    <TripScroll contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      {ideas.length > 0 && (
        <>
          <View style={styles.actionRow}>
            <Button title="Ajouter une idée" icon="add" onPress={() => openEditor(undefined)} style={styles.flex} />
            <IconButton icon="ellipsis-horizontal" label="Plus d'actions" filled size={20} onPress={() => setMenuOpen(true)} />
          </View>
          {canGenerate && (
            <Button
              title="Générer le planning"
              icon="sparkles-outline"
              tone="gold"
              full
              style={styles.generate}
              accessibilityLabel={`Générer le planning avec ${plannable} idée${plannable !== 1 ? "s" : ""} à placer`}
              onPress={() => navigation.navigate("PlanGenerator", { tripId: trip.id })}
            />
          )}
          <View style={styles.statsText}>
            <Txt variant="subhead">{`${stats.total} idée${stats.total !== 1 ? "s" : ""}, ${stats.placed} placée${stats.placed !== 1 ? "s" : ""}`}</Txt>
            {stats.mustUnplaced > 0 && (
              <Txt variant="caption" color="stamp">
                {`${stats.mustUnplaced} indispensable${stats.mustUnplaced !== 1 ? "s" : ""} à placer`}
              </Txt>
            )}
          </View>
        </>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.chipScroll, ideas.length > 0 && styles.chipScrollGap]}
        contentContainerStyle={styles.chipRow}
      >
        <Chip label="Tout" count={ideas.length} selected={filter === "all"} tone="gold" accessibilityLabel={`Tout, ${ideas.length}`} onPress={() => setFilter("all")} />
        {categories.map((c) => (
          <Chip
            key={c.id}
            label={c.label}
            icon={c.icon}
            count={countFor(c.id)}
            selected={filter === c.id}
            tone={toneOfCategory(c)}
            accessibilityLabel={`${c.label}, ${countFor(c.id)}`}
            onPress={() => setFilter(c.id)}
            onLongPress={() => confirmDeleteCategory(c)}
          />
        ))}
        <Chip label="Catégorie" icon="add" accessibilityLabel="Ajouter une catégorie" style={styles.chipAdd} onPress={() => setCatModalOpen(true)} />
      </ScrollView>

      {ideas.length === 0 ? (
        <>
          <EmptyState
            icon="bulb-outline"
            tone="gold"
            title="Votre carnet d'idées est vide"
            text="Notez les lieux qui vous font envie : restos, activités, endroits vus sur TikTok… Chaque idée a un lieu, une priorité et une durée. Vous les posez ensuite sur vos jours."
            action={{ label: "Ajouter une idée", icon: "add", onPress: () => openEditor(undefined) }}
          />
          <View style={styles.emptyActions}>
            {importButton}
            {hotelsButton}
          </View>
        </>
      ) : (
        visibleCategories.map((cat) => {
          const list = sortIdeas(ideas.filter((i) => getIdeaCategory(trip, i.categoryId).id === cat.id));
          if (filter === "all" && list.length === 0) return null;
          const tone = toneOfCategory(cat);
          return (
            <View key={cat.id} style={styles.section}>
              <View style={styles.sectionTitle}>
                <Ionicons name={cat.icon} size={18} color={TONES[tone].fg} />
                <View style={styles.sectionTitleText}>
                  <Text style={type.heading} accessibilityRole="header">
                    {cat.label}
                  </Text>
                  <Text style={[type.numeralSmall, { color: THEME.inkFaint }]}>{list.length}</Text>
                </View>
              </View>
              {list.length === 0 ? (
                <Txt variant="subhead">Rien ici pour l'instant.</Txt>
              ) : (
                <Group>
                  {list.map((idea) => (
                    <IdeaRow
                      key={idea.id}
                      idea={idea}
                      cat={cat}
                      tone={tone}
                      trip={trip}
                      placement={placed.get(idea.id)}
                      onOpen={() => openEditor(idea.id)}
                      onPlace={() => setPickerIdea(idea)}
                      onBook={() => bookHotel(idea)}
                    />
                  ))}
                </Group>
              )}
            </View>
          );
        })
      )}

      <Txt variant="caption" color="inkFaint" style={styles.attribution}>
        Recherche d'adresses © contributeurs OpenStreetMap
      </Txt>

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
        title="Plus d'actions"
        actions={[
          { icon: "download-outline", title: "Importer des idées", subtitle: "Depuis un lien ou un texte", onPress: openImport },
          { icon: "bed-outline", title: staysCount ? `Hôtels (${staysCount})` : "Hôtels", subtitle: "Ajouter ou modifier vos hôtels", onPress: openHotels },
          { icon: "map-outline", title: "Voir les idées sur la carte", onPress: () => navigation.navigate("TripMap", { tripId: trip.id }) },
        ]}
      />

      <CategoryModal
        visible={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        onSave={async ({ name, icon }) => {
          const created = await addIdeaCategory(trip.id, { name, icon });
          setCatModalOpen(false);
          setFilter(created.id);
          onChange();
        }}
      />
    </TripScroll>
  );
}

// One idea: category tile, name, address, then priority / duration / price.
// The trailing slot is either the next action (place, book) or where it went.
function IdeaRow({ idea, cat, tone, trip, placement, onOpen, onPlace, onBook }) {
  const pr = priorityMeta(idea.priority);
  const isHotel = cat.activityType === "hotel";
  const line = ideaAddressLine(idea);
  const duration = isHotel ? null : formatIdeaDuration(idea.durationMin);

  return (
    <Row
      icon={cat.icon}
      tone={tone}
      title={
        <Text style={styles.ideaName} numberOfLines={2}>
          {idea.name}
        </Text>
      }
      accessibilityLabel={`${idea.name}, ${cat.label}, ${pr.label}`}
      onPress={onOpen}
      right={
        placement ? (
          <Badge label={isHotel ? "Séjour" : `J${placement.dayIndex + 1}`} icon={isHotel ? "bed" : "checkmark"} tone="teal" />
        ) : (
          <Button
            title={isHotel ? "Réserver" : "Placer"}
            accessibilityLabel={`${isHotel ? "Réserver" : "Placer"} ${idea.name}`}
            size="sm"
            tone="gold"
            onPress={isHotel ? onBook : onPlace}
          />
        )
      }
    >
      {!!line && (
        <Text style={type.subhead} numberOfLines={1}>
          {line}
        </Text>
      )}
      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <View style={[styles.dot, { backgroundColor: pr.color }]} />
          <Text style={type.caption}>{pr.label}</Text>
        </View>
        {!!duration && <Text style={type.numeralSmall}>{duration}</Text>}
        {idea.price != null && <Text style={type.numeralSmall}>{formatMoney(idea.price, trip.currency)}</Text>}
        {!hasPosition(idea) && (
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={12} color={THEME.inkFaint} />
            <Text style={[type.caption, { color: THEME.inkFaint }]}>Sans position</Text>
          </View>
        )}
      </View>
    </Row>
  );
}

function CategoryModal({ visible, onClose, onSave }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(CUSTOM_CATEGORY_ICONS[0]);

  React.useEffect(() => {
    if (visible) {
      setName("");
      setIcon(CUSTOM_CATEGORY_ICONS[0]);
    }
  }, [visible]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Nouvelle catégorie">
      <Field label="Nom" value={name} onChangeText={setName} placeholder="Musées, bars, points de vue…" autoFocus maxLength={24} />
      <Txt variant="caption" style={styles.iconLabel}>
        Icône
      </Txt>
      <View style={styles.iconRow}>
        {CUSTOM_CATEGORY_ICONS.map((ic) => (
          <IconButton
            key={ic}
            icon={ic}
            label={`Icône ${ICON_LABELS[ic] || ic}${icon === ic ? ", sélectionnée" : ""}`}
            filled
            size={20}
            tone={icon === ic ? "gold" : undefined}
            onPress={() => setIcon(ic)}
          />
        ))}
      </View>
      <View style={styles.sheetButtons}>
        <Button title="Annuler" variant="secondary" style={styles.flex} onPress={onClose} />
        <Button title="Créer" disabled={!name.trim()} style={styles.flex} onPress={() => onSave({ name, icon })} />
      </View>
      <Txt variant="caption" style={styles.hint}>
        Astuce : un appui long sur une catégorie perso la supprime.
      </Txt>
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1 },
  scrollContent: { padding: layout.gutter, paddingBottom: space.xxxl },
  actionRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  selfCenter: { alignSelf: "center" },
  emptyActions: { alignItems: "center", gap: space.md },
  generate: { marginTop: space.sm },
  statsText: { gap: 2, marginTop: space.lg },
  chipScroll: { flexGrow: 0, marginHorizontal: -layout.gutter },
  chipScrollGap: { marginTop: space.md },
  chipRow: { paddingHorizontal: layout.gutter, gap: space.sm, alignItems: "center" },
  chipAdd: { backgroundColor: "transparent", borderColor: THEME.hairStrong, borderStyle: "dashed" },
  section: { marginTop: space.xl },
  sectionTitle: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.md },
  sectionTitleText: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  ideaName: { ...type.name },
  metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space.md, rowGap: 2, marginTop: space.xs },
  metaItem: { flexDirection: "row", alignItems: "center", gap: space.xs + 2 },
  dot: { width: space.sm, height: space.sm, borderRadius: radius.full },
  attribution: { textAlign: "center", marginTop: space.xl },
  iconLabel: { marginBottom: space.sm },
  iconRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.xl },
  sheetButtons: { flexDirection: "row", gap: space.md },
  hint: { textAlign: "center", marginTop: space.lg },
}));
