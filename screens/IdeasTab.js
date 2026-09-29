import React, { useState, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, TextInput, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { THEME, CARD_SHADOW } from "../lib/theme";
import { FONTS } from "../lib/fonts";
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
  CUSTOM_CATEGORY_ICONS,
} from "../lib/ideas";
import DayPickerModal from "../components/DayPickerModal";

// The "Idées" tab of a "Construire mon voyage" trip: a notebook of places
// grouped by category. Each idea is either still loose or placed on a day.
export default function IdeasTab({ trip, navigation, onChange }) {
  const [filter, setFilter] = useState("all");
  const [pickerIdea, setPickerIdea] = useState(null);
  const [catModalOpen, setCatModalOpen] = useState(false);

  const categories = getIdeaCategories(trip);
  const ideas = trip.ideas || [];
  const placed = useMemo(() => placementIndex(trip), [trip]);
  const stats = ideaStats(trip);
  const staysCount = trip.days.reduce((n, d) => n + d.activities.filter((a) => a.type === "hotel" && a.stayId).length, 0);

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

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.addButton} onPress={() => openEditor(undefined)} activeOpacity={0.85}>
          <Ionicons name="add" size={18} color={THEME.bg} />
          <Text style={styles.addButtonText}>Ajouter une idée</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.hotelsButton} onPress={() => navigation.navigate("Hotels", { tripId: trip.id })} activeOpacity={0.85}>
          <Ionicons name="bed-outline" size={16} color={THEME.inkMuted} />
          <Text style={styles.hotelsButtonText}>Hôtels{staysCount ? ` (${staysCount})` : ""}</Text>
        </TouchableOpacity>
      </View>

      {ideas.length > 0 && (
        <View style={styles.statsRow}>
          <Text style={styles.statsText}>
            {stats.total} idée{stats.total !== 1 ? "s" : ""} · {stats.placed} placée{stats.placed !== 1 ? "s" : ""}
          </Text>
          {stats.mustUnplaced > 0 && (
            <Text style={styles.statsWarn}>
              {stats.mustUnplaced} indispensable{stats.mustUnplaced !== 1 ? "s" : ""} à placer
            </Text>
          )}
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
        <TouchableOpacity style={[styles.chip, filter === "all" && styles.chipActive]} onPress={() => setFilter("all")}>
          <Text style={[styles.chipText, filter === "all" && styles.chipTextActive]}>Tout ({ideas.length})</Text>
        </TouchableOpacity>
        {categories.map((c) => {
          const active = filter === c.id;
          return (
            <TouchableOpacity
              key={c.id}
              style={[styles.chip, active && { borderColor: c.color, backgroundColor: c.dim }]}
              onPress={() => setFilter(c.id)}
              onLongPress={() => confirmDeleteCategory(c)}
              delayLongPress={450}
            >
              <Ionicons name={c.icon} size={13} color={active ? c.color : THEME.inkMuted} />
              <Text style={[styles.chipText, active && { color: c.color }]}>
                {c.label} ({countFor(c.id)})
              </Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity style={styles.chipAdd} onPress={() => setCatModalOpen(true)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
          <Ionicons name="add" size={16} color={THEME.inkMuted} />
        </TouchableOpacity>
      </ScrollView>

      {ideas.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="bulb-outline" size={30} color={THEME.gold} />
          <Text style={styles.emptyTitle}>Votre carnet d'idées est vide</Text>
          <Text style={styles.emptyText}>
            Notez les lieux qui vous font envie : restos, activités, endroits vus sur TikTok… Chaque idée a un lieu, une
            priorité et une durée. Vous les posez ensuite sur vos jours.
          </Text>
        </View>
      ) : (
        visibleCategories.map((cat) => {
          const list = sortIdeas(ideas.filter((i) => getIdeaCategory(trip, i.categoryId).id === cat.id));
          if (filter === "all" && list.length === 0) return null;
          return (
            <View key={cat.id} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name={cat.icon} size={14} color={cat.color} />
                <Text style={[styles.sectionTitle, { color: cat.color }]}>{cat.label}</Text>
              </View>
              {list.length === 0 ? (
                <Text style={styles.sectionEmpty}>Rien ici pour l'instant.</Text>
              ) : (
                list.map((idea) => (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    cat={cat}
                    trip={trip}
                    placement={placed.get(idea.id)}
                    onOpen={() => openEditor(idea.id)}
                    onPlace={() => setPickerIdea(idea)}
                    onBook={() => bookHotel(idea)}
                  />
                ))
              )}
            </View>
          );
        })
      )}

      <Text style={styles.attribution}>Recherche d'adresses © contributeurs OpenStreetMap</Text>

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
    </ScrollView>
  );
}

function IdeaCard({ idea, cat, trip, placement, onOpen, onPlace, onBook }) {
  const pr = priorityMeta(idea.priority);
  const isHotel = cat.activityType === "hotel";
  const line = ideaAddressLine(idea);
  const duration = isHotel ? null : formatIdeaDuration(idea.durationMin);

  return (
    <TouchableOpacity style={styles.card} onPress={onOpen} activeOpacity={0.85}>
      <View style={[styles.badge, { backgroundColor: cat.dim }]}>
        <Ionicons name={cat.icon} size={18} color={cat.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {idea.name}
        </Text>
        {!!line && (
          <Text style={styles.cardSub} numberOfLines={1}>
            {line}
          </Text>
        )}
        <View style={styles.pillRow}>
          <View style={styles.pill}>
            <View style={[styles.dot, { backgroundColor: pr.color }]} />
            <Text style={styles.pillText}>{pr.label}</Text>
          </View>
          {!!duration && (
            <View style={styles.pill}>
              <Ionicons name="time-outline" size={11} color={THEME.inkFaint} />
              <Text style={styles.pillText}>{duration}</Text>
            </View>
          )}
          {idea.price != null && (
            <View style={styles.pill}>
              <Text style={styles.pillText}>{formatMoney(idea.price, trip.currency)}</Text>
            </View>
          )}
          {!hasPosition(idea) && (
            <View style={styles.pill}>
              <Ionicons name="location-outline" size={11} color={THEME.inkFaint} />
              <Text style={styles.pillText}>Sans position</Text>
            </View>
          )}
        </View>
      </View>

      {placement ? (
        <View style={styles.placedPill}>
          <Ionicons name={isHotel ? "bed" : "checkmark"} size={12} color={THEME.teal} />
          <Text style={styles.placedText}>{isHotel ? "Séjour" : `J${placement.dayIndex + 1}`}</Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.placeButton} onPress={isHotel ? onBook : onPlace} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
          <Text style={styles.placeButtonText}>{isHotel ? "Réserver" : "Placer"}</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Nouvelle catégorie</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Musées, bars, points de vue…"
            placeholderTextColor={THEME.inkFaint}
            autoFocus
            maxLength={24}
          />
          <View style={styles.iconRow}>
            {CUSTOM_CATEGORY_ICONS.map((ic) => (
              <TouchableOpacity key={ic} style={[styles.iconChoice, icon === ic && styles.iconChoiceActive]} onPress={() => setIcon(ic)}>
                <Ionicons name={ic} size={18} color={icon === ic ? THEME.gold : THEME.inkMuted} />
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.modalButton} onPress={onClose}>
              <Text style={styles.modalButtonText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, !name.trim() && { opacity: 0.4 }]}
              disabled={!name.trim()}
              onPress={() => onSave({ name, icon })}
            >
              <Text style={styles.modalButtonText}>Créer</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.modalHint}>Astuce : un appui long sur une catégorie perso la supprime.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 20, paddingBottom: 40 },
  actionRow: { flexDirection: "row", gap: 10 },
  addButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: THEME.gold,
    borderRadius: 12,
    paddingVertical: 13,
  },
  addButtonText: { color: THEME.bg, fontSize: 14.5, fontFamily: FONTS.bodySemiBold },
  hotelsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  hotelsButtonText: { color: THEME.inkMuted, fontSize: 13.5, fontFamily: FONTS.bodyMedium },
  statsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 },
  statsText: { color: THEME.inkMuted, fontSize: 12.5, fontFamily: FONTS.body },
  statsWarn: { color: THEME.stamp, fontSize: 12, fontFamily: FONTS.bodyMedium },
  chipScroll: { flexGrow: 0, marginTop: 14, marginHorizontal: -20 },
  chipRow: { paddingHorizontal: 20, gap: 8, alignItems: "center" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipActive: { borderColor: THEME.ink, backgroundColor: THEME.bgRaised },
  chipText: { color: THEME.inkMuted, fontSize: 12.5, fontFamily: FONTS.bodyMedium },
  chipTextActive: { color: THEME.ink },
  chipAdd: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: THEME.border,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyBox: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 12, gap: 10 },
  emptyTitle: { color: THEME.ink, fontSize: 16, fontFamily: FONTS.headingSemiBold },
  emptyText: { color: THEME.inkMuted, fontSize: 13.5, lineHeight: 19, textAlign: "center", fontFamily: FONTS.body },
  section: { marginTop: 22 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 10 },
  sectionTitle: { fontSize: 13, letterSpacing: 0.4, textTransform: "uppercase", fontFamily: FONTS.bodySemiBold },
  sectionEmpty: { color: THEME.inkFaint, fontSize: 12.5, fontFamily: FONTS.body },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: THEME.bgCard,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 14,
    padding: 13,
    marginBottom: 10,
    ...CARD_SHADOW,
  },
  badge: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardTitle: { color: THEME.ink, fontSize: 15, fontFamily: FONTS.headingSemiBold },
  cardSub: { color: THEME.inkFaint, fontSize: 12, marginTop: 2, fontFamily: FONTS.body },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: THEME.bgCardAlt,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  pillText: { color: THEME.inkMuted, fontSize: 11, fontFamily: FONTS.body },
  dot: { width: 6, height: 6, borderRadius: 3 },
  placedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: THEME.tealDim,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  placedText: { color: THEME.teal, fontSize: 12, fontFamily: FONTS.bodySemiBold },
  placeButton: { borderWidth: 1, borderColor: THEME.gold, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 6 },
  placeButtonText: { color: THEME.gold, fontSize: 12, fontFamily: FONTS.bodySemiBold },
  attribution: { color: THEME.inkFaint, fontSize: 10.5, textAlign: "center", marginTop: 26, fontFamily: FONTS.body },
  modalOverlay: { flex: 1, backgroundColor: "#00000099", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: {
    backgroundColor: THEME.bgCard,
    borderRadius: 18,
    padding: 20,
    width: "100%",
    borderWidth: 1,
    borderColor: THEME.border,
    ...CARD_SHADOW,
  },
  modalTitle: { color: THEME.ink, fontSize: 16, fontFamily: FONTS.headingSemiBold, marginBottom: 14 },
  input: {
    backgroundColor: THEME.bgCardAlt,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: THEME.ink,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  iconRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  iconChoice: {
    width: 40,
    height: 40,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: "center",
    justifyContent: "center",
  },
  iconChoiceActive: { borderColor: THEME.gold, backgroundColor: THEME.goldDim },
  modalButtons: { flexDirection: "row", gap: 10, marginTop: 18 },
  modalButton: { flex: 1, borderWidth: 1, borderColor: THEME.teal, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  modalButtonText: { color: THEME.teal, fontSize: 13.5, fontFamily: FONTS.bodySemiBold },
  modalHint: { color: THEME.inkFaint, fontSize: 11, textAlign: "center", marginTop: 12, fontFamily: FONTS.body },
});
