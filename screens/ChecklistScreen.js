// One list of a trip ("Avant le départ", "Bagages"): tick, add, remove.
import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, LayoutAnimation, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { THEME, space, type, themedStyles } from "../lib/theme";
import { getTrip, addChecklistItem, addChecklistItems, toggleChecklistItem, removeChecklistItem } from "../lib/trips";
import { tripInk, TripInkContext } from "../lib/tripInk";
import { Group, Field, IconButton, Button, ProgressBar, Txt } from "../components/ui";
import { TripTopBar, PageHead, CheckRow, MAIN } from "../components/mix";

const TITLES = { departureChecklist: "Avant le départ", packingList: "Bagages" };
// What most trips need: offered once, when a list is still empty.
const STARTER_ITEMS = {
  packingList: ["Pièce d'identité ou passeport", "Chargeur et câble du téléphone", "Adaptateur de prise", "Trousse de toilette", "Médicaments personnels", "Vêtements adaptés à la météo", "Carte bancaire et un peu d'espèces"],
  departureChecklist: ["Vérifier les dates de validité des papiers", "Télécharger ou imprimer les billets", "Confirmer les réservations (hébergement, transport)", "Prévenir la banque du voyage", "Vérifier l'assurance voyage", "Mettre les appareils à charger"],
};

export default function ChecklistScreen({ route, navigation }) {
  const { tripId } = route.params;
  const listKey = route.params.listKey === "packingList" ? "packingList" : "departureChecklist";
  const [trip, setTrip] = useState(null);
  const [label, setLabel] = useState("");

  const load = useCallback(async () => setTrip(await getTrip(tripId)), [tripId]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!trip) return <SafeAreaView style={styles.safe} />;
  const items = trip[listKey] || [];
  const done = items.filter((i) => i.checked).length;
  const ink = tripInk(trip);

  async function change(fn) {
    await fn();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    load();
  }
  async function add() {
    if (!label.trim()) return;
    const text = label;
    setLabel("");
    await change(() => addChecklistItem(trip.id, listKey, text));
  }

  return (
    <TripInkContext.Provider value={ink}>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <TripTopBar name={trip.name} onBack={() => navigation.goBack()} backLabel="Retour au voyage" />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={MAIN} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <PageHead title={TITLES[listKey]} sub={items.length ? `${done} sur ${items.length}` : "Rien ici pour l'instant"} />
            {items.length ? <ProgressBar value={done / items.length} tone={ink.name} height={4} /> : null}
            {items.length === 0 ? (
              <View style={{ gap: space.md }}>
                <Txt variant="subhead">Commencez par les essentiels, puis ajoutez les vôtres.</Txt>
                <Button title="Ajouter les essentiels" icon="list-outline" variant="secondary" onPress={() => change(() => addChecklistItems(trip.id, listKey, STARTER_ITEMS[listKey]))} style={{ alignSelf: "flex-start" }} />
              </View>
            ) : (
              <Group>
                {items.map((item) => (
                  <CheckRow
                    key={item.id}
                    label={item.label}
                    checked={item.checked}
                    accessibilityLabel={`${item.label}, ${item.checked ? "fait" : "à faire"}`}
                    onPress={() => change(() => toggleChecklistItem(trip.id, listKey, item.id))}
                    right={<IconButton icon="close" label={`Supprimer ${item.label}`} size={18} onPress={() => change(() => removeChecklistItem(trip.id, listKey, item.id))} />}
                  />
                ))}
              </Group>
            )}
            <View style={styles.addRow}>
              <Field placeholder="Ajouter un élément…" value={label} onChangeText={setLabel} onSubmitEditing={add} returnKeyType="done" style={{ flex: 1, marginBottom: 0 }} accessibilityLabel={`Ajouter à ${TITLES[listKey]}`} />
              <IconButton icon="add" label="Ajouter" tone="neutral" filled onPress={add} style={styles.addButton} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </TripInkContext.Provider>
  );
}

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  addRow: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  addButton: { width: 52, height: 52 },
}));
