import React, { useState, useMemo, useEffect } from "react";
import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "../components/Icon";

import { THEME, space, layout, radius, type, themedStyles } from "../lib/theme";
import { TRIP_TYPES, suggestRate } from "../lib/constants";
import { buildNewTrip, buildEmptyDays, daysFromScript, createTrip, setCoverImage, MAX_PLANNED_DAYS } from "../lib/trips";
import { parseDateInput, addDaysISO, diffDaysISO, formatDateRange } from "../lib/dates";
import DateField from "../components/DateField";
import { runScriptCorrection } from "../lib/script";
import { searchDestinationPhoto, trackUnsplashDownload } from "../lib/unsplash";
import { suggestedMoney } from "../lib/countries";
import { rateOfTheDay } from "../lib/rates";
import { parseBudgetInput } from "../lib/budget";
import VoiceInputButton from "../components/VoiceInputButton";
import { PickerField, CurrencyPickerModal, currencyLabel } from "../components/CurrencyPicker";
import { Txt, Button, IconButton, Group, Row, Field } from "../components/ui";

// The person's own money: the budget is written in it. It can be changed later in the trip's settings.
const HOME_CURRENCY = "EUR";

const MODE_CHOICES = [
  {
    key: "build",
    icon: "bulb",
    label: "Construire mon voyage",
    text: "Je note mes envies, l'app m'aide à les organiser jour par jour.",
  },
  {
    key: "script",
    icon: "document-text",
    label: "J'ai déjà mon programme",
    text: "Je colle mon programme, ou je remplis chaque journée.",
  },
];

// One line of context per trip type, and the tone it wears everywhere else
// in the app (same mapping as the trip list on the home screen).
const TYPE_META = {
  long: { tone: "gold", text: "Plusieurs jours, plusieurs villes ou étapes." },
  short: { tone: "teal", text: "Une escapade de quelques jours au même endroit." },
  park: { tone: "pink", text: "Une ou deux journées à enchaîner les attractions." },
};

