import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";

import { THEME, space, layout, type, themedStyles } from "../lib/theme";
import { getTrip, listHotelStays } from "../lib/trips";
import { saveHotelStay, deleteHotelStay } from "../lib/ideas";
import { addDaysISO, formatDateRange } from "../lib/dates";
import { formatMoney } from "../lib/budget";
import { driverCard } from "../lib/driverCard";
import { Txt, Button, IconButton, Group, Row, Field, EmptyState, Sheet, BackHeader, Fab } from "../components/ui";
import DateField from "../components/DateField";

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

  // Arriving from an idea ("Construire mon voyage"): open the form pre-filled
  // with the idea's name/address. Consumed once so going back doesn't reopen it.
  React.useEffect(() => {
    const prefill = route.params?.prefill;
    if (prefill) {
      setEditing({ name: prefill.name, address: prefill.address, ideaId: prefill.ideaId, lat: prefill.lat, lng: prefill.lng });
      navigation.setParams({ prefill: undefined });
    }
  }, [route.params?.prefill]);

  function confirmDelete(stay) {
    Alert.alert("Supprimer cet hôtel ?", `"${stay.name}" sera retiré du programme.`, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          await deleteHotelStay(tripId, stay.stayId);
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
      <BackHeader title="Hôtels" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {stays.length === 0 ? (
          <EmptyState
            icon="bed-outline"
            tone="stamp"
            title="Aucun hôtel pour l'instant"
            text="Ajoutez chaque hôtel une fois — nom, adresse, dates, prix total — et l'app crée l'étape correspondante et compte les nuits automatiquement dans le budget."
            action={{ label: "Ajouter un hôtel", icon: "add", onPress: () => setEditing({}) }}
          />
        ) : (
          <Group>
            {stays
              .sort((a, b) => (a.checkIn || "").localeCompare(b.checkIn || ""))
              .map((stay) => (
                <Row
                  key={stay.stayId}
                  title={
                    <Text style={styles.stayName} numberOfLines={2}>
                      {stay.name}
                    </Text>
                  }
                  accessibilityLabel={`${stay.name}, modifier`}
                  onPress={() => setEditing(stay)}
                  right={
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      {driverCard({ title: stay.name, address: stay.address, localAddress: stay.localAddress }) ? (
                        <IconButton
                          icon="car-outline"
                          label={`Montrer l'adresse de ${stay.name} au chauffeur`}
                          size={18}
                          onPress={() => navigation.navigate("ShowDriver", driverCard({ title: stay.name, address: stay.address, localAddress: stay.localAddress }))}
                        />
                      ) : null}
                      <IconButton icon="trash-outline" label={`Supprimer ${stay.name}`} size={18} onPress={() => confirmDelete(stay)} />
                    </View>
                  }
                  style={styles.stayRow}
                >
                  {stay.address ? (
                    <Text style={type.subhead} numberOfLines={1}>
                      {stay.address}
                    </Text>
                  ) : null}
                  <View style={styles.metaRow}>
                    {stay.checkIn ? (
                      <Text style={type.numeralSmall}>
                        {`${formatDateRange(stay.checkIn, addDaysISO(stay.checkIn, stay.nights))} · ${stay.nights} nuit${stay.nights !== 1 ? "s" : ""}`}
                      </Text>
                    ) : (
                      <Text style={type.caption}>{`Date à définir · ${stay.nights} nuit${stay.nights !== 1 ? "s" : ""}`}</Text>
                    )}
                    <Text style={type.numeral}>{formatMoney(stay.pricePerNight * stay.nights, trip.currency)}</Text>
                  </View>
                </Row>
              ))}
          </Group>
        )}
      </ScrollView>

      {stays.length > 0 && <Fab label="Ajouter un hôtel" onPress={() => setEditing({})} />}

      <HotelFormModal
        visible={!!editing}
        initial={editing}
        currency={trip.currency}
        onClose={() => setEditing(null)}
        onSave={async (values) => {
          await saveHotelStay(tripId, { stayId: editing?.stayId, ideaId: editing?.ideaId, lat: editing?.lat, lng: editing?.lng, ...values });
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

  // Choosing the arrival also moves the departure to the next day when it would
  // otherwise be missing or not after it.
  function onCheckInChange(v) {
    setCheckIn(v);
    if (v && (!checkOut || checkOut <= v)) setCheckOut(addDaysStr(v, 1));
  }

  function save() {
    if (!name.trim()) return setError("Ajoutez un nom d'hôtel.");
    if (!isValidDate(checkIn) || !isValidDate(checkOut)) return setError("Choisissez les dates d'arrivée et de départ.");
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
    <Sheet visible={visible} onClose={onClose} title={initial?.stayId ? "Modifier l'hôtel" : "Ajouter un hôtel"}>
      <Field label="Nom de l'hôtel" value={name} onChangeText={setName} placeholder="Hotel Gracery Shinjuku" />

      <Field label="Adresse" value={address} onChangeText={setAddress} placeholder="1-19-1 Kabukicho, Tokyo" />

      <View style={styles.dateRow}>
        <DateField label="Arrivée" compact value={checkIn} onChange={onCheckInChange} style={styles.flex} />
        <DateField label="Départ" compact value={checkOut} min={checkIn ? addDaysStr(checkIn, 1) : undefined} onChange={setCheckOut} style={styles.flex} />
      </View>

      <Field label={`Prix total du séjour (${currency})`} value={totalPrice} onChangeText={setTotalPrice} placeholder="0" keyboardType="decimal-pad" inputStyle={type.numeral} />

      <Field label="Code de réservation (optionnel)" value={confirmationCode} onChangeText={setConfirmationCode} placeholder="ABC123" autoCapitalize="characters" />

      {error ? (
        <Txt variant="caption" color="stamp" style={styles.error}>
          {error}
        </Txt>
      ) : null}

      <View style={styles.sheetButtons}>
        <Button title="Annuler" variant="secondary" style={styles.flex} onPress={onClose} />
        <Button title="Enregistrer" style={styles.flex} onPress={save} />
      </View>
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scrollContent: { padding: layout.gutter, paddingBottom: layout.tabBarClearance },
  stayRow: { paddingRight: space.xs },
  stayName: { ...type.name },
  metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", columnGap: space.md, rowGap: 2, marginTop: space.xs },
  dateRow: { flexDirection: "row", gap: space.md },
  error: { marginBottom: space.md },
  sheetButtons: { flexDirection: "row", gap: space.md, marginTop: space.xs },
}));
