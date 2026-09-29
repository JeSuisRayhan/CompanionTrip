import React, { useState, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { THEME, CARD_SHADOW } from "../lib/theme";
import { FONTS } from "../lib/fonts";
import { TRIP_TYPES } from "../lib/constants";
import { buildNewTrip, buildEmptyDays, daysFromScript, createTrip, setCoverImage, MAX_PLANNED_DAYS } from "../lib/trips";
import { parseDateInput, addDaysISO, diffDaysISO, formatDateLabel } from "../lib/dates";
import { runScriptCorrection } from "../lib/script";
import { getSetting } from "../lib/storage";
import { searchDestinationPhoto, trackUnsplashDownload } from "../lib/unsplash";
import VoiceInputButton from "../components/VoiceInputButton";
import AnimatedPressable from "../components/AnimatedPressable";


const MODE_CHOICES = [
  {
    key: "build",
    icon: "bulb",
    label: "Construire mon voyage",
    text: "Je note mes envies (lieux, restos, activités…), puis l'app m'aide à en faire un planning jour par jour.",
  },
  {
    key: "script",
    icon: "document-text",
    label: "J'ai déjà mon programme",
    text: "Je colle mon programme, ou je remplis chaque journée moi-même.",
  },
];

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

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} style={styles.backButton}>
            <Ionicons name="chevron-back" size={22} color={THEME.ink} />
          </TouchableOpacity>
          <Text style={styles.stepLabel}>Étape {Math.min(step, stepCount)} sur {stepCount}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {current === "type" && (
            <>
              <Text style={styles.title}>Quel type de voyage ?</Text>
              {TRIP_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.typeCard, tripType === t.key && styles.typeCardActive]}
                  onPress={() => setTripType(t.key)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.typeIcon, tripType === t.key && { backgroundColor: THEME.goldDim }]}>
                    <Ionicons name={t.icon} size={20} color={tripType === t.key ? THEME.gold : THEME.inkMuted} />
                  </View>
                  <Text style={[styles.typeLabel, tripType === t.key && { color: THEME.ink }]}>{t.label}</Text>
                  {tripType === t.key && <Ionicons name="checkmark-circle" size={20} color={THEME.gold} />}
                </TouchableOpacity>
              ))}
            </>
          )}

          {current === "mode" && (
            <>
              <Text style={styles.title}>Comment préparez-vous ce voyage ?</Text>
              {MODE_CHOICES.map((m) => {
                const active = planMode === m.key;
                return (
                  <TouchableOpacity
                    key={m.key}
                    style={[styles.modeCard, active && styles.typeCardActive]}
                    onPress={() => setPlanMode(m.key)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.typeIcon, active && { backgroundColor: THEME.goldDim }]}>
                      <Ionicons name={m.icon} size={20} color={active ? THEME.gold : THEME.inkMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.modeTitle, active && { color: THEME.ink }]}>{m.label}</Text>
                      <Text style={styles.modeText}>{m.text}</Text>
                    </View>
                    {active && <Ionicons name="checkmark-circle" size={20} color={THEME.gold} />}
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          {current === "info" && (
            <>
              <Text style={styles.title}>Quelques infos</Text>
              <Text style={styles.label}>Nom du voyage</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Japon, septembre 2026"
                placeholderTextColor={THEME.inkFaint}
              />

              {mode === "build" && (
                <>
                  <Text style={styles.label}>Destination (optionnel)</Text>
                  <TextInput
                    style={styles.input}
                    value={destination}
                    onChangeText={setDestination}
                    placeholder="Djerba, Tunisie"
                    placeholderTextColor={THEME.inkFaint}
                  />
                  <Text style={styles.fieldHint}>Sert à la météo et à la recherche des adresses.</Text>
                </>
              )}

              <Text style={styles.label}>Date de départ (optionnel — AAAA-MM-JJ)</Text>
              <TextInput
                style={styles.input}
                value={startDate}
                onChangeText={mode === "build" ? onStartChange : setStartDate}
                placeholder="2026-09-15"
                placeholderTextColor={THEME.inkFaint}
                autoCapitalize="none"
              />

              {mode === "build" && (
                <>
                  <View style={styles.twoCols}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Date de retour</Text>
                      <TextInput
                        style={styles.input}
                        value={endDate}
                        onChangeText={onEndChange}
                        placeholder="2026-09-22"
                        placeholderTextColor={THEME.inkFaint}
                        autoCapitalize="none"
                      />
                    </View>
                    <View style={{ width: 120 }}>
                      <Text style={styles.label}>ou nb de jours</Text>
                      <TextInput
                        style={styles.input}
                        value={nbDays}
                        onChangeText={onNbChange}
                        placeholder="7"
                        placeholderTextColor={THEME.inkFaint}
                        keyboardType="number-pad"
                        maxLength={2}
                      />
                    </View>
                  </View>
                  {!problem && dayCount && (
                    <Text style={styles.okText}>
                      {dayCount} jour{dayCount !== 1 ? "s" : ""} vide{dayCount !== 1 ? "s" : ""} seront créés
                      {start ? ` · du ${formatDateLabel(start)}${dayCount > 1 ? ` au ${formatDateLabel(addDaysISO(start, Math.min(dayCount, MAX_PLANNED_DAYS) - 1))}` : ""}` : ""}.
                    </Text>
                  )}
                  {!problem && !dayCount && (
                    <Text style={styles.fieldHint}>
                      Facultatif : sans durée, un seul jour est créé et vous en ajoutez ensuite. Vous pouvez toujours décaler ou ajouter des jours.
                    </Text>
                  )}
                  {!problem && end && !start && !nbDays.trim() && (
                    <Text style={styles.fieldHint}>Ajoutez aussi la date de départ pour utiliser la date de retour.</Text>
                  )}
                </>
              )}
              {!!problem && <Text style={styles.warnText}>{problem}</Text>}
            </>
          )}

          {current === "script" && (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={styles.title}>Programme (optionnel)</Text>
                <VoiceInputButton onResult={(t) => setScript((prev) => (prev ? prev + "\n" : "") + t)} />
              </View>
              <Text style={styles.helpText}>
                Collez votre programme, même en vrac. Une ligne "Jour N - date - titre" pour démarrer une journée,
                puis des lignes "HH:MM activité [type]".
              </Text>
              <TextInput
                style={styles.textarea}
                value={script}
                onChangeText={(t) => { setScript(t); setFixStatus(""); setFixError(""); }}
                placeholder={"Jour 1 - Rome\n09:00 Vol Paris - Rome [transport]"}
                placeholderTextColor={THEME.inkFaint}
                multiline
                textAlignVertical="top"
              />
              <TouchableOpacity style={styles.fixButton} onPress={fixWithAI} disabled={!script.trim() || fixing}>
                {fixing ? (
                  <ActivityIndicator color={THEME.teal} size="small" />
                ) : (
                  <Ionicons name="sparkles" size={15} color={THEME.teal} />
                )}
                <Text style={styles.fixButtonText}>{fixing ? fixStatus || "Correction…" : "Vérifier / corriger le format"}</Text>
              </TouchableOpacity>
              {fixStatus && !fixing && <Text style={styles.okText}>{fixStatus}</Text>}
              {fixError && <Text style={styles.warnText}>{fixError}</Text>}
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {!isLastStep && (
            <AnimatedPressable
              style={[styles.primaryButton, !canContinue && styles.primaryButtonDisabled]}
              onPress={() => setStep(step + 1)}
              disabled={!canContinue}
            >
              <Text style={styles.primaryButtonText}>Continuer</Text>
            </AnimatedPressable>
          )}
          {isLastStep && (
            <AnimatedPressable
              style={[styles.primaryButton, !canContinue && styles.primaryButtonDisabled]}
              onPress={finish}
              disabled={creating || !canContinue}
            >
              {creating ? <ActivityIndicator color={THEME.bg} /> : <Text style={styles.primaryButtonText}>Créer le voyage</Text>}
            </AnimatedPressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: THEME.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10 },
  backButton: { padding: 6 },
  stepLabel: { color: THEME.inkFaint, fontSize: 12.5, marginLeft: 6, fontFamily: FONTS.body },
  scrollContent: { padding: 20, paddingBottom: 20 },
  title: { fontSize: 21, color: THEME.ink, marginBottom: 20, fontFamily: FONTS.headingBold },
  label: { fontSize: 12.5, color: THEME.inkMuted, marginBottom: 6, marginTop: 14, fontFamily: FONTS.bodyMedium },
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
  textarea: {
    backgroundColor: THEME.bgCard,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    padding: 14,
    color: THEME.ink,
    fontSize: 13.5,
    minHeight: 220,
    fontFamily: FONTS.mono,
  },
  helpText: { color: THEME.inkFaint, fontSize: 12, lineHeight: 17, marginBottom: 12, fontFamily: FONTS.body },
  warnText: { color: THEME.stamp, fontSize: 12, marginTop: 8, fontFamily: FONTS.body },
  okText: { color: THEME.teal, fontSize: 12, marginTop: 8, fontFamily: FONTS.body },
  fixButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: THEME.teal,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 12,
  },
  fixButtonText: { color: THEME.teal, fontSize: 13.5, fontFamily: FONTS.bodyMedium },
  typeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1.5,
    borderColor: THEME.border,
    borderRadius: 14,
    padding: 15,
    marginBottom: 10,
    backgroundColor: THEME.bgCard,
    ...CARD_SHADOW,
  },
  typeCardActive: { borderColor: THEME.gold },
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: THEME.bgCardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  typeLabel: { flex: 1, fontSize: 15.5, color: THEME.inkMuted, fontFamily: FONTS.headingRegular },
  modeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1.5,
    borderColor: THEME.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    backgroundColor: THEME.bgCard,
    ...CARD_SHADOW,
  },
  modeTitle: { fontSize: 15.5, color: THEME.inkMuted, fontFamily: FONTS.headingSemiBold },
  modeText: { fontSize: 12.5, lineHeight: 18, color: THEME.inkFaint, marginTop: 4, fontFamily: FONTS.body },
  fieldHint: { color: THEME.inkFaint, fontSize: 12, lineHeight: 17, marginTop: 8, fontFamily: FONTS.body },
  twoCols: { flexDirection: "row", gap: 10 },
  footer: { padding: 20 },
  primaryButton: {
    backgroundColor: THEME.gold,
    borderRadius: 13,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: THEME.bg, fontSize: 15.5, fontFamily: FONTS.bodySemiBold },
});