export default function OnboardingScreen({ navigation }) {
  const [step, setStep] = useState(1);
  const [tripType, setTripType] = useState("long");
  const [planMode, setPlanMode] = useState("script"); // "script" | "build"
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [nbDays, setNbDays] = useState("");
  const [script, setScript] = useState("");
  const [fixing, setFixing] = useState(false);
  const [fixError, setFixError] = useState("");
  const [fixStatus, setFixStatus] = useState("");
  const [creating, setCreating] = useState(false);

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
  const suggestion = useMemo(() => suggestedMoney({ name, place: destination }), [name, destination]);
  const currency = chosenCurrency || (suggestion ? suggestion.currency : HOME_CURRENCY);

  // The park type keeps the classic flow: the idea-based planner (distances
  // between places) makes no sense inside a single park.
  const mode = tripType === "park" ? "script" : planMode;
  const steps = useMemo(() => {
    const list = ["type"];
    if (tripType !== "park") list.push("mode");
    list.push("info", "money");
    if (mode === "script") list.push("script");
    return list;
  }, [tripType, mode]);
  const stepCount = steps.length;
  const current = steps[Math.min(step, stepCount) - 1];
  const isLastStep = step >= stepCount;

  // Once the money step is reached, with a money other than the person's own: the rate of the day (or the approximate
  // one, said so). It goes on if the person moves on to the next step before the answer comes.
  const moneySeen = step >= steps.indexOf("money") + 1;
  useEffect(() => {
    if (!moneySeen || currency === HOME_CURRENCY || rateTouched) return undefined;
    let cancelled = false;
    setRate("");
    setRateNote({ text: "", warn: false });
    setRateBusy(true);
    rateOfTheDay(currency, HOME_CURRENCY)
      .then((r) => {
        if (cancelled) return;
        if (r.rate) setRate(String(r.rate));
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
  }, [moneySeen, currency, rateTouched, rateRefresh]);

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

  function goBack() {
    if (step === 1) {
      navigation.goBack();
    } else {
      setStep(step - 1);
    }
  }

  const start = parseDateInput(startDate);
  const end = parseDateInput(endDate);

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

  // Number of empty days to create in "build" mode, or null when unknown.
  function resolvedDayCount() {
    const n = parseInt(nbDays, 10);
    if (n >= 1) return n;
    if (start && end && end >= start) return diffDaysISO(start, end) + 1;
    return null;
  }

  // What blocks the "info" step, if anything (build mode only; script mode
  // keeps its single optional date).
  function infoProblem() {
    if (mode !== "build") return null;
    if (start && end && end < start) return "Le retour est avant le départ.";
    const n = parseInt(nbDays, 10);
    if (nbDays.trim() && !(n >= 1)) return "Indiquez au moins 1 jour.";
    if (n > MAX_PLANNED_DAYS) return `Maximum ${MAX_PLANNED_DAYS} jours.`;
    return null;
  }

  const problem = current === "info" ? infoProblem() : null;
  const dayCount = mode === "build" ? resolvedDayCount() : null;
  const canContinue = current !== "info" || (!!name.trim() && !problem);

  // Which field owns the message above (same order as infoProblem), so it can
  // be shown right under that field.
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
    if (!name.trim() || creating || infoProblem()) return;
    setCreating(true);
    try {
      const days = mode === "build" ? buildEmptyDays({ startDate: start, nbDays: resolvedDayCount() }) : daysFromScript(script, start);
      const trip = buildNewTrip({
        name,
        tripType,
        startDate: start,
        currency,
        homeCurrency: HOME_CURRENCY,
        rate: rateToKeep(),
        budgetTotal: parseBudgetInput(budget),
        days,
        planMode: mode,
        defaultLocation: destination,
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

      navigation.replace("Trip", { tripId: trip.id, initialTab: mode === "build" ? "ideas" : undefined });
    } finally {
      setCreating(false);
    }
  }

  // Sentence under the date fields (build mode).
  const willCreate = dayCount
    ? `${dayCount} jour${dayCount !== 1 ? "s" : ""} vide${dayCount !== 1 ? "s" : ""} ${dayCount !== 1 ? "seront créés" : "sera créé"}` +
      (start ? ` (${formatDateRange(start, addDaysISO(start, Math.min(dayCount, MAX_PLANNED_DAYS) - 1))})` : "") +
      "."
    : null;

  const fixNote = fixing ? fixStatus || "Correction…" : fixStatus;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <IconButton icon="chevron-back" label="Retour" tone="neutral" onPress={goBack} style={styles.back} />
          <StepBar count={stepCount} index={Math.min(step, stepCount)} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {current === "type" && (
            <>
              <Txt variant="title" accessibilityRole="header" style={styles.title}>
                Quel type de voyage ?
              </Txt>
              <Group>
                {TRIP_TYPES.map((t) => {
                  const meta = TYPE_META[t.key] || { tone: "neutral" };
                  return (
                    <ChoiceRow
                      key={t.key}
                      icon={t.icon}
                      tone={meta.tone}
                      title={t.label}
                      subtitle={meta.text}
                      selected={tripType === t.key}
                      onPress={() => setTripType(t.key)}
                    />
                  );
                })}
              </Group>
            </>
          )}

          {current === "mode" && (
            <>
              <Txt variant="title" accessibilityRole="header" style={styles.title}>
                Comment préparez-vous ce voyage ?
              </Txt>
              <Group>
                {MODE_CHOICES.map((m) => (
                  <ChoiceRow
                    key={m.key}
                    icon={m.icon}
                    title={m.label}
                    subtitle={m.text}
                    selected={planMode === m.key}
                    onPress={() => setPlanMode(m.key)}
                  />
                ))}
              </Group>
            </>
          )}

          {current === "info" && (
            <>
              <Txt variant="title" accessibilityRole="header" style={styles.title}>
                Quelques infos
              </Txt>
              <Field label="Nom du voyage" value={name} onChangeText={setName} placeholder="Japon, septembre 2026" />

              <Field
                label="Destination (optionnel)"
                value={destination}
                onChangeText={setDestination}
                placeholder="Djerba, Tunisie"
                hint="Sert à la météo, à la recherche des adresses et à proposer la monnaie."
              />

              <DateField label="Date de départ (optionnel)" optional value={startDate} onChange={mode === "build" ? onStartChange : setStartDate} />

              {mode === "build" && (
                <>
                  <View style={[styles.twoCols, { marginBottom: problem ? space.lg : space.sm }]}>
                    <DateField label="Date de retour" optional compact value={endDate} min={start || undefined} onChange={onEndChange} error={endBad ? problem : undefined} style={styles.colEnd} />
                    <Field
                      label="ou nombre de jours"
                      value={nbDays}
                      onChangeText={onNbChange}
                      placeholder="7"
                      keyboardType="number-pad"
                      maxLength={2}
                      error={nbBad ? problem : undefined}
                      inputStyle={styles.numericInput}
                      style={styles.colNb}
                    />
                  </View>
                  {!problem && (
                    <View style={styles.notes}>
                      {dayCount ? (
                        <Txt variant="caption">{willCreate}</Txt>
                      ) : (
                        <Txt variant="caption" color="inkFaint">
                          Facultatif : sans durée, un seul jour est créé et vous en ajoutez ensuite. Vous pouvez toujours décaler ou ajouter des jours.
                        </Txt>
                      )}
                      {end && !start && !nbDays.trim() ? (
                        <Txt variant="caption" color="inkFaint">
                          Ajoutez aussi la date de départ pour utiliser la date de retour.
                        </Txt>
                      ) : null}
                    </View>
                  )}
                </>
              )}
            </>
          )}

          {current === "money" && (
            <>
              <Txt variant="title" accessibilityRole="header" style={styles.title}>
                Budget et monnaie (optionnel)
              </Txt>
              <Txt variant="subhead" style={styles.intro}>
                Facultatif : vous pouvez passer cette étape et tout régler plus tard, dans les réglages du voyage.
              </Txt>

              <PickerField label="Monnaie sur place" value={currencyLabel(currency)} onPress={() => setPickerOpen(true)} />
              {suggestion && !chosenCurrency ? (
                <Txt variant="caption" color="inkFaint" style={styles.moneyNote}>
                  {suggestion.country.name} : monnaie proposée d'après le nom ou la destination. Vous pouvez la changer.
                </Txt>
              ) : null}

              {currency !== HOME_CURRENCY && (
                <>
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
                      left={<Text style={[type.numeralSmall, styles.rateSide]}>1 {currency} =</Text>}
                      right={<Text style={type.numeralSmall}>{HOME_CURRENCY}</Text>}
                      inputStyle={styles.numericInput}
                      style={styles.rateField}
                    />
                    <Button title="Taux du jour" variant="secondary" loading={rateBusy} disabled={rateBusy} onPress={refreshRate} />
                  </View>
                  {rateNote.text ? (
                    <Txt variant="caption" color={rateNote.warn ? "stamp" : "teal"} style={styles.moneyNote} accessibilityLiveRegion="polite">
                      {rateNote.text}
                    </Txt>
                  ) : null}
                </>
              )}

              <Field
                label="Budget total du voyage"
                value={budget}
                onChangeText={setBudget}
                keyboardType="decimal-pad"
                placeholder="Pas de budget fixé"
                hint={`En ${HOME_CURRENCY} : ce que vous comptez dépenser en tout.`}
                inputStyle={styles.numericInput}
                right={<Text style={type.numeralSmall}>{HOME_CURRENCY}</Text>}
              />
            </>
          )}

          {current === "script" && (
            <>
              <Txt variant="title" accessibilityRole="header" style={styles.title}>
                Programme (optionnel)
              </Txt>
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
              />
              <Button
                title="Vérifier / corriger le format"
                icon="sparkles"
                variant="secondary"
                full
                loading={fixing}
                disabled={!script.trim()}
                onPress={fixFormat}
              />
              {fixNote ? (
                <Txt variant="caption" color={fixing ? "inkMuted" : "teal"} style={styles.note} accessibilityLiveRegion="polite">
                  {fixNote}
                </Txt>
              ) : null}
              {fixError ? (
                <Txt variant="caption" color="stamp" style={styles.note} accessibilityLiveRegion="polite">
                  {fixError}
                </Txt>
              ) : null}
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {!isLastStep && <Button title="Continuer" size="lg" full disabled={!canContinue} onPress={() => setStep(step + 1)} />}
          {isLastStep && (
            <Button title="Créer le voyage" size="lg" full loading={creating} disabled={creating || !canContinue} onPress={finish} />
          )}
        </View>
      </KeyboardAvoidingView>

      <CurrencyPickerModal visible={pickerOpen} selected={currency} onClose={() => setPickerOpen(false)} onSelect={pickCurrency} />
    </SafeAreaView>
  );
}

// Progress through a real sequence: done = teal, current = gold, to come = sunk.
function StepBar({ count, index }) {
  return (
    <View
      style={styles.stepBar}
      accessibilityRole="progressbar"
      accessibilityLabel={`Étape ${index} sur ${count}`}
      accessibilityValue={{ min: 1, max: count, now: index }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[styles.stepSegment, { backgroundColor: i + 1 < index ? THEME.teal : i + 1 === index ? THEME.mark : THEME.bgCardAlt }]}
        />
      ))}
    </View>
  );
}

// A big selectable row: icon tile, title, one line of context, and a
// radio / gold check on the right. The selected row is lifted, not boxed.
function ChoiceRow({ icon, tone, title, subtitle, selected, onPress }) {
  return (
    <Row
      icon={icon}
      tone={tone}
      title={title}
      subtitle={subtitle}
      selected={selected}
      onPress={onPress}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      right={
        <Icon
          name={selected ? "checkmark-circle" : "radio-button-off"}
          size={24}
          color={selected ? THEME.mark : THEME.inkFaint}
        />
      }
      style={[styles.choiceRow, selected && styles.choiceRowOn]}
    />
  );
}

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: layout.gutter, paddingTop: space.sm },
  back: { marginLeft: -space.sm },
  stepBar: { flex: 1, flexDirection: "row", gap: space.xs },
  stepSegment: { flex: 1, height: space.xs, borderRadius: radius.full },
  scrollContent: { paddingHorizontal: layout.gutter, paddingTop: space.lg, paddingBottom: space.xl },
  title: { marginBottom: space.xl },
  choiceRow: { paddingVertical: space.lg },
  choiceRowOn: { backgroundColor: THEME.bgCardAlt },
  twoCols: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  colEnd: { flex: 3, marginBottom: 0 },
  colNb: { flex: 2, marginBottom: 0 },
  numericInput: { ...type.numeral },
  intro: { marginBottom: space.lg },
  moneyNote: { marginBottom: space.lg },
  rateRow: { flexDirection: "row", alignItems: "flex-end", gap: space.md, marginBottom: space.sm },
  rateField: { flex: 1, marginBottom: 0 },
  rateSide: { marginRight: space.sm },
  notes: { gap: space.xs, marginBottom: space.lg },
  // The dictation error (rare) wraps onto its own line under the help text.
  helpRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "flex-end", columnGap: space.md, rowGap: space.sm, marginBottom: space.lg },
  helpText: { flexGrow: 1, flexShrink: 1, flexBasis: space.xxxl * 4 },
  scriptInput: { minHeight: space.xxxl * 4 },
  note: { marginTop: space.md },
  footer: { paddingHorizontal: layout.gutter, paddingTop: space.md, paddingBottom: space.lg },
}));
