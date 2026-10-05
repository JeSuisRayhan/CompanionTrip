import React, { useState, useEffect, useRef } from "react";
import { View, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "../components/Icon";
import * as Clipboard from "expo-clipboard";

import { THEME, space, layout, themedStyles } from "../lib/theme";
import { TYPES } from "../lib/constants";
import { getSetting } from "../lib/storage";
import { getTrip, addConfirmationSteps } from "../lib/trips";
import { readConfirmation } from "../lib/confirmation";
import { MAX_FILES, pickScreenshots, pickPdf, loadFiles } from "../lib/confirmationFiles";
import { addDocument } from "../lib/documents";
import { resolveDayDate, formatDayLabel, formatShortDate, formatDateRange, addDaysISO } from "../lib/dates";
import { formatMoney } from "../lib/budget";
import { Txt, Button, IconButton, Chip, Group, Row, Field, EmptyState, ModalHeader } from "../components/ui";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;

function summarize(stats) {
  const parts = [];
  if (stats.added) parts.push(plural(stats.added, "étape ajoutée", "étapes ajoutées"));
  if (stats.stays) parts.push(plural(stats.stays, "séjour d'hôtel", "séjours d'hôtel"));
  if (stats.updated) parts.push(plural(stats.updated, "étape complétée", "étapes complétées"));
  if (stats.addedDays) parts.push(plural(stats.addedDays, "jour ajouté", "jours ajoutés"));
  if (stats.docs) parts.push(plural(stats.docs, "document gardé", "documents gardés"));
  return parts;
}

// The icon of a step read: its mode of transport when it has one.
const MODE_ICON = { avion: "airplane", train: "train", bus: "bus", bateau: "boat" };

function errorText(e, hasFiles) {
  if (e && e.code === "NO_API_KEY") return "Une capture ou un PDF se lit avec l'IA : ajoutez votre clé Anthropic dans les Réglages.";
  if (e && (e.code === "TOO_BIG" || e.code === "UNREADABLE")) return e.message;
  return hasFiles ? "La lecture avec l'IA a échoué. Vérifiez la connexion, la clé des Réglages et que les fichiers sont lisibles." : "La lecture avec l'IA a échoué. Vérifiez la connexion et la clé des Réglages.";
}

// A booking confirmation pasted from an email: what is read from it is shown first, with the day each step goes
// to, and only what the person keeps is added.
export default function ImportConfirmationScreen({ route, navigation }) {
  // initialText / initialFiles: what another app shared; autoRead: read it right away (a text can be read without the key,
  // pictures and PDFs need it)
  const { tripId, initialText, initialFiles, autoRead } = route.params;
  const [trip, setTrip] = useState(null);
  const [hasKey, setHasKey] = useState(null); // null until the settings are read
  const [text, setText] = useState(initialText || "");
  const [files, setFiles] = useState(initialFiles || []); // [{ uri, name, kind, mime }]
  const [keepOriginal, setKeepOriginal] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState(null); // the steps read: { ...step, include, dayId }
  const [source, setSource] = useState("local");
  const [done, setDone] = useState(null);
  const autoStarted = useRef(false);

  useEffect(() => {
    (async () => {
      setTrip(await getTrip(tripId));
      setHasKey(!!(await getSetting("anthropicApiKey")));
    })();
  }, [tripId]);

  useEffect(() => {
    if (!autoRead || autoStarted.current || !trip || hasKey == null) return;
    autoStarted.current = true;
    if (files.length ? hasKey : !!text.trim()) read();
  }, [trip, hasKey]);

  const close = () => navigation.goBack();

  async function pasteFromClipboard() {
    try {
      const clip = (await Clipboard.getStringAsync()) || "";
      if (clip.trim()) setText(clip.trim());
    } catch (e) {
      // clipboard unavailable — the field can still be typed into
    }
  }

  const addFiles = (picked) => setFiles((list) => [...list, ...picked.filter((f) => !list.some((x) => x.uri === f.uri))].slice(0, MAX_FILES));

  async function chooseScreenshots() {
    setError("");
    try {
      addFiles(await pickScreenshots(MAX_FILES - files.length));
    } catch (e) {
      setError(e && e.code === "PERMISSION_DENIED" ? "L'accès aux photos est refusé : autorisez-le dans les réglages du téléphone." : (e && e.message) || "Les photos n'ont pas pu être ouvertes.");
    }
  }

  async function choosePdf() {
    setError("");
    try {
      const pdf = await pickPdf();
      if (pdf) addFiles([pdf]);
    } catch (e) {
      setError("Le fichier n'a pas pu être ouvert.");
    }
  }

  function show(steps, from) {
    setSource(from);
    setItems(steps.map((s) => ({ ...s, include: !!s.date, dayId: null })));
  }

  async function read() {
    setError("");
    setBusy(true);
    try {
      const key = await getSetting("anthropicApiKey");
      const loaded = files.length ? await loadFiles(files) : [];
      const res = await readConfirmation({ text, files: loaded, trip, apiKey: key || null });
      if (res.steps.length) show(res.steps, res.source);
      else if (files.length) setError("Aucune réservation reconnue dans ces fichiers. Vérifiez qu'ils montrent bien la confirmation.");
      else if (!key) setError("Aucune réservation reconnue. Le texte doit contenir au moins le nom et la date. Pour les mises en page plus rares, ajoutez votre clé Anthropic dans les Réglages : la lecture se fera alors avec l'IA.");
      else setError("Aucune réservation reconnue, même avec l'IA. Vérifiez que le texte est bien celui de la confirmation.");
    } catch (e) {
      setError(errorText(e, files.length > 0));
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
      // the file the booking was read from goes to the Documents tab, where it is at hand at the desk or the gate
      stats.docs = 0;
      if (keepOriginal && files.length && stats.added + stats.stays + stats.updated > 0) {
        const category = chosen.some((c) => c.type === "hotel") ? "hotel" : chosen.some((c) => c.type === "transport") ? "transport" : "autre";
        const base = String(chosen[0].title).slice(0, 60);
        for (let i = 0; i < files.length; i++) {
          try {
            await addDocument(tripId, { title: files.length > 1 ? `${base} (${i + 1})` : base, category, tempUri: files[i].uri, kind: files[i].kind === "pdf" ? "pdf" : undefined });
            stats.docs++;
          } catch (e) {
            // the steps are in: a file that cannot be copied is not worth undoing them
          }
        }
      }
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
        <ModalHeader title="Réservation" />
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
            // a stay says its two days ("17 – 29 oct."), the other steps their day
            const stayRange = it.type === "hotel" && it.date && it.nights ? formatDateRange(it.date, addDaysISO(it.date, it.nights)) : null;
            const bits = [
              stayRange || (it.date ? formatDayLabel(it.date) : "Jour à choisir"),
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
                    icon={MODE_ICON[it.transportMode] || t.icon}
                    tone={it.type === "hotel" ? "stamp" : it.type === "repas" ? "gold" : it.type === "transport" ? "blue" : "teal"}
                    title={it.title}
                    subtitle={bits.join(" · ")}
                    right={<Icon name={it.include && placeable ? "checkbox" : "square-outline"} size={24} color={it.include && placeable ? THEME.teal : THEME.inkFaint} />}
                    onPress={() => placeable && patch(index, { include: !it.include })}
                    accessibilityLabel={`${it.title}, ${it.include && placeable ? "sélectionnée" : "ignorée"}`}
                  >
                    {it.address ? (
                      <Txt variant="caption" color="inkFaint" numberOfLines={2} style={styles.address}>
                        {it.address}
                      </Txt>
                    ) : null}
                  </Row>
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
          {files.length ? (
            <Group style={styles.keep}>
              <Row
                icon="attach-outline"
                tone="teal"
                title="Garder l'original dans Documents"
                subtitle={files.length > 1 ? "Les fichiers rejoignent l'onglet Documents du voyage." : "Le fichier rejoint l'onglet Documents du voyage."}
                right={<Icon name={keepOriginal ? "checkbox" : "square-outline"} size={24} color={keepOriginal ? THEME.teal : THEME.inkFaint} />}
                onPress={() => setKeepOriginal((v) => !v)}
                accessibilityLabel={`Garder l'original dans Documents : ${keepOriginal ? "oui" : "non"}`}
              />
            </Group>
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
        <ModalHeader title="Réservation" left={{ label: "Annuler", onPress: close }} />
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Txt variant="subhead" style={styles.intro}>
            Collez le texte d'un mail ou d'un SMS, ou choisissez une capture d'écran ou un PDF : vol, train, bus, bateau, hôtel, restaurant ou billet. L'étape est créée sur le bon jour de « {trip.name} », avec l'heure, le prix et le code. Un hôtel devient un séjour.
          </Txt>
          <Field
            label="Confirmation"
            value={text}
            onChangeText={setText}
            placeholder={"Référence de réservation : K7QX2M\nAller - samedi 30 octobre 2027\nParis (CDG) 10:05 → Tokyo (HND) 06:30\nTotal payé : 1 284,50 €"}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.actions}>
            <Button title="Coller" icon="clipboard-outline" variant="secondary" size="sm" onPress={pasteFromClipboard} />
            <Button title="Capture d'écran" icon="image-outline" variant="secondary" size="sm" disabled={!hasKey || files.length >= MAX_FILES} onPress={chooseScreenshots} />
            <Button title="PDF" icon="document-outline" variant="secondary" size="sm" disabled={!hasKey || files.length >= MAX_FILES} onPress={choosePdf} />
          </View>
          {hasKey === false ? (
            <Txt variant="caption" color="inkFaint" style={styles.keyHint}>
              Les captures d'écran et les PDF se lisent avec l'IA : ajoutez votre clé Anthropic dans les Réglages.
            </Txt>
          ) : null}
          {files.length ? (
            <Group style={styles.files}>
              {files.map((f) => (
                <Row
                  key={f.uri}
                  icon={f.kind === "pdf" ? "document-outline" : "image-outline"}
                  tone={f.kind === "pdf" ? "stamp" : "blue"}
                  title={f.name}
                  subtitle={f.kind === "pdf" ? "PDF" : "Capture d'écran"}
                  right={<IconButton icon="close" label={`Retirer ${f.name}`} size={18} onPress={() => setFiles((list) => list.filter((x) => x.uri !== f.uri))} />}
                />
              ))}
            </Group>
          ) : null}
          {error ? (
            <Txt variant="subhead" color="stamp" style={styles.error} accessibilityRole="alert">
              {error}
            </Txt>
          ) : null}
          <Group style={styles.help}>
            <Row icon="airplane-outline" tone="blue" title="Vol, train, bus et bateau" subtitle="Un trajet par étape, avec l'heure de départ." accessibilityLabel="Vol, train, bus et bateau : un trajet par étape avec l'heure de départ" />
            <Row icon="bed-outline" tone="stamp" title="Hôtel" subtitle="Devient un séjour : dates, nuits, adresse, prix total et code." accessibilityLabel="Hôtel : devient un séjour avec dates, nuits, adresse, prix total et code" />
            <Row icon="restaurant-outline" tone="gold" title="Restaurant ou billet" subtitle="Le jour, l'heure, l'adresse et le code." accessibilityLabel="Restaurant ou billet : le jour, l'heure, l'adresse et le code" />
          </Group>
          <Txt variant="caption" color="inkFaint" style={styles.note}>
            Avec votre clé Anthropic (Réglages), l'IA lit le texte et les fichiers, qui lui sont envoyés. Sans clé, seuls les textes aux mises en page courantes sont lus, sur le téléphone. Seuls les prix en euros sont lus.
          </Txt>
        </ScrollView>
        <View style={styles.footer}>
          <Button title="Lire la réservation" icon="search-outline" full loading={busy} disabled={!text.trim() && !files.length} onPress={read} />
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
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  keyHint: { marginTop: space.sm },
  files: { marginTop: space.md },
  error: { marginTop: space.md },
  address: { marginTop: 2 },
  keep: { marginTop: space.lg },
  help: { marginTop: space.xl },
  note: { marginTop: space.md },
  item: { marginBottom: space.md },
  dayPick: { gap: space.xs, marginTop: space.sm },
  chips: { gap: space.sm, paddingRight: space.lg },
  footer: { paddingHorizontal: layout.gutter, paddingTop: space.md, paddingBottom: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: THEME.hairStrong, backgroundColor: THEME.bg },
}));
