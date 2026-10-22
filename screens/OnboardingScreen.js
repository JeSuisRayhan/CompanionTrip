// "Nouveau voyage": one page, top to bottom. The cover that follows what is typed, the kind of trip, its name, place and
// dates, then the money (all optional) and the ink of the trip. Pasting a ready-made programme stays possible, folded at
// the bottom. Only the name is needed to create the trip.
import React, { useState, useMemo, useEffect } from "react";
import { View, Text, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "../components/Icon";

import { THEME, FONTS, space, layout, radius, type, shadow, themedStyles } from "../lib/theme";
import { TRIP_TYPES, suggestRate } from "../lib/constants";
import { buildNewTrip, buildEmptyDays, daysFromScript, createTrip, setCoverImage, MAX_PLANNED_DAYS } from "../lib/trips";
import { loadTrips } from "../lib/storage";
import { parseDateInput, addDaysISO, diffDaysISO, formatDateRange } from "../lib/dates";
import DateField from "../components/DateField";
import TripCover from "../components/TripCover";
import { runScriptCorrection } from "../lib/script";
import { searchDestinationPhoto, trackUnsplashDownload } from "../lib/unsplash";
import { suggestedMoney } from "../lib/countries";
import { rateOfTheDay } from "../lib/rates";
import { parseBudgetInput } from "../lib/budget";
import MoneyField from "../components/MoneyField";
import { freeInkName } from "../lib/tripInk";
import VoiceInputButton from "../components/VoiceInputButton";
import { PickerField, CurrencyPickerModal, currencyLabel } from "../components/CurrencyPicker";
import { Txt, Button, Chip, Stamp, Field, Group, Row, SectionTitle } from "../components/ui";
import { TopButton } from "../components/mix";
import { InkSwatches } from "../components/InkSwatches";

// The person's own money: the budget is written in it. It can be changed later in the trip's settings.
const HOME_CURRENCY = "EUR";

// A rate as it is typed here: "0,30" rather than "0.3" (a comma, two decimals at least; a tiny rate keeps its digits).
function rateText(r) {
  let s = String(r);
  if (/e/i.test(s)) s = Number(r).toFixed(8).replace(/0+$/, "");
  const [whole, dec = ""] = s.split(".");
  return `${whole},${dec.padEnd(2, "0")}`;
}

// What each kind of trip is called on its chip.
const TYPE_LABELS = { long: "Voyage long", short: "Court / week-end", park: "Parc" };

export default function OnboardingScreen({ navigation }) {
  const [tripType, setTripType] = useState("long");
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [nbDays, setNbDays] = useState("");
  const [daysOpen, setDaysOpen] = useState(false); // the number of days is typed instead of the return date
  const [scriptOpen, setScriptOpen] = useState(false);
  const [script, setScript] = useState("");
  const [fixing, setFixing] = useState(false);
  const [fixError, setFixError] = useState("");
  const [fixStatus, setFixStatus] = useState("");
  const [creating, setCreating] = useState(false);

  // The ink of the trip: the first one the other trips do not wear, until the person picks one.
  const [trips, setTrips] = useState([]);
  const [chosenInk, setChosenInk] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadTrips()
      .then((list) => !cancelled && setTrips(list || []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const inkName = chosenInk || freeInkName(trips, tripType);

  // Money and budget (all optional). The local currency follows what the name and the destination talk about until the
  // person picks one; the rate of the day is fetched on its own until the person types one.
  const [chosenCurrency, setChosenCurrency] = useState(null); // null: follow the suggestion
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rate, setRate] = useState("");
  const [rateTouched, setRateTouched] = useState(false);
  const [rateBusy, setRateBusy] = useState(false);
  const [rateNote, setRateNote] = useState({ text: "", warn: false });
  const [rateRefresh, setRateRefresh] = useState(0);
  const [budget, setBudget] = useState("");
  const [budgetEntry, setBudgetEntry] = useState("home"); // the currency the budget is written in: "home" | "local"
  const suggestion = useMemo(() => suggestedMoney({ name, place: destination }), [name, destination]);
  const currency = chosenCurrency || (suggestion ? suggestion.currency : HOME_CURRENCY);

  // With a money other than the person's own: the rate of the day (or the approximate one, said so).
  useEffect(() => {
    if (currency === HOME_CURRENCY || rateTouched) return undefined;
    let cancelled = false;
    setRate("");
    setRateNote({ text: "", warn: false });
    setRateBusy(true);
    rateOfTheDay(currency, HOME_CURRENCY)
      .then((r) => {
        if (cancelled) return;
        if (r.rate) setRate(rateText(r.rate));
        setRateNote({ text: r.note, warn: r.warn });
        setRateBusy(false);
      })
      .catch(() => {
        if (!cancelled) setRateBusy(false);
      });
    return () => {
      cancelled = true;
      setRateBusy(false);
    };
  }, [currency, rateTouched, rateRefresh]);

  function pickCurrency(code) {
    setChosenCurrency(code);
    setRateTouched(false);
    setPickerOpen(false);
  }

  function refreshRate() {
    setRateTouched(false);
    setRateRefresh((n) => n + 1);
  }

  // What is kept on the trip: 1 when the money is the person's own; the rate shown, else the approximate one.
  function rateToKeep() {
    if (currency === HOME_CURRENCY) return 1;
    const r = parseFloat(String(rate).replace(",", "."));
    return r > 0 ? r : suggestRate(currency, HOME_CURRENCY) || 1;
  }

  const start = parseDateInput(startDate);
  const end = parseDateInput(endDate);
  const fromScript = script.trim().length > 0; // a pasted programme makes the days, whatever the dates say

  // Departure, return and number of days stay consistent with each other:
  // changing one recomputes another as soon as the inputs make that possible.
  function onStartChange(v) {
    setStartDate(v);
    const s = parseDateInput(v);
    if (!s) return;
    const n = parseInt(nbDays, 10);
    if (n >= 1 && n <= MAX_PLANNED_DAYS) {
      setEndDate(addDaysISO(s, n - 1)); // the whole trip shifts with its start
    } else {
      const e = parseDateInput(endDate);
      if (e && e >= s) setNbDays(String(diffDaysISO(s, e) + 1));
    }
  }

  function onEndChange(v) {
    setEndDate(v);
    const e = parseDateInput(v);
    if (start && e && e >= start) setNbDays(String(diffDaysISO(start, e) + 1));
  }

  function onNbChange(v) {
    const clean = v.replace(/[^0-9]/g, "");
    setNbDays(clean);
    const n = parseInt(clean, 10);
    if (start && n >= 1 && n <= MAX_PLANNED_DAYS) setEndDate(addDaysISO(start, n - 1));
  }

  // Number of empty days to create, or null when unknown.
  function resolvedDayCount() {
    const n = parseInt(nbDays, 10);
    if (n >= 1) return n;
    if (start && end && end >= start) return diffDaysISO(start, end) + 1;
    return null;
  }

  // What blocks the creation, if anything (a pasted programme brings its own days: the dates are not checked then).
  function infoProblem() {
    if (fromScript) return null;
    if (start && end && end < start) return "Le retour est avant le départ.";
    const n = parseInt(nbDays, 10);
    if (nbDays.trim() && !(n >= 1)) return "Indiquez au moins 1 jour.";
    if (n > MAX_PLANNED_DAYS) return `Maximum ${MAX_PLANNED_DAYS} jours.`;
    return null;
  }

  const problem = infoProblem();
  const dayCount = fromScript ? null : resolvedDayCount();
  const canCreate = !!name.trim() && !problem && !creating;
  const daysShown = daysOpen || !!nbDays; // once it holds a number (typed, or counted from the two dates) it stays

  // Which field owns the message above (same order as infoProblem), so it can be shown right under that field.
  const endBad = !!problem && !!start && !!end && end < start;
  const nbBad = !!problem && !endBad;

  function fixFormat() {
    if (!script.trim() || fixing) return;
    setFixing(true);
    setFixError("");
    setFixStatus("");
    try {
      const result = runScriptCorrection(script);
      if (result.changed) setScript(result.text);
      setFixStatus(result.changed ? "Reformaté automatiquement." : "Le texte semble déjà correct.");
    } catch (e) {
      setFixError(e.message || "La correction a échoué.");
    } finally {
      setFixing(false);
    }
  }

  async function finish() {
    if (!canCreate) return;
    setCreating(true);
    try {
      // a trip of a park, or from a programme, keeps what it is given; otherwise empty days to fill, dated when the start is known
      const days = fromScript ? daysFromScript(script, start) : buildEmptyDays({ startDate: start, nbDays: resolvedDayCount() });
      const trip = buildNewTrip({
        name,
        tripType,
        startDate: start,
        currency,
        homeCurrency: HOME_CURRENCY,
        rate: rateToKeep(),
        budgetTotal: parseBudgetInput(budget),
        budgetIn: currency !== HOME_CURRENCY ? budgetEntry : "home",
        days,
        planMode: fromScript || tripType === "park" ? "script" : "build",
        defaultLocation: destination,
        ink: inkName,
      });
      await createTrip(trip);

      // Best-effort cover photo — never blocks trip creation if it fails or
      // no Unsplash key is set.
      try {
        const photo = await searchDestinationPhoto(trip);
        if (photo) {
          await setCoverImage(trip.id, {
            url: photo.url,
            photographerName: photo.photographerName,
            photographerUrl: photo.photographerUrl,
          });
          trackUnsplashDownload(photo.downloadLocation);
        }
      } catch (e) {
        // no cover photo — the trip still works fine without one
      }

      // an empty trip opens on its programme, to note the first ideas; one made from a programme opens as any trip
      navigation.replace("Trip", { tripId: trip.id, initialTab: trip.planMode === "build" ? "programme" : undefined });
    } finally {
      setCreating(false);
    }
  }

  // Sentence under the dates.
  const willCreate = fromScript
    ? "Les jours viennent du programme collé plus bas."
    : dayCount
      ? `${dayCount} jour${dayCount !== 1 ? "s" : ""} vide${dayCount !== 1 ? "s" : ""} ${dayCount !== 1 ? "seront créés" : "sera créé"}` +
        (start ? ` (${formatDateRange(start, addDaysISO(start, Math.min(dayCount, MAX_PLANNED_DAYS) - 1))})` : "") +
        "."
      : "Sans durée, un seul jour est créé : vous en ajouterez ensuite.";

  const fixNote = fixing ? fixStatus || "Correction…" : fixStatus;

  // What the cover shows while the form is filled in
  const preview = {
    id: "preview",
    name: name.trim(),
    tripType,
    ink: inkName,
    defaultLocation: destination.trim() || null,
    startDate: start || null,
    days: [{ id: "preview-day", title: "", date: start || null, activities: [] }],
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <TopButton icon="chevron-back" label="Retour" onPress={() => navigation.goBack()} />
          <Text style={styles.headTitle} numberOfLines={1} accessibilityRole="header">Nouveau voyage</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.block}>
            <View style={styles.coverCard} accessible accessibilityLabel="Aperçu de la couverture du voyage">
              <TripCover trip={preview} height={120}>
                <View style={styles.coverStamp} pointerEvents="none">
                  <Stamp label="Aperçu" tone={inkName} small decorative />
                </View>
              </TripCover>
            </View>
            <View style={styles.chips} accessibilityRole="radiogroup">
              {TRIP_TYPES.map((t) => (
                <Chip key={t.key} label={TYPE_LABELS[t.key] || t.label} accessibilityLabel={t.label} selected={tripType === t.key} onPress={() => setTripType(t.key)} />
              ))}
            </View>
          </View>

          <View style={styles.block}>
            <Field label="Nom du voyage" value={name} onChangeText={setName} placeholder="Japon, septembre 2026" returnKeyType="next" style={styles.tight} />
            <Field
              label="Destination"
              value={destination}
              onChangeText={setDestination}
              placeholder="Djerba, Tunisie"
              hint="Pour la météo, les adresses et la monnaie."
              returnKeyType="done"
              style={styles.tight}
            />
            <View style={styles.twoCols}>
              <DateField label="Départ" optional compact value={startDate} onChange={onStartChange} style={styles.col} />
              <DateField label="Retour" optional compact value={endDate} min={start || undefined} onChange={onEndChange} error={endBad ? problem : undefined} style={styles.col} />
            </View>
            {!fromScript && !daysShown && !end ? (
              <Pressable onPress={() => setDaysOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Indiquer un nombre de jours à la place des dates">
                <Text style={[type.subhead, styles.link]}>Pas de dates ? Indiquez un nombre de jours</Text>
              </Pressable>
            ) : null}
            {!fromScript && daysShown ? (
              <View style={styles.daysRow}>
                <Field
                  label="Nombre de jours"
                  value={nbDays}
                  onChangeText={onNbChange}
                  placeholder="—"
                  keyboardType="number-pad"
                  maxLength={2}
                  error={nbBad ? problem : undefined}
                  inputStyle={styles.numericInput}
                  style={styles.daysField}
                />
                <Text style={[type.caption, styles.daysNote]}>{willCreate}</Text>
              </View>
            ) : null}
            {fromScript ? <Text style={type.caption}>{willCreate}</Text> : null}
            {end && !start && !nbDays.trim() && !fromScript ? <Text style={type.caption}>Ajoutez aussi le départ pour utiliser la date de retour.</Text> : null}
          </View>

          <View style={styles.stack}>
            <SectionTitle title="Argent" right={<Stamp label="Facultatif" tone="neutral" small tilt={0} decorative />} style={styles.sectionHead} />
            <View style={styles.block}>
              <View>
                <PickerField label="Monnaie sur place" value={currencyLabel(currency)} onPress={() => setPickerOpen(true)} style={styles.tight} />
                {suggestion && !chosenCurrency ? (
                  <View style={styles.checkHint}>
                    <Icon name="checkmark" size={16} color={THEME.teal} />
                    <Text style={[type.caption, styles.checkHintText]}>{suggestion.country.name} : proposée d'après le nom ou la destination.</Text>
                  </View>
                ) : null}
              </View>

              {currency !== HOME_CURRENCY ? (
                <View>
                  <View style={styles.rateRow}>
                    <Field
                      label="Taux de conversion"
                      value={rate}
                      onChangeText={(v) => {
                        setRate(v);
                        setRateTouched(true);
                      }}
                      keyboardType="decimal-pad"
                      placeholder={rateBusy ? "…" : "0,00"}
                      left={<Text style={[type.caption, styles.rateSide]} numberOfLines={1}>1 {currency} =</Text>}
                      right={<Text style={styles.unit}>€</Text>}
                      inputStyle={styles.numericInput}
                      style={styles.rateField}
                    />
                    <Button title="Taux du jour" variant="secondary" loading={rateBusy} disabled={rateBusy} onPress={refreshRate} />
                  </View>
                  {rateNote.text ? (
                    <Text style={[type.caption, { color: rateNote.warn ? THEME.stamp : THEME.inkFaint, marginTop: 6 }]} accessibilityLiveRegion="polite">
                      {rateNote.text}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <MoneyField
                label="Budget total du voyage"
                money={{ home: HOME_CURRENCY, local: currency, rate: rateToKeep(), different: currency !== HOME_CURRENCY }}
                entry={budgetEntry}
                onEntryChange={setBudgetEntry}
                value={budget}
                onChangeText={setBudget}
                placeholder="Pas de budget fixé"
                hint="Ce que vous comptez dépenser en tout, dans la devise de votre choix."
                inputStyle={budget ? styles.numericInput : null}
                style={styles.tight}
              />
            </View>
          </View>

          <View style={styles.stack}>
            <SectionTitle title="Encre du voyage" style={styles.sectionHead} />
            <View style={styles.block}>
              <InkSwatches value={inkName} onChange={setChosenInk} />
              <Text style={type.caption}>Elle colore la couverture, le cachet, les tampons et les chiffres du voyage.</Text>
            </View>
          </View>

          <View style={styles.stack}>
            <SectionTitle title="Programme" right={<Stamp label="Facultatif" tone="neutral" small tilt={0} decorative />} style={styles.sectionHead} />
            <View style={styles.block}>
              <Group>
                <Row
                  icon="document-text-outline"
                  title="J'ai déjà mon programme"
                  subtitle={scriptOpen ? "Collez-le ci-dessous : les jours et les étapes sont créés pour vous." : fromScript ? "Programme collé" : "Le coller pour créer les jours et les étapes"}
                  right={<Icon name={scriptOpen ? "chevron-up" : "chevron-down"} size={20} color={THEME.inkMuted} />}
                  onPress={() => setScriptOpen((o) => !o)}
                  accessibilityLabel={`J'ai déjà mon programme. ${scriptOpen ? "Replier" : "Déplier"}`}
                />
              </Group>
              {scriptOpen ? (
                <>
                  <View style={styles.helpRow}>
                    <Txt variant="subhead" style={styles.helpText}>
                      Collez votre programme, même en vrac. Une ligne « Jour N - date - titre » pour démarrer une journée, puis des lignes « HH:MM activité [type] ».
                    </Txt>
                    <VoiceInputButton onResult={(t) => setScript((prev) => (prev ? prev + "\n" : "") + t)} />
                  </View>
                  <Field
                    multiline
                    value={script}
                    onChangeText={(t) => {
                      setScript(t);
                      setFixStatus("");
                      setFixError("");
                    }}
                    placeholder={"Jour 1 - Rome\n09:00 Vol Paris - Rome [transport]"}
                    accessibilityLabel="Programme du voyage"
                    inputStyle={styles.scriptInput}
                    style={styles.tight}
                  />
                  <Button title="Vérifier / corriger le format" icon="sparkles" variant="secondary" full loading={fixing} disabled={!script.trim()} onPress={fixFormat} />
                  {fixNote ? (
                    <Text style={[type.caption, { color: fixing ? THEME.inkMuted : THEME.teal }]} accessibilityLiveRegion="polite">{fixNote}</Text>
                  ) : null}
                  {fixError ? (
                    <Text style={[type.caption, { color: THEME.stamp }]} accessibilityLiveRegion="polite">{fixError}</Text>
                  ) : null}
                </>
              ) : null}
            </View>
          </View>
        </ScrollView>

        <View style={styles.dock}>
          {!name.trim() ? <Text style={[type.caption, styles.dockHint]}>Donnez un nom au voyage pour le créer.</Text> : null}
          <Button title="Créer le voyage" size="lg" full loading={creating} disabled={!canCreate} onPress={finish} />
        </View>
      </KeyboardAvoidingView>

      <CurrencyPickerModal visible={pickerOpen} selected={currency} onClose={() => setPickerOpen(false)} onSelect={pickCurrency} />
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: layout.gutter, paddingTop: space.sm },
  headTitle: { flex: 1, ...type.title, fontSize: 24, lineHeight: 28 },
  scrollContent: { paddingHorizontal: layout.gutter, paddingTop: 20, paddingBottom: 28, gap: 22 },
  block: { gap: 14 },
  stack: { gap: 14 },
  sectionHead: { marginBottom: 0 },
  // the cover is a card with a fine edge
  coverCard: { borderRadius: radius.lg + 2, overflow: "hidden", boxShadow: shadow.card },
  coverStamp: { position: "absolute", left: 14, top: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tight: { marginBottom: 0 },
  twoCols: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  col: { flex: 1, marginBottom: 0 },
  daysRow: { flexDirection: "row", alignItems: "flex-end", gap: 14 },
  daysField: { width: 132, marginBottom: 0 },
  daysNote: { flex: 1, paddingBottom: 6 },
  link: { color: THEME.mark, textDecorationLine: "underline" },
  numericInput: { fontFamily: FONTS.monoMed, fontSize: 22, lineHeight: 26, minWidth: 0 },
  unit: { fontFamily: FONTS.bodySemi, fontSize: 17, lineHeight: 22, color: THEME.ink },
  checkHint: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  checkHintText: { flex: 1, color: THEME.inkFaint },
  rateRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  rateField: { flex: 1, marginBottom: 0 },
  rateSide: { marginRight: space.sm, color: THEME.inkMuted, flexShrink: 0 },
  // The dictation error (rare) wraps onto its own line under the help text.
  helpRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "flex-end", columnGap: space.md, rowGap: space.sm },
  helpText: { flexGrow: 1, flexShrink: 1, flexBasis: space.xxxl * 4 },
  scriptInput: { minHeight: space.xxxl * 4 },
  dock: { paddingHorizontal: layout.gutter, paddingTop: 14, paddingBottom: 14, gap: 10, backgroundColor: THEME.bg, borderTopWidth: 1, borderTopColor: THEME.hairStrong },
  dockHint: { textAlign: "center" },
}));
