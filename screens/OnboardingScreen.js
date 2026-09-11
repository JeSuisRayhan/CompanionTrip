import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { THEME, CARD_SHADOW } from "../lib/theme";
import { FONTS } from "../lib/fonts";
import { TRIP_TYPES } from "../lib/constants";
import { buildNewTrip, daysFromScript, createTrip, setCoverImage } from "../lib/trips";
import { runScriptCorrection } from "../lib/script";
import { getSetting } from "../lib/storage";
import { searchDestinationPhoto, trackUnsplashDownload } from "../lib/unsplash";
import VoiceInputButton from "../components/VoiceInputButton";

const STEP_COUNT = 3;

export default function OnboardingScreen({ navigation }) {
  const [step, setStep] = useState(1);
  const [tripType, setTripType] = useState("long");
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [script, setScript] = useState("");
  const [fixing, setFixing] = useState(false);
  const [fixError, setFixError] = useState("");
  const [fixStatus, setFixStatus] = useState("");
  const [creating, setCreating] = useState(false);

  function goBack() {
    if (step === 1) {
      navigation.goBack();
    } else {
      setStep(step - 1);
    }
  }

  function normalizedDate() {
    const v = startDate.trim();
    if (!v) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const m = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return null;
  }

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
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const days = daysFromScript(script, normalizedDate());
      const trip = buildNewTrip({
        name,
        tripType,
        startDate: normalizedDate(),
        currency: "EUR",
        homeCurrency: "EUR",
        days,
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

      navigation.replace("Trip", { tripId: trip.id });
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
          <Text style={styles.stepLabel}>Étape {step} sur {STEP_COUNT}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {step === 1 && (
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

          {step === 2 && (
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
              <Text style={styles.label}>Date de départ (optionnel — AAAA-MM-JJ)</Text>
              <TextInput
                style={styles.input}
                value={startDate}
                onChangeText={setStartDate}
                placeholder="2026-09-15"
                placeholderTextColor={THEME.inkFaint}
                autoCapitalize="none"
              />
              {startDate.trim() && !normalizedDate() && (
                <Text style={styles.warnText}>Format non reconnu — utilisez AAAA-MM-JJ ou JJ/MM/AAAA.</Text>
              )}
            </>
          )}

          {step === 3 && (
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
          {step < STEP_COUNT && (
            <TouchableOpacity
              style={[styles.primaryButton, step === 2 && !name.trim() && styles.primaryButtonDisabled]}
              onPress={() => setStep(step + 1)}
              disabled={step === 2 && !name.trim()}
            >
              <Text style={styles.primaryButtonText}>Continuer</Text>
            </TouchableOpacity>
          )}
          {step === STEP_COUNT && (
            <TouchableOpacity style={styles.primaryButton} onPress={finish} disabled={creating || !name.trim()}>
              {creating ? <ActivityIndicator color={THEME.bg} /> : <Text style={styles.primaryButtonText}>Créer le voyage</Text>}
            </TouchableOpacity>
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
