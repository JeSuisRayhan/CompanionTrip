import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect } from "@react-navigation/native";

import { THEME, TONES, space, layout, type, themedStyles } from "../lib/theme";
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
import { Txt, Button, IconButton, Chip, Badge, Surface, Group, Row, Field, ModalHeader } from "../components/ui";

// A category stores its colour; the tone with the same foreground gives the
// tinted pair that Chip expects.
function toneOfCategory(cat) {
  return Object.keys(TONES).find((k) => TONES[k].fg === cat.color) || "neutral";
}

// Priority chips take the same colours as the dots in the idea list.
const PRIORITY_TONE = { must: "stamp", want: "gold", maybe: "neutral" };

// A labelled row of selectable chips (same label style as Field).
function Choices({ label, children }) {
  return (
    <View style={styles.choices}>
      <Txt variant="caption" style={styles.choicesLabel}>
        {label}
      </Txt>
      <View style={styles.chipWrap}>{children}</View>
    </View>
  );
}

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
  // Duration, price, link and note are folded away: most ideas only need a name,
  // a place and a priority. Open from the start when the idea already has some.
  const [moreOpen, setMoreOpen] = useState(false);

  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState(null); // null = never searched
  const [searchError, setSearchError] = useState("");
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
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
        setMoreOpen(existing.price != null || !!existing.sourceUrl || !!existing.note);
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
      // The name field is at the top; the save button is at the bottom, so bring the error into view.
      if (scrollRef.current && scrollRef.current.scrollTo) scrollRef.current.scrollTo({ y: 0, animated: true });
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
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ModalHeader
          title={isEditing ? "Modifier l'idée" : "Nouvelle idée"}
          left={{ label: "Annuler", onPress: () => navigation.goBack() }}
          right={{ label: "Enregistrer", onPress: save, disabled: saving }}
        />

        <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Field label="Nom du lieu" value={name} onChangeText={setName} placeholder="Restaurant chez Moktar" error={error} />

          <Choices label="Catégorie">
            {categories.map((c) => (
              <Chip key={c.id} label={c.label} icon={c.icon} tone={toneOfCategory(c)} selected={c.id === categoryId} onPress={() => pickCategory(c)} />
            ))}
          </Choices>

          <Field label="Adresse" value={address} onChangeText={setAddress} placeholder="Rue, quartier… (optionnel)" />
          <Field label="Ville" value={city} onChangeText={setCity} placeholder={trip.defaultLocation || "Midoun"} />

          <View style={styles.findBlock}>
            <Button title="Trouver sur la carte" icon="search" variant="secondary" full loading={searching} onPress={findPlace} />

            {!!searchError && (
              <Txt variant="caption" color="stamp" style={styles.note}>
                {searchError}
              </Txt>
            )}

            {candidates && candidates.length === 0 && (
              <Txt variant="caption" style={styles.note}>
                Aucun résultat. Précisez la ville, ou gardez l'adresse saisie à la main (l'idée sera « sans position »).
              </Txt>
            )}
            {candidates && candidates.length > 0 && (
              <View style={styles.candidates}>
                <Txt variant="subhead" style={styles.candidatesTitle}>
                  Touchez le bon lieu
                </Txt>
                <Group>
                  {candidates.map((r, i) => (
                    <Row key={`${r.osmRef || i}`} icon="location-outline" title={r.name} subtitle={r.address} onPress={() => applyCandidate(r)} />
                  ))}
                </Group>
                <Txt variant="caption" color="inkFaint" style={styles.attribution}>
                  © contributeurs OpenStreetMap
                </Txt>
              </View>
            )}

            {position && (
              <View style={styles.positionRow}>
                <Badge label="Position enregistrée" icon="checkmark-circle" tone="teal" style={styles.selfCenter} />
                <Text style={[type.numeralSmall, styles.flex]} numberOfLines={1}>
                  {position.lat.toFixed(4)}, {position.lng.toFixed(4)}
                </Text>
                <IconButton icon="close" label="Effacer la position" size={18} onPress={clearPosition} style={styles.positionClear} />
              </View>
            )}
            {!!openingHours && (
              <Txt variant="caption" style={styles.note}>
                Horaires (OpenStreetMap) : {openingHours}
              </Txt>
            )}
          </View>

          <Choices label="Priorité">
            {IDEA_PRIORITIES.map((p) => (
              <Chip key={p.key} label={p.label} tone={PRIORITY_TONE[p.key]} selected={priority === p.key} onPress={() => setPriority(p.key)} />
            ))}
          </Choices>

          {isMeal && (
            <Choices label="Repas">
              {MEAL_SLOTS.map((m) => (
                <Chip key={m.key} label={m.label} selected={mealSlot === m.key} onPress={() => setMealSlot(m.key)} />
              ))}
            </Choices>
          )}

          <Group style={styles.moreGroup}>
            <Row
              icon="options-outline"
              title="Plus d'options"
              subtitle={moreOpen ? undefined : isHotel ? "Lien, note" : "Durée, prix, lien, note"}
              accessibilityLabel={`Plus d'options, ${moreOpen ? "ouvertes" : "fermées"}`}
              onPress={() => setMoreOpen(!moreOpen)}
              right={<Ionicons name={moreOpen ? "chevron-up" : "chevron-down"} size={18} color={THEME.inkFaint} />}
            />
          </Group>

          {moreOpen && (
            <View style={styles.moreBody}>
              {!isHotel && (
                <Choices label="Durée sur place">
                  {DURATION_CHOICES.map((d) => (
                    <Chip
                      key={d}
                      label={formatIdeaDuration(d)}
                      selected={durationMin === d}
                      onPress={() => {
                        setDurationMin(d);
                        setDurationTouched(true);
                      }}
                    />
                  ))}
                </Choices>
              )}

              {!isHotel && (
                <Field label={`Prix estimé (${trip.currency}) — optionnel`} value={price} onChangeText={setPrice} placeholder="0" keyboardType="decimal-pad" inputStyle={type.numeral} />
              )}

              <Field
                label="Lien source (TikTok, YouTube, site…)"
                value={sourceUrl}
                onChangeText={setSourceUrl}
                placeholder="https://…"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                right={
                  <View style={styles.linkActions}>
                    <IconButton icon="clipboard-outline" label="Coller le lien" size={20} onPress={pasteLink} />
                    {!!sourceUrl.trim() && <IconButton icon="open-outline" label="Ouvrir le lien" size={20} onPress={openLink} />}
                  </View>
                }
              />

              <Field label="Note" value={note} onChangeText={setNote} placeholder="Réserver, à tester, plat à goûter…" multiline />
            </View>
          )}

          {isEditing && (
            <Surface pad="lg" style={styles.placeBox}>
              {isHotel ? (
                placement ? (
                  <>
                    <Txt variant="label">Séjour créé</Txt>
                    <Txt variant="subhead" style={styles.placeSub}>
                      Cet hôtel est dans vos séjours réservés, à partir du jour {placement.dayIndex + 1}.
                    </Txt>
                    <Button title="Ouvrir les hôtels" icon="bed-outline" variant="secondary" full style={styles.placeAction} onPress={() => navigation.navigate("Hotels", { tripId })} />
                  </>
                ) : (
                  <>
                    <Txt variant="label">Pas encore réservé ?</Txt>
                    <Txt variant="subhead" style={styles.placeSub}>
                      Créez le séjour (dates, prix) : les nuits comptent alors dans le budget.
                    </Txt>
                    <Button title="Créer le séjour" icon="bed-outline" tone="gold" full style={styles.placeAction} onPress={bookHotel} />
                  </>
                )
              ) : placement ? (
                <>
                  <Txt variant="label">
                    {`Placée au jour ${placement.dayIndex + 1}${placementDate ? ` · ${formatDateLabel(placementDate)}` : ""}`}
                  </Txt>
                  <View style={[styles.placeButtons, styles.placeAction]}>
                    <Button title="Changer de jour" icon="swap-horizontal" variant="secondary" size="sm" style={styles.flex} onPress={() => setPickerOpen(true)} />
                    <Button title="Retirer" icon="remove-circle-outline" variant="danger" size="sm" style={styles.flex} onPress={removeFromProgramme} />
                  </View>
                </>
              ) : (
                <>
                  <Txt variant="label">Pas encore dans le programme</Txt>
                  <Button title="Placer sur un jour" icon="calendar-outline" tone="gold" full style={styles.placeAction} onPress={() => setPickerOpen(true)} />
                </>
              )}
            </Surface>
          )}

          {isEditing && <Button title="Supprimer cette idée" icon="trash-outline" variant="danger" full style={styles.deleteButton} onPress={confirmDelete} />}
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

const styles = themedStyles(() => ({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scrollContent: { padding: layout.gutter, paddingBottom: space.xxxl },
  choices: { marginBottom: space.lg },
  choicesLabel: { marginBottom: space.sm - 2 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  findBlock: { marginBottom: space.lg },
  note: { marginTop: space.md },
  candidates: { marginTop: space.md },
  candidatesTitle: { marginBottom: space.sm },
  attribution: { textAlign: "center", marginTop: space.sm },
  positionRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md },
  selfCenter: { alignSelf: "center" },
  positionClear: { marginRight: -space.sm },
  linkActions: { flexDirection: "row", marginRight: -space.sm },
  moreGroup: { marginBottom: space.lg },
  moreBody: { marginBottom: space.sm },
  placeBox: { marginTop: space.md },
  placeSub: { marginTop: space.xs },
  placeAction: { marginTop: space.md },
  placeButtons: { flexDirection: "row", gap: space.sm },
  deleteButton: { marginTop: space.xl },
}));
