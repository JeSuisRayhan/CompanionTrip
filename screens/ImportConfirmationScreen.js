import React, { useState, useEffect } from "react";
import { View, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";

import { THEME, space, layout, themedStyles } from "../lib/theme";
import { TYPES } from "../lib/constants";
import { getSetting } from "../lib/storage";
import { getTrip, addConfirmationSteps } from "../lib/trips";
import { parseConfirmation, parseConfirmationWithAI } from "../lib/confirmation";
import { resolveDayDate, formatDayLabel, formatShortDate } from "../lib/dates";
import { formatMoney } from "../lib/budget";
import { Txt, Button, Chip, Group, Row, Field, EmptyState, ModalHeader } from "../components/ui";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;

function summarize(stats) {
  const parts = [];
  if (stats.added) parts.push(plural(stats.added, "étape ajoutée", "étapes ajoutées"));
  if (stats.stays) parts.push(plural(stats.stays, "séjour d'hôtel", "séjours d'hôtel"));
  if (stats.updated) parts.push(plural(stats.updated, "étape complétée", "étapes complétées"));
  if (stats.addedDays) parts.push(plural(stats.addedDays, "jour ajouté", "jours ajoutés"));
  return parts;
}

// A booking confirmation pasted from an email: what is read from it is shown first, with the day each step goes
// to, and only what the person keeps is added.
export default function ImportConfirmationScreen({ route, navigation }) {
  const { tripId } = route.params;
  const [trip, setTrip] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState(null); // the steps read: { ...step, include, dayId }
  const [source, setSource] = useState("local");
  const [done, setDone] = useState(null);

  useEffect(() => {
    getTrip(tripId).then(setTrip);
  }, [tripId]);

  const close = () => navigation.goBack();

  async function pasteFromClipboard() {
    try {
      const clip = (await Clipboard.getStringAsync()) || "";
      if (clip.trim()) setText(clip.trim());
    } catch (e) {
      // clipboard unavailable — the field can still be typed into
    }
  }

  function show(steps, from) {
    setSource(from);
    setItems(steps.map((s) => ({ ...s, include: !!s.date, dayId: null })));
  }

  async function read() {
    setError("");
    const local = parseConfirmation(text, { trip });
    if (local.length) return show(local, "local");
    const key = await getSetting("anthropicApiKey");
    if (!key) {
      setError("Aucune réservation reconnue. Le texte doit contenir au moins le nom et la date. Pour les mises en page plus rares, ajoutez votre clé Anthropic dans les Réglages : la lecture se fera alors avec l'IA.");
      return;
    }
    setBusy(true);
    try {
      const ai = await parseConfirmationWithAI(text, key);
      if (ai.length) show(ai, "ai");
      else setError("Aucune réservation reconnue, même avec l'IA. Vérifiez que le texte est bien celui de la confirmation.");
    } catch (e) {
      setError("La lecture avec l'IA a échoué. Vérifiez la connexion et la clé des Réglages.");
    } finally {
      setBusy(false);
    }
  }

  const patch = (index, change) => setItems((list) => list.map((it, i) => (i === index ? { ...it, ...change } : it)));

  async function add() {
    const chosen = items.filter((it) => it.include && (it.date || it.dayId));
    setBusy(true);
    try {
      const stats = await addConfirmationSteps(
        tripId,
        chosen.map(({ include, ...step }) => {
          // a step placed by hand on a day with a date is a step with that date (a hotel then becomes a stay)
          const day = step.dayId ? trip.days.findIndex((d) => d.id === step.dayId) : -1;
          const dated = day >= 0 ? resolveDayDate(trip, trip.days[day], day) : null;
          return dated ? { ...step, date: dated, dayId: null } : step;
        })
      );
      setDone(stats);
    } catch (e) {
      setError("L'ajout a échoué. Rien n'a été modifié.");
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
        <ModalHeader title="Confirmation de réservation" />
        <View style={styles.center}>
          {parts.length ? (
            <EmptyState icon="checkmark-circle-outline" tone="teal" title="Réservation ajoutée" text={parts.join(" · ")} action={{ label: "Voir le voyage", onPress: close }} />
          ) : (
            <EmptyState icon="information-circle-outline" tone="gold" title="Rien à ajouter" text="Cette réservation est déjà dans le voyage." action={{ label: "Fermer", onPress: close }} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  if (items) {
    const picked = items.filter((it) => it.include && (it.date || it.dayId)).length;
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <ModalHeader title="Ce qui a été lu" left={{ label: "Retour", onPress: () => setItems(null) }} />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Txt variant="subhead" style={styles.intro}>
            {source === "ai" ? "Lu avec l'IA. " : ""}Vérifiez, décochez ce qui ne va pas : seul ce qui est coché est ajouté. Vous pourrez tout modifier ensuite.
          </Txt>
          {items.map((it, index) => {
            const t = TYPES[it.type] || TYPES.activite;
            const bits = [
              it.date ? formatDayLabel(it.date) : "Jour à choisir",
              it.time,
              it.type === "hotel" && it.nights ? plural(it.nights, "nuit") : null,
              it.price != null ? formatMoney(it.price, "EUR") : null,
              it.confirmationCode ? `code ${it.confirmationCode}` : null,
            ].filter(Boolean);
            const placeable = !!(it.date || it.dayId);
            return (
              <View key={index} style={styles.item}>
                <Group>
                  <Row
                    icon={t.icon}
                    tone={it.type === "hotel" ? "stamp" : it.type === "repas" ? "gold" : it.type === "transport" ? "blue" : "teal"}
                    title={it.title}
                    subtitle={bits.join(" · ")}
                    right={<Ionicons name={it.include && placeable ? "checkbox" : "square-outline"} size={24} color={it.include && placeable ? THEME.teal : THEME.inkFaint} />}
                    onPress={() => placeable && patch(index, { include: !it.include })}
                    accessibilityLabel={`${it.title}, ${it.include && placeable ? "sélectionnée" : "ignorée"}`}
                  />
                </Group>
                {!it.date ? (
                  <View style={styles.dayPick}>
                    <Txt variant="caption" color="inkMuted">Quel jour ?</Txt>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                      {trip.days.map((d, i) => {
                        const date = resolveDayDate(trip, d, i);
                        return (
                          <Chip
                            key={d.id}
                            label={`J${i + 1}${date ? " · " + formatShortDate(date) : ""}`}
                            selected={it.dayId === d.id}
                            onPress={() => patch(index, { dayId: d.id, include: true })}
                            accessibilityLabel={`${it.title} : jour ${i + 1}`}
                          />
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}
              </View>
            );
          })}
          {items.length > 1 && items[0].price != null ? (
            <Txt variant="caption" color="inkFaint" style={styles.note}>
              Le prix total de la réservation est mis sur la première étape.
            </Txt>
          ) : null}
          {error ? <Txt variant="caption" color="stamp" style={styles.note}>{error}</Txt> : null}
        </ScrollView>
        <View style={styles.footer}>
          <Button title={picked ? `Ajouter ${plural(picked, "étape")}` : "Rien de coché"} icon="add" full loading={busy} disabled={!picked} onPress={add} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ModalHeader title="Confirmation de réservation" left={{ label: "Annuler", onPress: close }} />
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Txt variant="subhead" style={styles.intro}>
            Collez le texte d'un mail ou d'un SMS de confirmation (vol, train, hôtel, restaurant, billet). L'étape est créée sur le bon jour de « {trip.name} », avec l'heure, le prix et le code.
          </Txt>
          <Field
            label="Confirmation"
            value={text}
            onChangeText={setText}
            placeholder={"Référence de réservation : K7QX2M\nAller - samedi 30 octobre 2027\nParis (CDG) 10:05 → Tokyo (HND) 06:30\nTotal payé : 1 284,50 €"}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            error={error || undefined}
          />
          <Button title="Coller" icon="clipboard-outline" variant="secondary" size="sm" style={styles.paste} onPress={pasteFromClipboard} />
          <Group style={styles.help}>
            <Row icon="airplane-outline" tone="blue" title="Vol et train" subtitle="Un trajet par étape, avec l'heure de départ." accessibilityLabel="Vol et train : un trajet par étape avec l'heure de départ" />
            <Row icon="bed-outline" tone="stamp" title="Hôtel" subtitle="Devient un séjour : nuits, prix total et code." accessibilityLabel="Hôtel : devient un séjour avec nuits, prix total et code" />
            <Row icon="restaurant-outline" tone="gold" title="Restaurant ou billet" subtitle="Le jour, l'heure, l'adresse et le code." accessibilityLabel="Restaurant ou billet : le jour, l'heure, l'adresse et le code" />
          </Group>
          <Txt variant="caption" color="inkFaint" style={styles.note}>
            Lecture faite sur le téléphone, sans envoyer le texte nulle part. Seuls les prix en euros sont lus.
          </Txt>
        </ScrollView>
        <View style={styles.footer}>
          <Button title="Lire la réservation" icon="search-outline" full loading={busy} disabled={!text.trim()} onPress={read} />
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
  item: { marginBottom: space.md },
  dayPick: { gap: space.xs, marginTop: space.sm },
  chips: { gap: space.sm, paddingRight: space.lg },
  footer: { paddingHorizontal: layout.gutter, paddingTop: space.md, paddingBottom: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: THEME.hairStrong, backgroundColor: THEME.bg },
}));
