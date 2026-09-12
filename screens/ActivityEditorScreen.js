import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { THEME } from "../lib/theme";
import { FONTS } from "../lib/fonts";
import { TYPES } from "../lib/constants";
import { getTrip, addActivity, editActivity, deleteActivity } from "../lib/trips";
import { resolveDayDate } from "../lib/dates";
import { scheduleActivityReminder, cancelScheduledNotification } from "../lib/notifications";
import { transportDeparturePlace, TRANSPORT_MODES, CONFIRMATION_TYPES } from "../lib/constants";

export default function ActivityEditorScreen({ route, navigation }) {
  const { tripId, dayId, activity } = route.params; // activity is null/undefined when creating

  const [title, setTitle] = useState(activity?.title || "");
  const [time, setTime] = useState(activity?.time || "");
  const [type, setType] = useState(activity?.type || "activite");
  const [price, setPrice] = useState(activity?.price != null ? String(activity.price) : "");
  const [note, setNote] = useState(activity?.note || "");
  const [address, setAddress] = useState(activity?.address || "");
  const [confirmationCode, setConfirmationCode] = useState(activity?.confirmationCode || "");
  const [transportMode, setTransportMode] = useState(activity?.transportMode || null);
  const [outdoor, setOutdoor] = useState(!!activity?.outdoor);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isEditing = !!activity;

  function normalizedTime() {
    const v = time.trim();
    if (!v) return null;
    const m = v.match(/^(\d{1,2})[h:](\d{2})?$/i);
    if (!m) return null;
    return `${m[1].padStart(2, "0")}:${m[2] || "00"}`;
  }

  async function save() {
    if (!title.trim()) {
      setError("Ajoutez un titre pour cette étape.");
      return;
    }
    if (time.trim() && !normalizedTime()) {
      setError("Heure non reconnue — utilisez HH:MM (ex : 09:30).");
      return;
    }
    setSaving(true);
    const parsedPrice = price.trim() ? parseFloat(price.replace(",", ".")) : null;
    const resolvedTime = normalizedTime();
    let notificationId = activity?.notificationId || null;

    try {
      // Reminders only make sense for transport/hotel, and only when we
      // actually have a date+time to anchor them to.
      if (activity?.notificationId) {
        await cancelScheduledNotification(activity.notificationId);
        notificationId = null;
      }
      if ((type === "transport" || type === "hotel") && resolvedTime) {
        const trip = await getTrip(tripId);
        const dayIndex = trip.days.findIndex((d) => d.id === dayId);
        const dateISO = resolveDayDate(trip, trip.days[dayIndex], dayIndex);
        if (dateISO) {
          notificationId = await scheduleActivityReminder({
            dateISO,
            time: resolvedTime,
            title: type === "hotel" ? "Check-in bientôt" : "Départ bientôt",
            body:
              type === "hotel"
                ? `${title.trim()} — check-in à ${resolvedTime}`
                : `${title.trim()} — direction ${transportDeparturePlace()} pour ${resolvedTime}`,
          });
        }
      }

      const payload = {
        title: title.trim(),
        time: resolvedTime,
        type,
        price: !isNaN(parsedPrice) ? parsedPrice : null,
        note: note.trim(),
        address: address.trim() || null,
        confirmationCode: confirmationCode.trim() || null,
        transportMode: type === "transport" ? transportMode : null,
        outdoor: type === "activite" || type === "repas" ? outdoor : false,
        notificationId,
      };
      if (isEditing) {
        await editActivity(tripId, dayId, activity.id, payload);
      } else {
        await addActivity(tripId, dayId, payload);
      }
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert("Supprimer cette étape ?", "Cette action est définitive.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          if (activity?.notificationId) await cancelScheduledNotification(activity.notificationId);
          await deleteActivity(tripId, dayId, activity.id);
          navigation.goBack();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>Annuler</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isEditing ? "Modifier l'étape" : "Nouvelle étape"}</Text>
          <TouchableOpacity onPress={save} style={styles.headerButton} disabled={saving}>
            <Text style={[styles.headerButtonText, styles.headerSaveText]}>Enregistrer</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Titre</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Visite du sanctuaire Meiji Jingu"
            placeholderTextColor={THEME.inkFaint}
          />

          <Text style={styles.label}>Heure (optionnel)</Text>
          <TextInput
            style={styles.input}
            value={time}
            onChangeText={setTime}
            placeholder="09:30"
            placeholderTextColor={THEME.inkFaint}
            keyboardType="numbers-and-punctuation"
          />

          <Text style={styles.label}>Type</Text>
          <View style={styles.typeRow}>
            {Object.entries(TYPES).map(([key, t]) => (
              <TouchableOpacity
                key={key}
                style={[styles.typeChip, type === key && { borderColor: t.color, backgroundColor: t.dim }]}
                onPress={() => setType(key)}
              >
                <Ionicons name={t.icon} size={14} color={type === key ? t.color : THEME.inkMuted} />
                <Text style={[styles.typeChipText, type === key && { color: t.color }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {(type === "transport" || type === "hotel" || type === "repas") && (
            <>
              <Text style={styles.label}>Prix (optionnel)</Text>
              <TextInput
                style={styles.input}
                value={price}
                onChangeText={setPrice}
                placeholder="0"
                placeholderTextColor={THEME.inkFaint}
                keyboardType="decimal-pad"
              />
            </>
          )}

          {type === "transport" && (
            <>
              <Text style={styles.label}>Mode de transport (optionnel)</Text>
              <View style={styles.typeRow}>
                {TRANSPORT_MODES.map((m) => (
                  <TouchableOpacity
                    key={m.key}
                    style={[styles.typeChip, transportMode === m.key && { borderColor: THEME.blue, backgroundColor: THEME.blueDim }]}
                    onPress={() => setTransportMode(transportMode === m.key ? null : m.key)}
                  >
                    <Text style={[styles.typeChipText, transportMode === m.key && { color: THEME.blue }]}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {CONFIRMATION_TYPES.includes(type) && (
            <>
              <Text style={styles.label}>Code de confirmation (optionnel)</Text>
              <TextInput
                style={styles.input}
                value={confirmationCode}
                onChangeText={setConfirmationCode}
                placeholder="ABC123"
                placeholderTextColor={THEME.inkFaint}
                autoCapitalize="characters"
              />
            </>
          )}

          <Text style={styles.label}>Adresse (optionnel)</Text>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder="12 rue de la Paix, Paris"
            placeholderTextColor={THEME.inkFaint}
          />

          {(type === "activite" || type === "repas") && (
            <TouchableOpacity style={styles.outdoorRow} onPress={() => setOutdoor((v) => !v)}>
              <Ionicons name={outdoor ? "checkbox" : "square-outline"} size={20} color={outdoor ? THEME.teal : THEME.inkMuted} />
              <Text style={styles.outdoorText}>En extérieur (utile pour la météo)</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.label}>Note (optionnel)</Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={note}
            onChangeText={setNote}
            placeholder="Réserver un créneau à l'avance"
            placeholderTextColor={THEME.inkFaint}
            multiline
            textAlignVertical="top"
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          {isEditing && (
            <TouchableOpacity style={styles.deleteButton} onPress={confirmDelete}>
              <Ionicons name="trash-outline" size={16} color={THEME.stamp} />
              <Text style={styles.deleteButtonText}>Supprimer cette étape</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  typeChipText: { color: THEME.inkMuted, fontSize: 13, fontFamily: FONTS.bodyMedium },
  outdoorRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  outdoorText: { color: THEME.inkMuted, fontSize: 13.5, fontFamily: FONTS.body },
  errorText: { color: THEME.stamp, fontSize: 12.5, marginTop: 14, fontFamily: FONTS.body },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 30,
    paddingVertical: 12,
  },
  deleteButtonText: { color: THEME.stamp, fontSize: 14 },
});
