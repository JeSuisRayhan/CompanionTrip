import React, { useState, useCallback } from "react";
import { View, Text, Switch, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import { THEME, space, layout, type, themedStyles } from "../lib/theme";
import { CURRENCY_PRESETS, suggestRate, BUDGET_TYPES } from "../lib/constants";
import { getTrip, updateTripSettings } from "../lib/trips";
import { fetchRate } from "../lib/rates";
import { formatShortDate } from "../lib/dates";
import { scheduleDailySummaries, scheduleDepartureReminder } from "../lib/notifications";
import { requestGeofencingPermissions, scheduleHotelProximityAlerts, stopHotelProximityAlerts, isHotelProximityActiveForTrip, hotelStops } from "../lib/geofencing";
import { Txt, Button, Group, Row, SectionTitle, Field, ModalHeader, Sheet } from "../components/ui";

const CATEGORY_LABELS = { transport: "Transport", hotel: "Hébergement", repas: "Repas" };

export default function TripSettingsScreen({ route, navigation }) {
  const { tripId } = route.params;
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState("EUR");
  const [homeCurrency, setHomeCurrency] = useState("EUR");
  const [rate, setRate] = useState("1");
  const [rateBusy, setRateBusy] = useState(false);
  const [rateNote, setRateNote] = useState("");
  const [targets, setTargets] = useState({ transport: "", hotel: "", repas: "" });
  const [defaultLocation, setDefaultLocation] = useState("");
  const [emergency, setEmergency] = useState({ bloodType: "", allergies: "", contactName: "", contactPhone: "", embassy: "", notes: "" });
  const [pickerFor, setPickerFor] = useState(null); // "local" | "home" | null
  const [saving, setSaving] = useState(false);
  const [remindersBusy, setRemindersBusy] = useState(false);
  const [remindersStatus, setRemindersStatus] = useState("");
  const [geofenceBusy, setGeofenceBusy] = useState(false);
  const [geofenceStatus, setGeofenceStatus] = useState("");
  const [geofenceEnabled, setGeofenceEnabled] = useState(false);

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
        setGeofenceEnabled(await isHotelProximityActiveForTrip(tripId));
      })();
      return () => {
        cancelled = true;
      };
    }, [tripId])
  );

  // The rate of the day when online; otherwise the approximate built-in one, said so.
  async function applyRateOfTheDay() {
    setRateBusy(true);
    setRateNote("");
    try {
      const { rate: live, date } = await fetchRate(currency, homeCurrency);
      setRate(String(live));
      setRateNote(date ? `Taux du ${formatShortDate(date)}.` : "Taux du jour.");
    } catch (e) {
      const approx = suggestRate(currency, homeCurrency);
      if (approx) {
        setRate(String(Math.round(approx * 10000) / 10000));
        setRateNote("Pas de connexion : taux approximatif, à ajuster.");
      } else {
        setRateNote(e.message || "Impossible de récupérer le taux.");
      }
    } finally {
      setRateBusy(false);
    }
  }

  async function scheduleReminders() {
    setRemindersBusy(true);
    setRemindersStatus("");
    try {
      const summaryIds = await scheduleDailySummaries(trip);
      const departureId = await scheduleDepartureReminder(trip);
      const parts = [];
      if (summaryIds.length) parts.push(`${summaryIds.length} résumé${summaryIds.length !== 1 ? "s" : ""} quotidien${summaryIds.length !== 1 ? "s" : ""}`);
      if (departureId) parts.push("1 rappel avant-départ");
      setRemindersStatus(parts.length ? `Programmés : ${parts.join(" + ")}.` : "Rien à programmer (voyage déjà commencé ou trop proche).");
    } finally {
      setRemindersBusy(false);
    }
  }

  async function enableHotelProximity() {
    setGeofenceBusy(true);
    setGeofenceStatus("");
    try {
      const granted = await requestGeofencingPermissions();
      if (!granted) {
        setGeofenceStatus("Autorisation de localisation \"toujours\" refusée — nécessaire pour détecter votre arrivée même app fermée.");
        return;
      }
      const count = await scheduleHotelProximityAlerts(trip);
      setGeofenceEnabled(count > 0);
      const total = hotelStops(trip).length;
      const s = (n) => (n !== 1 ? "s" : "");
      setGeofenceStatus(
        total === 0
          ? "Aucun hôtel avec adresse renseignée sur ce voyage — ajoutez une adresse aux étapes hôtel pour activer ceci."
          : count === 0
          ? `${total === 1 ? "L'adresse de l'hôtel n'a pas pu être localisée" : `Les adresses des ${total} hôtels n'ont pas pu être localisées`} — précisez la rue et la ville (ou vérifiez la connexion), puis réessayez.`
          : count < total
          ? `Activé pour ${count} hôtel${s(count)} sur ${total} — l'adresse des autres n'a pas pu être localisée.`
          : `Activé pour ${count} hôtel${s(count)} avec adresse renseignée.`
      );
    } finally {
      setGeofenceBusy(false);
    }
  }

  async function disableHotelProximity() {
    setGeofenceBusy(true);
    try {
      await stopHotelProximityAlerts();
      setGeofenceEnabled(false);
      setGeofenceStatus("Désactivé.");
    } finally {
      setGeofenceBusy(false);
    }
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
  const cancel = { label: "Annuler", onPress: () => navigation.goBack() };

  if (loading || !trip) {
    return (
      <SafeAreaView style={styles.safe}>
        <ModalHeader title="Réglages" left={cancel} />
        <View style={styles.loading}>
          <ActivityIndicator color={THEME.teal} />
        </View>
      </SafeAreaView>
    );
  }

  const geofenceRefused = /^Autorisation/.test(geofenceStatus);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <ModalHeader
        title="Réglages"
        left={cancel}
        right={{ label: saving ? "…" : "Enregistrer", onPress: save, disabled: saving }}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Group>
          <Row
            icon="bed-outline"
            tone="stamp"
            title="Hôtels du voyage"
            subtitle="Ajouter ou modifier vos hôtels"
            chevron
            onPress={() => navigation.navigate("Hotels", { tripId })}
          />
        </Group>

        <Section title="Météo">
          <Field
            label="Lieu principal du voyage"
            value={defaultLocation}
            onChangeText={setDefaultLocation}
            placeholder="ex : Tokyo"
            hint="Utilisé pour la météo de chaque jour, sauf si vous précisez un lieu différent pour un jour en particulier (utile si le voyage passe par plusieurs villes)."
            style={styles.fieldTight}
          />
        </Section>

        <Section title="Devises">
          <PickerField label="Devise locale" value={currencyLabel(currency)} onPress={() => setPickerFor("local")} />
          <PickerField label="Devise de référence (chez vous)" value={currencyLabel(homeCurrency)} onPress={() => setPickerFor("home")} />
          <View style={styles.rateRow}>
            <Field
              label="Taux de conversion"
              value={rate}
              onChangeText={setRate}
              keyboardType="decimal-pad"
              placeholder="1"
              inputStyle={styles.numericInput}
              style={styles.rateField}
            />
            <Button title="Taux du jour" variant="secondary" loading={rateBusy} disabled={rateBusy} onPress={applyRateOfTheDay} />
          </View>
          <Txt variant="caption" color="inkFaint" style={styles.note}>
            1 {currency} = taux × 1 {homeCurrency}. Ajustez-le librement.
          </Txt>
          {rateNote ? (
            <Txt variant="caption" color={/^(Pas de connexion|Impossible|Ce taux|Devise|Le service)/.test(rateNote) ? "stamp" : "teal"} accessibilityLiveRegion="polite" style={styles.note}>
              {rateNote}
            </Txt>
          ) : null}
        </Section>

        <Section title="Objectifs de budget (optionnel)">
          <Txt variant="subhead" style={styles.intro}>
            En {homeCurrency} — votre devise de référence, même si vos dépenses sont en {currency}. Laissez vide pour ne pas fixer de limite sur une catégorie.
          </Txt>
          {BUDGET_TYPES.map((key, i) => (
            <Field
              key={key}
              label={CATEGORY_LABELS[key]}
              value={targets[key]}
              onChangeText={(v) => setTargets((t) => ({ ...t, [key]: v }))}
              keyboardType="decimal-pad"
              placeholder="Pas de limite"
              inputStyle={styles.numericInput}
              right={<Text style={type.numeralSmall}>{homeCurrency}</Text>}
              style={i === BUDGET_TYPES.length - 1 ? styles.fieldTight : undefined}
            />
          ))}
        </Section>

        <Section title="Fiche d'urgence (optionnel)">
          <Txt variant="subhead" style={styles.intro}>
            Gardée sur cet appareil, jamais partagée automatiquement.
          </Txt>
          <Field label="Groupe sanguin" value={emergency.bloodType} onChangeText={(v) => setEmergency((e) => ({ ...e, bloodType: v }))} placeholder="O+" />
          <Field label="Allergies" value={emergency.allergies} onChangeText={(v) => setEmergency((e) => ({ ...e, allergies: v }))} placeholder="Pénicilline, arachides..." />
          <Field label="Contact d'urgence — nom" value={emergency.contactName} onChangeText={(v) => setEmergency((e) => ({ ...e, contactName: v }))} placeholder="Nom du contact" />
          <Field
            label="Contact d'urgence — téléphone"
            value={emergency.contactPhone}
            onChangeText={(v) => setEmergency((e) => ({ ...e, contactPhone: v }))}
            placeholder="+33 6 ..."
            keyboardType="phone-pad"
            inputStyle={styles.numericInput}
          />
          <Field label="Ambassade / consulat" value={emergency.embassy} onChangeText={(v) => setEmergency((e) => ({ ...e, embassy: v }))} placeholder="Adresse ou numéro" />
          <Field label="Notes" value={emergency.notes} onChangeText={(v) => setEmergency((e) => ({ ...e, notes: v }))} multiline style={styles.fieldTight} />
        </Section>

        <Section title="Rappels">
          <Txt variant="subhead" style={styles.intro}>
            Programme un résumé chaque matin du voyage (8h) et un rappel de la checklist avant-départ 3 jours avant. À relancer si vous modifiez beaucoup le programme.
          </Txt>
          <Button title="Programmer les rappels" icon="alarm-outline" variant="secondary" full loading={remindersBusy} onPress={scheduleReminders} />
          {remindersStatus ? (
            <Txt variant="caption" style={styles.note} accessibilityLiveRegion="polite">
              {remindersStatus}
            </Txt>
          ) : null}
        </Section>

        <Section title="Rappel à l'approche de l'hôtel">
          <Txt variant="subhead" style={styles.intro}>
            Une notification apparaît avec le code de réservation quand vous arrivez près d'un hôtel de ce voyage — fonctionne même si l'app est fermée. Nécessite une adresse sur chaque étape hôtel et l'autorisation de localisation « toujours ».
          </Txt>
          <Group>
            <Row
              icon="location-outline"
              tone={geofenceEnabled ? "teal" : "neutral"}
              title="Alerte à l'arrivée"
              subtitle="Avec le code de réservation"
              right={
                <Switch
                  value={geofenceEnabled}
                  onValueChange={(on) => (on ? enableHotelProximity() : disableHotelProximity())}
                  disabled={geofenceBusy}
                  accessibilityLabel="Rappel à l'approche de l'hôtel"
                  trackColor={{ false: THEME.bgRaised, true: THEME.teal }}
                  thumbColor={THEME.ink}
                  ios_backgroundColor={THEME.bgRaised}
                />
              }
            />
          </Group>
          {geofenceStatus ? (
            <Txt variant="caption" color={geofenceRefused ? "stamp" : "inkMuted"} style={styles.note} accessibilityLiveRegion="polite">
              {geofenceStatus}
            </Txt>
          ) : null}
        </Section>
      </ScrollView>

      <CurrencyPickerModal
        visible={!!pickerFor}
        selected={pickerFor === "local" ? currency : homeCurrency}
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

// A titled block: section title, then its content.
function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <SectionTitle title={title} />
      {children}
    </View>
  );
}

