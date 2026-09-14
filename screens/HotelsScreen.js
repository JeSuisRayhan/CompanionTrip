import React, { useState, useCallback } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Modal, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import { THEME, CARD_SHADOW } from "../lib/theme";
import { FONTS } from "../lib/fonts";
import { getTrip, listHotelStays, upsertHotelStay, removeHotelStay } from "../lib/trips";
import { formatDateLabel } from "../lib/dates";
import { formatMoney } from "../lib/budget";

export default function HotelsScreen({ route, navigation }) {
  const { tripId } = route.params;
  const [trip, setTrip] = useState(null);
  const [stays, setStays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = no modal, {} = new, {...stay} = editing

  const refresh = useCallback(async () => {
    const t = await getTrip(tripId);
    setTrip(t);
    setStays(await listHotelStays(t));
    setLoading(false);
  }, [tripId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  function confirmDelete(stay) {
    Alert.alert("Supprimer cet hôtel ?", `"${stay.name}" sera retiré du programme.`, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          await removeHotelStay(tripId, stay.stayId);
          refresh();
        },
      },
    ]);
  }

  if (loading || !trip) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={THEME.teal} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={22} color={THEME.ink} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hôtels</Text>
        <TouchableOpacity onPress={() => setEditing({})} style={{ padding: 4 }}>
          <Ionicons name="add" size={24} color={THEME.gold} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {stays.length === 0 ? (
          <Text style={styles.helpText}>
            Ajoutez chaque hôtel une fois — nom, adresse, dates, prix total — et l'app crée l'étape correspondante et
            compte les nuits automatiquement dans le budget.
          </Text>
        ) : (
          stays
            .sort((a, b) => (a.checkIn || "").localeCompare(b.checkIn || ""))
            .map((stay) => (
              <TouchableOpacity key={stay.stayId} style={styles.card} onPress={() => setEditing(stay)} activeOpacity={0.85}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle}>{stay.name}</Text>
                  <TouchableOpacity onPress={() => confirmDelete(stay)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="trash-outline" size={16} color={THEME.inkFaint} />
                  </TouchableOpacity>
                </View>
                {stay.address ? <Text style={styles.cardAddress}>{stay.address}</Text> : null}
                <View style={styles.cardMetaRow}>
                  <Text style={styles.cardMeta}>
                    {stay.checkIn ? formatDateLabel(stay.checkIn) : "Date à définir"} · {stay.nights} nuit{stay.nights !== 1 ? "s" : ""}
                  </Text>
                  <Text style={styles.cardPrice}>{formatMoney(stay.pricePerNight * stay.nights, trip.currency)}</Text>
                </View>
              </TouchableOpacity>
            ))
        )}
      </ScrollView>

      <HotelFormModal
        visible={!!editing}
        initial={editing}
        currency={trip.currency}
        onClose={() => setEditing(null)}
        onSave={async (values) => {
          await upsertHotelStay(tripId, { stayId: editing?.stayId, ...values });
          setEditing(null);
          refresh();
        }}
      />
    </SafeAreaView>
  );
}

