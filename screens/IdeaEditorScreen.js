import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect } from "@react-navigation/native";

import { THEME, CARD_SHADOW } from "../lib/theme";
import { FONTS } from "../lib/fonts";
import { getTrip } from "../lib/trips";
import { resolveDayDate, formatDateLabel } from "../lib/dates";
import {
  getIdeaCategories,
  getIdeaCategory,
  placementIndex,
  addIdea,
  editIdea,
  deleteIdea,
  placeIdeaOnDay,
  unplaceIdea,
  ideaAddressLine,
  formatIdeaDuration,
  IDEA_PRIORITIES,
  MEAL_SLOTS,
  DURATION_CHOICES,
} from "../lib/ideas";
import { searchPlacesWithFallback, centroidOf } from "../lib/geocode";
import DayPickerModal from "../components/DayPickerModal";

export default function IdeaEditorScreen({ route, navigation }) {
  const { tripId, ideaId, categoryId: initialCategoryId } = route.params;

  const [trip, setTrip] = useState(null);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(initialCategoryId || "activite");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [position, setPosition] = useState(null); // { lat, lng } once a place was found
  const [openingHours, setOpeningHours] = useState(null);
  const [priority, setPriority] = useState("want");
  const [durationMin, setDurationMin] = useState(null);
  const [durationTouched, setDurationTouched] = useState(false);
  const [mealSlot, setMealSlot] = useState("any");
  const [price, setPrice] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [note, setNote] = useState("");

  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState(null); // null = never searched
  const [searchError, setSearchError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const isEditing = !!ideaId;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await getTrip(tripId);
      if (cancelled || !t) return;
      setTrip(t);
      const existing = ideaId ? (t.ideas || []).find((i) => i.id === ideaId) : null;
      if (existing) {
        setName(existing.name);
        setCategoryId(getIdeaCategory(t, existing.categoryId).id);
        setAddress(existing.address || "");
        setCity(existing.city || "");
        setPosition(Number.isFinite(existing.lat) && Number.isFinite(existing.lng) ? { lat: existing.lat, lng: existing.lng } : null);
        setOpeningHours(existing.openingHours || null);
        setPriority(existing.priority || "want");
        setDurationMin(existing.durationMin);
        setDurationTouched(true);
        setMealSlot(existing.mealSlot || "any");
        setPrice(existing.price != null ? String(existing.price) : "");
        setSourceUrl(existing.sourceUrl || "");
        setNote(existing.note || "");
      } else {
        const cat = getIdeaCategory(t, initialCategoryId || "activite");
        setCategoryId(cat.id);
        setDurationMin(cat.durationMin);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId, ideaId]);

  // Coming back from the Hôtels screen (a stay may have just been created from
  // this idea): refresh the trip only, never the form fields being edited.
  useFocusEffect(
    useCallback(() => {
      getTrip(tripId).then((t) => t && setTrip(t));
    }, [tripId])
  );

  if (!trip) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={THEME.teal} />
        </View>
      </SafeAreaView>
    );
  }

  const categories = getIdeaCategories(trip);
  const cat = getIdeaCategory(trip, categoryId);
  const isHotel = cat.activityType === "hotel";
  const isMeal = cat.activityType === "repas";
  const placement = isEditing ? placementIndex(trip).get(ideaId) : null;

  function pickCategory(c) {
    // A placed idea keeps being (or not being) a hotel: a hotel stay and a
    // normal step are stored differently, so the switch would orphan it.
    if (placement && (c.activityType === "hotel") !== isHotel) {
      Alert.alert("Déjà placée", "Retirez d'abord cette idée du programme pour changer sa catégorie.");
      return;
    }
    setCategoryId(c.id);
    if (!durationTouched) setDurationMin(c.durationMin);
  }

  async function findPlace() {
    setSearchError("");
    if (!name.trim() && !address.trim()) {
      setSearchError("Renseignez au moins un nom de lieu ou une adresse.");
      return;
    }
    setSearching(true);
    try {
      const near = centroidOf(trip.ideas || []);
      const { results } = await searchPlacesWithFallback({ name, address, city, fallbackCity: trip.defaultLocation }, { near });
      setCandidates(results);
    } catch (e) {
      setCandidates(null);
      setSearchError(e.message || "La recherche a échoué.");
    } finally {
      setSearching(false);
    }
  }

  function applyCandidate(r) {
    if (!name.trim()) setName(r.name);
    setAddress(r.address || "");
    setCity(r.city || city);
    setPosition({ lat: r.lat, lng: r.lng });
    setOpeningHours(r.openingHours || null);
    setCandidates(null);
    setSearchError("");
  }

  function clearPosition() {
    setPosition(null);
    setOpeningHours(null);
  }

  async function pasteLink() {
    try {
      const text = (await Clipboard.getStringAsync()) || "";
      if (text.trim()) setSourceUrl(text.trim());
    } catch (e) {
      // clipboard unavailable — the field can still be typed into
    }
  }

  function openLink() {
    const url = sourceUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      Alert.alert("Lien invalide", "Le lien doit commencer par http:// ou https://");
      return;
    }
    Linking.openURL(url).catch(() => Alert.alert("Impossible d'ouvrir le lien"));
  }

  function buildPayload() {
    return {
      name,
      categoryId,
      address,
      city,
      lat: position ? position.lat : null,
      lng: position ? position.lng : null,
      openingHours,
      priority,
      durationMin,
      mealSlot,
      price,
      sourceUrl,
      note,
    };
  }

  // Saves the form. Returns the idea id, or null when validation failed.
  async function persist() {
    if (!name.trim()) {
      setError("Donnez un nom à cette idée.");
      return null;
    }
    setError("");
    if (isEditing) {
      await editIdea(tripId, ideaId, buildPayload());
      return ideaId;
    }
    const created = await addIdea(tripId, buildPayload());
    return created.id;
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const id = await persist();
      if (id) navigation.goBack();
    } finally {
      setSaving(false);
    }
  }

  async function reload() {
    const t = await getTrip(tripId);
    if (t) setTrip(t);
  }

  // Placement buttons save the form first, so the step created on the day
  // carries what is on screen and not an older version of the idea.
  async function placeOnDay(dayId) {
    setPickerOpen(false);
    const id = await persist();
    if (!id) return;
    await placeIdeaOnDay(tripId, ideaId, dayId);
    await reload();
  }

  async function removeFromProgramme() {
    setPickerOpen(false);
    await unplaceIdea(tripId, ideaId);
    await reload();
  }

  async function bookHotel() {
    const id = await persist();
    if (!id) return;
    const t = await getTrip(tripId);
    const idea = (t.ideas || []).find((i) => i.id === ideaId);
    navigation.navigate("Hotels", {
      tripId,
      prefill: { name: idea.name, address: ideaAddressLine(idea), ideaId: idea.id, lat: idea.lat, lng: idea.lng },
    });
  }

  function confirmDelete() {
    const done = async (removeActivity) => {
      await deleteIdea(tripId, ideaId, { removeActivity });
      navigation.goBack();
    };
    if (placement && !isHotel) {
      Alert.alert("Supprimer cette idée ?", `Elle est placée au jour ${placement.dayIndex + 1}.`, [
        { text: "Annuler", style: "cancel" },
        { text: "Idée seulement", onPress: () => done(false) },
        { text: "Idée + étape", style: "destructive", onPress: () => done(true) },
      ]);
    } else {
      Alert.alert("Supprimer cette idée ?", isHotel && placement ? "Le séjour réservé reste dans vos hôtels." : "Cette action est définitive.", [
        { text: "Annuler", style: "cancel" },
        { text: "Supprimer", style: "destructive", onPress: () => done(false) },
      ]);
    }
  }

  const placementDate = placement ? resolveDayDate(trip, placement.day, placement.dayIndex) : null;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>Annuler</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isEditing ? "Modifier l'idée" : "Nouvelle idée"}</Text>
          <TouchableOpacity onPress={save} style={styles.headerButton} disabled={saving}>
            <Text style={[styles.headerButtonText, styles.headerSaveText]}>Enregistrer</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Nom du lieu</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Restaurant chez Moktar"
            placeholderTextColor={THEME.inkFaint}
          />

          <Text style={styles.label}>Catégorie</Text>
          <View style={styles.chipWrap}>
            {categories.map((c) => {
              const active = c.id === categoryId;
              return (
                <TouchableOpacity key={c.id} style={[styles.chip, active && { borderColor: c.color, backgroundColor: c.dim }]} onPress={() => pickCategory(c)}>
                  <Ionicons name={c.icon} size={14} color={active ? c.color : THEME.inkMuted} />
                  <Text style={[styles.chipText, active && { color: c.color }]}>{c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>Adresse</Text>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder="Rue, quartier… (optionnel)"
            placeholderTextColor={THEME.inkFaint}
          />
          <Text style={styles.label}>Ville</Text>
          <TextInput
            style={styles.input}
            value={city}
            onChangeText={setCity}
            placeholder={trip.defaultLocation || "Midoun"}
            placeholderTextColor={THEME.inkFaint}
          />

          <TouchableOpacity style={styles.findButton} onPress={findPlace} disabled={searching} activeOpacity={0.85}>
            {searching ? <ActivityIndicator size="small" color={THEME.teal} /> : <Ionicons name="search" size={15} color={THEME.teal} />}
            <Text style={styles.findButtonText}>{searching ? "Recherche…" : "Trouver sur la carte"}</Text>
          </TouchableOpacity>

          {!!searchError && <Text style={styles.errorText}>{searchError}</Text>}

          {candidates && candidates.length === 0 && (
            <Text style={styles.hintText}>Aucun résultat. Précisez la ville, ou gardez l'adresse saisie à la main (l'idée sera « sans position »).</Text>
          )}
          {candidates && candidates.length > 0 && (
            <View style={styles.candidateBox}>
              <Text style={styles.candidateTitle}>Touchez le bon lieu</Text>
              {candidates.map((r, i) => (
                <TouchableOpacity key={`${r.osmRef || i}`} style={styles.candidateRow} onPress={() => applyCandidate(r)} activeOpacity={0.8}>
                  <Ionicons name="location" size={16} color={THEME.teal} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.candidateName} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Text style={styles.candidateAddress} numberOfLines={2}>
                      {r.address}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
              <Text style={styles.attribution}>© contributeurs OpenStreetMap</Text>
            </View>
          )}

          {position && (
            <View style={styles.positionBadge}>
              <Ionicons name="checkmark-circle" size={15} color={THEME.teal} />
              <Text style={styles.positionText}>
                Position enregistrée · {position.lat.toFixed(4)}, {position.lng.toFixed(4)}
              </Text>
              <TouchableOpacity onPress={clearPosition} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color={THEME.inkFaint} />
              </TouchableOpacity>
            </View>
          )}
          {!!openingHours && <Text style={styles.hintText}>Horaires (OpenStreetMap) : {openingHours}</Text>}

          <Text style={styles.label}>Priorité</Text>
          <View style={styles.chipWrap}>
            {IDEA_PRIORITIES.map((p) => {
              const active = priority === p.key;
              return (
                <TouchableOpacity key={p.key} style={[styles.chip, active && { borderColor: p.color }]} onPress={() => setPriority(p.key)}>
                  <View style={[styles.dot, { backgroundColor: p.color }]} />
                  <Text style={[styles.chipText, active && { color: THEME.ink }]}>{p.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {!isHotel && (
            <>
              <Text style={styles.label}>Durée sur place</Text>
              <View style={styles.chipWrap}>
                {DURATION_CHOICES.map((d) => {
                  const active = durationMin === d;
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[styles.chip, active && { borderColor: THEME.gold, backgroundColor: THEME.goldDim }]}
                      onPress={() => {
                        setDurationMin(d);
                        setDurationTouched(true);
                      }}
                    >
                      <Text style={[styles.chipText, active && { color: THEME.gold }]}>{formatIdeaDuration(d)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {isMeal && (
            <>
              <Text style={styles.label}>Repas</Text>
              <View style={styles.chipWrap}>
                {MEAL_SLOTS.map((m) => {
                  const active = mealSlot === m.key;
                  return (
                    <TouchableOpacity key={m.key} style={[styles.chip, active && { borderColor: THEME.gold, backgroundColor: THEME.goldDim }]} onPress={() => setMealSlot(m.key)}>
                      <Text style={[styles.chipText, active && { color: THEME.gold }]}>{m.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {!isHotel && (
            <>
              <Text style={styles.label}>Prix estimé ({trip.currency}) — optionnel</Text>
              <TextInput style={styles.input} value={price} onChangeText={setPrice} placeholder="0" placeholderTextColor={THEME.inkFaint} keyboardType="decimal-pad" />
            </>
          )}

          <Text style={styles.label}>Lien source (TikTok, YouTube, site…)</Text>
          <View style={styles.linkRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={sourceUrl}
              onChangeText={setSourceUrl}
              placeholder="https://…"
              placeholderTextColor={THEME.inkFaint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <TouchableOpacity style={styles.linkButton} onPress={pasteLink}>
              <Ionicons name="clipboard-outline" size={18} color={THEME.inkMuted} />
            </TouchableOpacity>
            {!!sourceUrl.trim() && (
              <TouchableOpacity style={styles.linkButton} onPress={openLink}>
                <Ionicons name="open-outline" size={18} color={THEME.inkMuted} />
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.label}>Note</Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={note}
            onChangeText={setNote}
            placeholder="Réserver, à tester, plat à goûter…"
            placeholderTextColor={THEME.inkFaint}
            multiline
            textAlignVertical="top"
          />

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          {isEditing && (
            <View style={styles.placeBox}>
              {isHotel ? (
                placement ? (
                  <>
                    <Text style={styles.placeTitle}>Séjour créé</Text>
                    <Text style={styles.placeSub}>Cet hôtel est dans vos séjours réservés, à partir du jour {placement.dayIndex + 1}.</Text>
                    <TouchableOpacity style={styles.placeAction} onPress={() => navigation.navigate("Hotels", { tripId })}>
                      <Ionicons name="bed-outline" size={16} color={THEME.teal} />
                      <Text style={styles.placeActionText}>Ouvrir les hôtels</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.placeTitle}>Pas encore réservé ?</Text>
                    <Text style={styles.placeSub}>Créez le séjour (dates, prix) : les nuits comptent alors dans le budget.</Text>
                    <TouchableOpacity style={styles.placeAction} onPress={bookHotel}>
                      <Ionicons name="bed-outline" size={16} color={THEME.teal} />
                      <Text style={styles.placeActionText}>Créer le séjour</Text>
                    </TouchableOpacity>
                  </>
                )
              ) : placement ? (
                <>
                  <Text style={styles.placeTitle}>
                    Placée au jour {placement.dayIndex + 1}
                    {placementDate ? ` · ${formatDateLabel(placementDate)}` : ""}
                  </Text>
                  <View style={styles.placeButtons}>
                    <TouchableOpacity style={[styles.placeAction, { flex: 1 }]} onPress={() => setPickerOpen(true)}>
                      <Ionicons name="swap-horizontal" size={16} color={THEME.teal} />
                      <Text style={styles.placeActionText}>Changer de jour</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.placeAction, { flex: 1, borderColor: THEME.stamp }]} onPress={removeFromProgramme}>
                      <Ionicons name="remove-circle-outline" size={16} color={THEME.stamp} />
                      <Text style={[styles.placeActionText, { color: THEME.stamp }]}>Retirer</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.placeTitle}>Pas encore dans le programme</Text>
                  <TouchableOpacity style={styles.placeAction} onPress={() => setPickerOpen(true)}>
                    <Ionicons name="calendar-outline" size={16} color={THEME.gold} />
                    <Text style={[styles.placeActionText, { color: THEME.gold }]}>Placer sur un jour</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {isEditing && (
            <TouchableOpacity style={styles.deleteButton} onPress={confirmDelete}>
              <Ionicons name="trash-outline" size={16} color={THEME.stamp} />
              <Text style={styles.deleteButtonText}>Supprimer cette idée</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <DayPickerModal
        visible={pickerOpen}
        trip={trip}
        title={`Placer « ${name.trim() || "cette idée"} »`}
        currentDayId={placement ? placement.day.id : null}
        onPick={placeOnDay}
        onRemove={placement ? removeFromProgramme : null}
        onClose={() => setPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  headerButton: { padding: 4 },
  headerButtonText: { color: THEME.inkMuted, fontSize: 15, fontFamily: FONTS.body },
  headerSaveText: { color: THEME.gold, fontFamily: FONTS.bodySemiBold },
  headerTitle: { color: THEME.ink, fontSize: 15.5, fontFamily: FONTS.headingSemiBold },
  scrollContent: { padding: 20, paddingBottom: 50 },
  label: { fontSize: 12.5, color: THEME.inkMuted, marginBottom: 6, marginTop: 16, fontFamily: FONTS.bodyMedium },
  input: {
    backgroundColor: THEME.bgCard,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: THEME.ink,
    fontSize: 15,
    fontFamily: FONTS.body,
  },
  noteInput: { minHeight: 80 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: { color: THEME.inkMuted, fontSize: 13, fontFamily: FONTS.bodyMedium },
  dot: { width: 8, height: 8, borderRadius: 4 },
  findButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: THEME.teal,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 14,
  },
  findButtonText: { color: THEME.teal, fontSize: 13.5, fontFamily: FONTS.bodySemiBold },
  candidateBox: {
    backgroundColor: THEME.bgCard,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    padding: 8,
    marginTop: 12,
    ...CARD_SHADOW,
  },
  candidateTitle: { color: THEME.inkMuted, fontSize: 12, padding: 8, paddingBottom: 4, fontFamily: FONTS.bodyMedium },
  candidateRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 8 },
  candidateName: { color: THEME.ink, fontSize: 14, fontFamily: FONTS.bodyMedium },
  candidateAddress: { color: THEME.inkFaint, fontSize: 11.5, marginTop: 2, fontFamily: FONTS.body },
  attribution: { color: THEME.inkFaint, fontSize: 10.5, textAlign: "center", paddingTop: 6, paddingBottom: 4, fontFamily: FONTS.body },
  positionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: THEME.tealDim,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 12,
  },
  positionText: { color: THEME.teal, fontSize: 12, fontFamily: FONTS.mono, flex: 1 },
  hintText: { color: THEME.inkFaint, fontSize: 12, lineHeight: 17, marginTop: 10, fontFamily: FONTS.body },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  linkButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: { color: THEME.stamp, fontSize: 12.5, marginTop: 14, fontFamily: FONTS.body },
  placeBox: {
    backgroundColor: THEME.bgCard,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 14,
    padding: 15,
    marginTop: 26,
  },
  placeTitle: { color: THEME.ink, fontSize: 14.5, fontFamily: FONTS.headingSemiBold },
  placeSub: { color: THEME.inkMuted, fontSize: 12.5, lineHeight: 18, marginTop: 5, fontFamily: FONTS.body },
  placeButtons: { flexDirection: "row", gap: 10 },
  placeAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: THEME.teal,
    borderRadius: 10,
    paddingVertical: 11,
    marginTop: 12,
  },
  placeActionText: { color: THEME.teal, fontSize: 13.5, fontFamily: FONTS.bodySemiBold },
  deleteButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 26, paddingVertical: 12 },
  deleteButtonText: { color: THEME.stamp, fontSize: 14, fontFamily: FONTS.body },
});
