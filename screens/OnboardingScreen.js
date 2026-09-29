import React, { useState, useMemo } from "react";
import { View, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { THEME, space, layout, radius, type } from "../lib/theme";
import { TRIP_TYPES } from "../lib/constants";
import { buildNewTrip, buildEmptyDays, daysFromScript, createTrip, setCoverImage, MAX_PLANNED_DAYS } from "../lib/trips";
import { parseDateInput, addDaysISO, diffDaysISO, formatDateRange } from "../lib/dates";
import { runScriptCorrection } from "../lib/script";
import { getSetting } from "../lib/storage";
import { searchDestinationPhoto, trackUnsplashDownload } from "../lib/unsplash";
import VoiceInputButton from "../components/VoiceInputButton";
import { Txt, Button, IconButton, Group, Row, Field } from "../components/ui";

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

  // The park type keeps the classic flow: the idea-based planner (distances
  // between places) makes no sense inside a single park.
  const mode = tripType === "park" ? "script" : planMode;
  const steps = useMemo(() => {
    const list = ["type"];
    if (tripType !== "park") list.push("mode");
    list.push("info");
    if (mode === "script") list.push("script");
    return list;
  }, [tripType, mode]);
  const stepCount = steps.length;
  const current = steps[Math.min(step, stepCount) - 1];
  const isLastStep = step >= stepCount;

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
    if (startDate.trim() && !start) return "Date de départ non reconnue — utilisez AAAA-MM-JJ ou JJ/MM/AAAA.";
    if (mode !== "build") return null;
    if (endDate.trim() && !end) return "Date de retour non reconnue — utilisez AAAA-MM-JJ ou JJ/MM/AAAA.";
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
  const startBad = !!problem && !!startDate.trim() && !start;
  const endBad = !!problem && !startBad && ((!!endDate.trim() && !end) || (!!start && !!end && end < start));
  const nbBad = !!problem && !startBad && !endBad;

  async function fixWithAI() {
    if (!script.trim() || fixing) return;
    setFixing(true);
    setFixError("");
    setFixStatus("");
    try {
      const apiKey = await getSetting("anthropicApiKey");
      const result = await runScriptCorrection(script, apiKey, { onProgress: setFixStatus });
      if (result.changed) setScript(result.text);
      setFixStatus(result.changed ? (result.usedAI ? "Reformaté via l'IA." : "Reformaté automatiquement.") : "Le texte semble déjà correct.");
    } catch (e) {
      setFixError(
        e && e.code === "NO_API_KEY"
          ? "Aucune structure trouvée. Ajoutez une clé API dans Réglages pour activer la correction IA, ou décrivez chaque étape sur sa propre ligne."
          : e.message || "La correction a échoué."
      );
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
        currency: "EUR",
        homeCurrency: "EUR",
        days,
        planMode: mode,
        defaultLocation: mode === "build" ? destination : null,
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

              {mode === "build" && (
                <Field
                  label="Destination (optionnel)"
                  value={destination}
                  onChangeText={setDestination}
                  placeholder="Djerba, Tunisie"
                  hint="Sert à la météo et à la recherche des adresses."
                />
              )}

              <Field
                label="Date de départ (optionnel)"
                value={startDate}
                onChangeText={mode === "build" ? onStartChange : setStartDate}
                placeholder="2026-09-15"
                autoCapitalize="none"
                error={startBad ? problem : undefined}
                hint="AAAA-MM-JJ ou JJ/MM/AAAA"
              />

              {mode === "build" && (
                <>
                  <View style={[styles.twoCols, { marginBottom: problem ? space.lg : space.sm }]}>
                    <Field
                      label="Date de retour"
                      value={endDate}
                      onChangeText={onEndChange}
                      placeholder="2026-09-22"
                      autoCapitalize="none"
                      error={endBad ? problem : undefined}
                      style={styles.colEnd}
                    />
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
                onPress={fixWithAI}
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
          style={[styles.stepSegment, { backgroundColor: i + 1 < index ? THEME.teal : i + 1 === index ? THEME.gold : THEME.bgCardAlt }]}
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
        <Ionicons
          name={selected ? "checkmark-circle" : "radio-button-off"}
          size={24}
          color={selected ? THEME.gold : THEME.inkFaint}
        />
      }
      style={[styles.choiceRow, selected && styles.choiceRowOn]}
    />
  );
}

const styles = StyleSheet.create({
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
  notes: { gap: space.xs, marginBottom: space.lg },
  // The dictation error (rare) wraps onto its own line under the help text.
  helpRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "flex-end", columnGap: space.md, rowGap: space.sm, marginBottom: space.lg },
  helpText: { flexGrow: 1, flexShrink: 1, flexBasis: space.xxxl * 4 },
  scriptInput: { minHeight: space.xxxl * 4 },
  note: { marginTop: space.md },
  footer: { paddingHorizontal: layout.gutter, paddingTop: space.md, paddingBottom: space.lg },
});
