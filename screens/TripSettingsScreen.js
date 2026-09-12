import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Modal, FlatList, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import { THEME, CARD_SHADOW } from "../lib/theme";
import { FONTS } from "../lib/fonts";
import { CURRENCY_PRESETS, suggestRate, BUDGET_TYPES } from "../lib/constants";
import { getTrip, updateTripSettings } from "../lib/trips";

const CATEGORY_LABELS = { transport: "Transport", hotel: "Hébergement", repas: "Repas" };

export default function TripSettingsScreen({ route, navigation }) {
  const { tripId } = route.params;
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState("EUR");
  const [homeCurrency, setHomeCurrency] = useState("EUR");
  const [rate, setRate] = useState("1");
  const [targets, setTargets] = useState({ transport: "", hotel: "", repas: "" });
  const [defaultLocation, setDefaultLocation] = useState("");
  const [emergency, setEmergency] = useState({ bloodType: "", allergies: "", contactName: "", contactPhone: "", embassy: "", notes: "" });
  const [pickerFor, setPickerFor] = useState(null); // "local" | "home" | null
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const t = await getTrip(tripId);
        if (cancelled || !t) return;
        setTrip(t);
        setCurrency(t.currency || "EUR");
        setHomeCurrency(t.homeCurrency || "EUR");
        setRate(t.rate != null ? String(t.rate) : "1");
        setDefaultLocation(t.defaultLocation || "");
        setEmergency({
          bloodType: t.emergencyInfo?.bloodType || "",
          allergies: t.emergencyInfo?.allergies || "",
          contactName: t.emergencyInfo?.contactName || "",
          contactPhone: t.emergencyInfo?.contactPhone || "",
          embassy: t.emergencyInfo?.embassy || "",
          notes: t.emergencyInfo?.notes || "",
        });
        setTargets({
          transport: t.budgetTargets?.transport != null ? String(t.budgetTargets.transport) : "",
          hotel: t.budgetTargets?.hotel != null ? String(t.budgetTargets.hotel) : "",
          repas: t.budgetTargets?.repas != null ? String(t.budgetTargets.repas) : "",
        });
        setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [tripId])
  );

  function applySuggestedRate(local, home) {
    const suggested = suggestRate(local, home);
    if (suggested) setRate(String(Math.round(suggested * 10000) / 10000));
  }

  async function save() {
    setSaving(true);
    try {
      const parsedRate = parseFloat(rate.replace(",", "."));
      const budgetTargets = {};
      for (const key of BUDGET_TYPES) {
        const v = targets[key];
        budgetTargets[key] = v && v.trim() ? parseFloat(v.replace(",", ".")) : null;
      }
      await updateTripSettings(tripId, {
        currency,
        homeCurrency,
        rate: !isNaN(parsedRate) ? parsedRate : 1,
        budgetTargets,
        defaultLocation: defaultLocation.trim() || null,
        emergencyInfo: emergency,
      });
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  }

  const currencyLabel = (code) => CURRENCY_PRESETS.find((c) => c.code === code)?.label || code;

  if (loading || !trip) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={THEME.teal} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>Annuler</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Réglages du voyage</Text>
        <TouchableOpacity onPress={save} style={styles.headerButton} disabled={saving}>
          <Text style={[styles.headerButtonText, styles.headerSaveText]}>{saving ? "…" : "Enregistrer"}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>Météo</Text>
        <Text style={styles.label}>Lieu principal du voyage</Text>
        <TextInput
          style={styles.input}
          value={defaultLocation}
          onChangeText={setDefaultLocation}
          placeholder="ex : Tokyo"
          placeholderTextColor={THEME.inkFaint}
        />
        <Text style={styles.helpText}>
          Utilisé pour la météo de chaque jour, sauf si vous précisez un lieu différent pour un jour en particulier
          (utile si le voyage passe par plusieurs villes).
        </Text>

        <Text style={[styles.sectionTitle, { marginTop: 26 }]}>Devises</Text>

        <Text style={styles.label}>Devise locale</Text>
        <TouchableOpacity style={styles.picker} onPress={() => setPickerFor("local")}>
          <Text style={styles.pickerText}>{currencyLabel(currency)}</Text>
          <Ionicons name="chevron-down" size={16} color={THEME.inkMuted} />
        </TouchableOpacity>

        <Text style={styles.label}>Devise de référence (chez vous)</Text>
        <TouchableOpacity style={styles.picker} onPress={() => setPickerFor("home")}>
          <Text style={styles.pickerText}>{currencyLabel(homeCurrency)}</Text>
          <Ionicons name="chevron-down" size={16} color={THEME.inkMuted} />
        </TouchableOpacity>

        <View style={styles.rateRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Taux de conversion</Text>
            <TextInput
              style={styles.input}
              value={rate}
              onChangeText={setRate}
              keyboardType="decimal-pad"
              placeholder="1"
              placeholderTextColor={THEME.inkFaint}
            />
          </View>
          <TouchableOpacity style={styles.suggestButton} onPress={() => applySuggestedRate(currency, homeCurrency)}>
            <Text style={styles.suggestButtonText}>Suggérer</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.helpText}>1 {currency} = taux × 1 {homeCurrency}. Le taux suggéré est approximatif — ajustez-le librement.</Text>

        <Text style={[styles.sectionTitle, { marginTop: 26 }]}>Objectifs de budget (optionnel)</Text>
        <Text style={styles.helpText}>Laissez vide pour ne pas fixer de limite sur une catégorie.</Text>
        {BUDGET_TYPES.map((key) => (
          <View key={key}>
            <Text style={styles.label}>{CATEGORY_LABELS[key]}</Text>
            <TextInput
              style={styles.input}
              value={targets[key]}
              onChangeText={(v) => setTargets((t) => ({ ...t, [key]: v }))}
              keyboardType="decimal-pad"
              placeholder="Pas de limite"
              placeholderTextColor={THEME.inkFaint}
            />
          </View>
        ))}

        <Text style={[styles.sectionTitle, { marginTop: 26 }]}>Fiche d'urgence (optionnel)</Text>
        <Text style={styles.helpText}>Gardée sur cet appareil, jamais partagée automatiquement.</Text>
        <Text style={styles.label}>Groupe sanguin</Text>
        <TextInput style={styles.input} value={emergency.bloodType} onChangeText={(v) => setEmergency((e) => ({ ...e, bloodType: v }))} placeholder="O+" placeholderTextColor={THEME.inkFaint} />
        <Text style={styles.label}>Allergies</Text>
        <TextInput style={styles.input} value={emergency.allergies} onChangeText={(v) => setEmergency((e) => ({ ...e, allergies: v }))} placeholder="Pénicilline, arachides..." placeholderTextColor={THEME.inkFaint} />
        <Text style={styles.label}>Contact d'urgence — nom</Text>
        <TextInput style={styles.input} value={emergency.contactName} onChangeText={(v) => setEmergency((e) => ({ ...e, contactName: v }))} placeholder="Nom du contact" placeholderTextColor={THEME.inkFaint} />
        <Text style={styles.label}>Contact d'urgence — téléphone</Text>
        <TextInput style={styles.input} value={emergency.contactPhone} onChangeText={(v) => setEmergency((e) => ({ ...e, contactPhone: v }))} placeholder="+33 6 ..." placeholderTextColor={THEME.inkFaint} keyboardType="phone-pad" />
        <Text style={styles.label}>Ambassade / consulat</Text>
        <TextInput style={styles.input} value={emergency.embassy} onChangeText={(v) => setEmergency((e) => ({ ...e, embassy: v }))} placeholder="Adresse ou numéro" placeholderTextColor={THEME.inkFaint} />
        <Text style={styles.label}>Notes</Text>
        <TextInput style={[styles.input, { minHeight: 70 }]} value={emergency.notes} onChangeText={(v) => setEmergency((e) => ({ ...e, notes: v }))} multiline textAlignVertical="top" placeholderTextColor={THEME.inkFaint} />
      </ScrollView>

      <CurrencyPickerModal
        visible={!!pickerFor}
        onClose={() => setPickerFor(null)}
        onSelect={(code) => {
          if (pickerFor === "local") setCurrency(code);
          else setHomeCurrency(code);
          setPickerFor(null);
        }}
      />
    </SafeAreaView>
  );
}

