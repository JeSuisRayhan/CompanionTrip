import React, { useState, useEffect } from "react";
import { View, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";

import { THEME, space, layout, themedStyles } from "../lib/theme";
import { getTrip, importScript } from "../lib/trips";
import { scriptHasDayHeaderLine } from "../lib/script";
import { Txt, Button, Group, Row, Field, EmptyState, ModalHeader } from "../components/ui";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;

// What the import did, in words: "2 prix ajoutés · 1 séjour d'hôtel · 3 étapes ajoutées".
function summarize(stats) {
  const parts = [];
  if (stats.priced) parts.push(plural(stats.priced, "prix ajouté", "prix ajoutés"));
  if (stats.stays) parts.push(plural(stats.stays, "séjour d'hôtel", "séjours d'hôtel"));
  if (stats.addedSteps) parts.push(plural(stats.addedSteps, "étape ajoutée", "étapes ajoutées"));
  if (stats.addedDays) parts.push(plural(stats.addedDays, "jour ajouté", "jours ajoutés"));
  return parts;
}

// A script pasted into a trip that already exists: the prices, the hotel stays (with their nights) and the
// steps that are missing are added; nothing that is already there is duplicated, ticked or noted is kept.
export default function ImportScriptScreen({ route, navigation }) {
  const { tripId } = route.params;
  const [trip, setTrip] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null); // what was done, once it is

  useEffect(() => {
    getTrip(tripId).then(setTrip);
  }, [tripId]);

  const close = () => navigation.goBack();

  async function pasteFromClipboard() {
    try {
      const clip = (await Clipboard.getStringAsync()) || "";
      if (clip.trim()) setText((prev) => (prev.trim() ? `${prev.trim()}\n${clip.trim()}` : clip.trim()));
    } catch (e) {
      // clipboard unavailable — the field can still be typed into
    }
  }

  async function run() {
    if (!scriptHasDayHeaderLine(text)) {
      setError("Aucun jour reconnu : commencez chaque journée par une ligne « Jour 1 - Titre ».");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setDone(await importScript(tripId, text));
    } catch (e) {
      setError("L'import a échoué. Rien n'a été modifié.");
    } finally {
      setBusy(false);
    }
  }

  if (!trip) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={THEME.teal} />
        </View>
      </SafeAreaView>
    );
  }

  if (done) {
    const parts = summarize(done);
    return (
      <SafeAreaView style={styles.safe}>
        <ModalHeader title="Importer un script" />
        <View style={styles.center}>
          {parts.length ? (
            <EmptyState icon="checkmark-circle-outline" tone="teal" title="Script importé" text={parts.join(" · ")} action={{ label: "Voir le voyage", onPress: close }} />
          ) : (
            <EmptyState
              icon="information-circle-outline"
              tone="gold"
              title="Rien à ajouter"
              text="Le script ne contient ni nouveau prix, ni hôtel, ni étape absente du voyage."
              action={{ label: "Modifier le texte", onPress: () => setDone(null) }}
            />
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ModalHeader title="Importer un script" left={{ label: "Annuler", onPress: close }} />
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Txt variant="subhead" style={styles.intro}>
            Collez le script de « {trip.name} ». Les prix, les hôtels et les étapes qui manquent sont ajoutés. Ce qui existe déjà n'est pas dupliqué, et ce que vous avez coché ou noté est gardé.
          </Txt>
          <Field
            label="Script"
            value={text}
            onChangeText={setText}
            placeholder={"Jour 1 - 31/10/2027 - Départ\n10:00 Vol Paris → Tokyo [transport] 850 €\n20:00 Check-in APA hôtel [hôtel] 3 nuits - 450 €"}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            error={error || undefined}
          />
          <Button title="Coller" icon="clipboard-outline" variant="secondary" size="sm" style={styles.paste} onPress={pasteFromClipboard} />
          <Group style={styles.help}>
            <Row icon="cash-outline" tone="teal" title="Prix" subtitle="Un montant en euros à la fin de la ligne : 850 €. Il va dans le budget." accessibilityLabel="Prix : un montant en euros à la fin de la ligne, il va dans le budget" />
            <Row icon="bed-outline" tone="stamp" title="Hôtels" subtitle="Nuits et prix total du séjour : 3 nuits - 450 €. Ou 90 €/nuit." accessibilityLabel="Hôtels : nuits et prix total du séjour, ou prix par nuit" />
          </Group>
          <Txt variant="caption" color="inkFaint" style={styles.note}>
            Les étapes sont retrouvées par leur titre, dans le même jour. Les nuits et les prix du script remplacent ceux du voyage.
          </Txt>
        </ScrollView>
        <View style={styles.footer}>
          <Button title="Importer" icon="download-outline" full loading={busy} disabled={!text.trim()} onPress={run} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: layout.gutter },
  scrollContent: { padding: layout.gutter, paddingBottom: space.xxl },
  intro: { marginBottom: space.lg },
  paste: { alignSelf: "flex-start" },
  help: { marginTop: space.xl },
  note: { marginTop: space.md },
  footer: { paddingHorizontal: layout.gutter, paddingTop: space.md, paddingBottom: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: THEME.hairStrong, backgroundColor: THEME.bg },
}));