function HotelFormModal({ visible, initial, currency, onClose, onSave }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [error, setError] = useState("");

  React.useEffect(() => {
    if (visible) {
      setName(initial?.name || "");
      setAddress(initial?.address || "");
      setCheckIn(initial?.checkIn || "");
      setCheckOut(initial?.checkIn && initial?.nights ? addDaysStr(initial.checkIn, initial.nights) : "");
      setTotalPrice(initial?.nights && initial?.pricePerNight ? String(Math.round(initial.nights * initial.pricePerNight * 100) / 100) : "");
      setConfirmationCode(initial?.confirmationCode || "");
      setError("");
    }
  }, [visible, initial]);

  function addDaysStr(dateISO, n) {
    const d = new Date(dateISO + "T00:00:00");
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function isValidDate(v) {
    return /^\d{4}-\d{2}-\d{2}$/.test(v);
  }

  function save() {
    if (!name.trim()) return setError("Ajoutez un nom d'hôtel.");
    if (!isValidDate(checkIn) || !isValidDate(checkOut)) return setError("Dates au format AAAA-MM-JJ requises.");
    const nights = Math.round((new Date(checkOut + "T00:00:00") - new Date(checkIn + "T00:00:00")) / 86400000);
    if (nights < 1) return setError("La date de départ doit être après la date d'arrivée.");
    const price = parseFloat(totalPrice.replace(",", "."));
    onSave({
      name,
      address,
      checkIn,
      nights,
      totalPrice: !isNaN(price) ? price : 0,
      confirmationCode,
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>{initial?.stayId ? "Modifier l'hôtel" : "Ajouter un hôtel"}</Text>

            <Text style={styles.label}>Nom de l'hôtel</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Hotel Gracery Shinjuku" placeholderTextColor={THEME.inkFaint} />

            <Text style={styles.label}>Adresse</Text>
            <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="1-19-1 Kabukicho, Tokyo" placeholderTextColor={THEME.inkFaint} />

            <View style={styles.dateRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Arrivée</Text>
                <TextInput style={styles.input} value={checkIn} onChangeText={setCheckIn} placeholder="2026-09-15" placeholderTextColor={THEME.inkFaint} autoCapitalize="none" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Départ</Text>
                <TextInput style={styles.input} value={checkOut} onChangeText={setCheckOut} placeholder="2026-09-18" placeholderTextColor={THEME.inkFaint} autoCapitalize="none" />
              </View>
            </View>

            <Text style={styles.label}>Prix total du séjour ({currency})</Text>
            <TextInput style={styles.input} value={totalPrice} onChangeText={setTotalPrice} placeholder="0" placeholderTextColor={THEME.inkFaint} keyboardType="decimal-pad" />

            <Text style={styles.label}>Code de réservation (optionnel)</Text>
            <TextInput style={styles.input} value={confirmationCode} onChangeText={setConfirmationCode} placeholder="ABC123" placeholderTextColor={THEME.inkFaint} autoCapitalize="characters" />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={styles.modalButtonRow}>
              <TouchableOpacity style={styles.modalButton} onPress={onClose}>
                <Text style={styles.modalButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalButton} onPress={save}>
                <Text style={styles.modalButtonText}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  headerTitle: { color: THEME.ink, fontSize: 16, fontFamily: FONTS.headingSemiBold },
  scrollContent: { padding: 20 },
  helpText: { color: THEME.inkMuted, fontSize: 13.5, fontFamily: FONTS.body, lineHeight: 19, textAlign: "center", marginTop: 30 },
  card: {
    backgroundColor: THEME.bgCard,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 14,
    padding: 15,
    marginBottom: 12,
    ...CARD_SHADOW,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardTitle: { color: THEME.ink, fontSize: 15, fontFamily: FONTS.headingSemiBold, flex: 1, marginRight: 10 },
  cardAddress: { color: THEME.inkFaint, fontSize: 12, marginTop: 4, fontFamily: FONTS.body },
  cardMetaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  cardMeta: { color: THEME.inkMuted, fontSize: 12, textTransform: "capitalize", fontFamily: FONTS.body },
  cardPrice: { color: THEME.gold, fontSize: 13.5, fontFamily: FONTS.monoMedium },
  modalOverlay: { flex: 1, backgroundColor: "#00000099", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: THEME.bgCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "85%",
    borderWidth: 1,
    borderColor: THEME.border,
    ...CARD_SHADOW,
  },
  modalTitle: { fontSize: 16, color: THEME.ink, fontFamily: FONTS.headingSemiBold, marginBottom: 6 },
  label: { fontSize: 12.5, color: THEME.inkMuted, marginBottom: 6, marginTop: 14, fontFamily: FONTS.bodyMedium },
  input: {
    backgroundColor: THEME.bgCardAlt,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: THEME.ink,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  dateRow: { flexDirection: "row", gap: 10 },
  errorText: { color: THEME.stamp, fontSize: 12.5, marginTop: 14, fontFamily: FONTS.body },
  modalButtonRow: { flexDirection: "row", gap: 10, marginTop: 20, marginBottom: 10 },
  modalButton: { flex: 1, borderWidth: 1, borderColor: THEME.teal, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  modalButtonText: { color: THEME.teal, fontSize: 13.5, fontFamily: FONTS.bodySemiBold },
});