// A read-only Field that opens a picker: same look as its sibling inputs.
function PickerField({ label, value, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} : ${value}`}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Field label={label} value={value} editable={false} right={<Ionicons name="chevron-down" size={18} color={THEME.inkMuted} />} />
      </View>
    </Pressable>
  );
}

function CurrencyPickerModal({ visible, selected, onClose, onSelect }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Choisir une devise">
      <Group style={styles.currencyList}>
        {CURRENCY_PRESETS.map((item) => (
          <Row
            key={item.code}
            title={item.label}
            selected={item.code === selected}
            right={item.code === selected ? <Ionicons name="checkmark" size={20} color={THEME.gold} /> : null}
            onPress={() => onSelect(item.code)}
          />
        ))}
      </Group>
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  scrollContent: { paddingHorizontal: layout.gutter, paddingTop: space.lg, paddingBottom: space.xxl },
  section: { marginTop: space.xxl },
  intro: { marginBottom: space.lg },
  note: { marginTop: space.md },
  fieldTight: { marginBottom: 0 },
  numericInput: { ...type.numeral },
  rateRow: { flexDirection: "row", alignItems: "flex-end", gap: space.md },
  rateField: { flex: 1, marginBottom: 0 },
  pressed: { opacity: 0.8 },
  currencyList: { marginBottom: space.md },
}));