function CurrencyPickerModal({ visible, onClose, onSelect }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Choisir une devise</Text>
          <FlatList
            data={CURRENCY_PRESETS}
            keyExtractor={(item) => item.code}
            style={{ maxHeight: 420, marginTop: 10 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.currencyRow} onPress={() => onSelect(item.code)}>
                <Text style={styles.currencyRowText}>{item.label}</Text>
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity onPress={onClose} style={{ marginTop: 12, alignItems: "center" }}>
            <Text style={{ color: THEME.inkFaint, fontSize: 13, fontFamily: FONTS.body }}>Fermer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: THEME.bg },
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
  scrollContent: { padding: 20 },
  sectionTitle: { fontSize: 15, color: THEME.ink, fontFamily: FONTS.headingSemiBold, marginBottom: 4 },
  label: { fontSize: 12.5, color: THEME.inkMuted, marginBottom: 6, marginTop: 14, fontFamily: FONTS.bodyMedium },
  helpText: { fontSize: 11.5, color: THEME.inkFaint, marginTop: 6, lineHeight: 16, fontFamily: FONTS.body },
  picker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: THEME.bgCard,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pickerText: { color: THEME.ink, fontSize: 14.5, fontFamily: FONTS.body },
  input: {
    backgroundColor: THEME.bgCard,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: THEME.ink,
    fontSize: 15,
    fontFamily: FONTS.mono,
  },
  rateRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  suggestButton: {
    borderWidth: 1,
    borderColor: THEME.teal,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  suggestButtonText: { color: THEME.teal, fontSize: 13, fontFamily: FONTS.bodyMedium },
  modalOverlay: { flex: 1, backgroundColor: "#00000099", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: THEME.bgCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: THEME.border,
    ...CARD_SHADOW,
  },
  modalTitle: { fontSize: 15.5, color: THEME.ink, fontFamily: FONTS.headingSemiBold },
  currencyRow: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: THEME.border },
  currencyRowText: { color: THEME.ink, fontSize: 14.5, fontFamily: FONTS.body },
});
