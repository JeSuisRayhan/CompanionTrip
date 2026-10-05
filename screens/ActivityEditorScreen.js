import React, { useState } from "react";
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, Alert, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { THEME, space, layout, type as ramp, themedStyles } from "../lib/theme";
import { TYPES } from "../lib/constants";
import { getTrip, addActivity, editActivity, deleteActivity } from "../lib/trips";
import { resolveDayDate, parseTimeInput, maskTimeInput } from "../lib/dates";
import { scheduleActivityReminder, cancelScheduledNotification } from "../lib/notifications";
import { transportDeparturePlace, TRANSPORT_MODES, CONFIRMATION_TYPES } from "../lib/constants";
import { Txt, Button, Chip, Group, Row, Field, ModalHeader, round } from "../components/ui";

// Same tone per step type everywhere (route rows, editor chips).
function typeTone(key) {
  return key === "repas" ? "gold" : key === "hotel" ? "stamp" : key === "transport" ? "blue" : "teal";
}

export default function ActivityEditorScreen({ route, navigation }) {
  const { tripId, dayId, activity } = route.params; // activity is null/undefined when creating

  const [title, setTitle] = useState(activity?.title || "");
  const [time, setTime] = useState(activity?.time || "");
  const [type, setType] = useState(activity?.type || "activite");
  const [price, setPrice] = useState(activity?.price != null ? String(activity.price) : "");
  const [note, setNote] = useState(activity?.note || "");
  const [address, setAddress] = useState(activity?.address || "");
  const [localAddress, setLocalAddress] = useState(activity?.localAddress || "");
  const [confirmationCode, setConfirmationCode] = useState(activity?.confirmationCode || "");
  const [transportMode, setTransportMode] = useState(activity?.transportMode || null);
  const [outdoor, setOutdoor] = useState(!!activity?.outdoor);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isEditing = !!activity;

  const normalizedTime = () => parseTimeInput(time);

  async function save() {
    if (!title.trim()) {
      setError("Ajoutez un titre pour cette étape.");
      return;
    }
    if (time.trim() && !normalizedTime()) {
      setError("Heure non reconnue — utilisez HH:MM, de 00:00 à 23:59 (ex : 09:30).");
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
        localAddress: localAddress.trim() || null,
        confirmationCode: confirmationCode.trim() || null,
        transportMode: type === "transport" ? transportMode : null,
        outdoor: type === "activite" || type === "repas" ? outdoor : false,
        notificationId,
      };
      if (isEditing) {
        // A new address makes the old position stale: the map finds it again.
        if (!activity.ideaId && payload.address !== (activity.address || null)) {
          payload.lat = null;
          payload.lng = null;
        }
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
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ModalHeader
          title={isEditing ? "Modifier l'étape" : "Nouvelle étape"}
          left={{ label: "Annuler", onPress: () => navigation.goBack() }}
          right={{ label: "Enregistrer", onPress: save, disabled: saving }}
        />

        {/* Pinned under the header so a validation message is never scrolled out of sight. */}
        {error ? (
          <View style={[styles.errorBanner, round("sm")]} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Ionicons name="alert-circle" size={18} color={THEME.stamp} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Field label="Titre" value={title} onChangeText={setTitle} placeholder="Visite du sanctuaire Meiji Jingu" />

          <Field
            label="Heure (optionnel)"
            value={time}
            onChangeText={(v) => setTime(maskTimeInput(v))}
            placeholder="09:30"
            keyboardType="numbers-and-punctuation"
            inputStyle={ramp.numeral}
          />

          <View style={styles.choiceGroup}>
            <Txt variant="caption" style={styles.choiceLabel}>
              Type
            </Txt>
            <View style={styles.chipRow}>
              {Object.entries(TYPES).map(([key, t]) => (
                <Chip key={key} label={t.label} icon={t.icon} tone={typeTone(key)} selected={type === key} onPress={() => setType(key)} />
              ))}
            </View>
          </View>

          {(type === "transport" || type === "hotel" || type === "repas" || type === "activite") && (
            <Field
              label="Prix (optionnel)"
              value={price}
              onChangeText={setPrice}
              placeholder="0"
              keyboardType="decimal-pad"
              inputStyle={ramp.numeral}
            />
          )}

          {type === "transport" && (
            <View style={styles.choiceGroup}>
              <Txt variant="caption" style={styles.choiceLabel}>
                Mode de transport (optionnel)
              </Txt>
              <View style={styles.chipRow}>
                {TRANSPORT_MODES.map((m) => (
                  <Chip
                    key={m.key}
                    label={m.label}
                    tone="blue"
                    selected={transportMode === m.key}
                    onPress={() => setTransportMode(transportMode === m.key ? null : m.key)}
                  />
                ))}
              </View>
            </View>
          )}

          {CONFIRMATION_TYPES.includes(type) && (
            <Field
              label="Code de confirmation (optionnel)"
              value={confirmationCode}
              onChangeText={setConfirmationCode}
              placeholder="ABC123"
              autoCapitalize="characters"
              inputStyle={ramp.numeral}
            />
          )}

          <Field label="Adresse (optionnel)" value={address} onChangeText={setAddress} placeholder="12 rue de la Paix, Paris" />
          <Field label="Adresse en langue locale, à montrer à un chauffeur (optionnel)" value={localAddress} onChangeText={setLocalAddress} placeholder="東京都新宿区歌舞伎町1-19-1" />

          {(type === "activite" || type === "repas") && (
            <Group style={styles.toggleGroup}>
              <Row
                icon="sunny-outline"
                tone="gold"
                title="En extérieur"
                subtitle="Utile pour la météo"
                selected={outdoor}
                accessibilityLabel={`En extérieur, utile pour la météo : ${outdoor ? "activé" : "désactivé"}`}
                onPress={() => setOutdoor((v) => !v)}
                // The row is the touch target; the switch only shows the state.
                right={
                  <View pointerEvents="none">
                    <Switch
                      value={outdoor}
                      trackColor={{ false: THEME.bgRaised, true: THEME.teal }}
                      thumbColor={THEME.ink}
                      ios_backgroundColor={THEME.bgRaised}
                    />
                  </View>
                }
              />
            </Group>
          )}

          <Field label="Note (optionnel)" value={note} onChangeText={setNote} placeholder="Réserver un créneau à l'avance" multiline />

          {isEditing && <Button title="Supprimer cette étape" icon="trash-outline" variant="danger" full onPress={confirmDelete} style={styles.deleteButton} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  flex: { flex: 1 },
  scrollContent: { padding: layout.gutter, paddingBottom: space.xxxl },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: layout.gutter,
    marginTop: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: THEME.stampDim,
  },
  errorText: { ...ramp.subhead, color: THEME.stamp, flex: 1 },
  // Same rhythm as Field: label, then the control, then a 16pt gap.
  choiceGroup: { marginBottom: space.lg },
  choiceLabel: { marginBottom: space.sm - 2 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  toggleGroup: { marginBottom: space.lg },
  deleteButton: { marginTop: space.md },
}));
