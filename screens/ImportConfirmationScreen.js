// "Réservation": a booking confirmation (pasted text, screenshots, a PDF) read into steps. What was read is shown first,
// as it will be put in the trip (the day, the hour, the price, the code), and only what the person keeps is added.
import React, { useState, useEffect, useRef } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "../components/Icon";
import * as Clipboard from "expo-clipboard";

import { THEME, TONES, FONTS, space, layout, type, themedStyles, paperEdge } from "../lib/theme";
import { getTrip, addConfirmationSteps } from "../lib/trips";
import { readConfirmations, inTripCurrency } from "../lib/confirmation";
import { MAX_FILES, pickScreenshots, pickPdf, readFiles } from "../lib/confirmationFiles";
import { addDocument } from "../lib/documents";
import { euroRateFor } from "../lib/rates";
import { fetchParks } from "../lib/queueTimes";
import { resolveDayDate, formatDayLabel, formatShortDate, addDaysISO } from "../lib/dates";
import { formatMoney } from "../lib/budget";
import { stepTone, stepIcon } from "../lib/stepLook";
import { tripInk, TripInkContext } from "../lib/tripInk";
import { Button, Chip, Stamp, Field, Group, Row, round } from "../components/ui";
import { TripTopBar, TopButton, Section, Perforation, CheckBox, MAIN } from "../components/mix";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;

function summarize(stats) {
  const parts = [];
  if (stats.added) parts.push(plural(stats.added, "étape ajoutée", "étapes ajoutées"));
  if (stats.stays) parts.push(plural(stats.stays, "séjour d'hôtel", "séjours d'hôtel"));
  if (stats.updated) parts.push(plural(stats.updated, "étape complétée", "étapes complétées"));
  if (stats.addedDays) parts.push(plural(stats.addedDays, "jour ajouté", "jours ajoutés"));
  if (stats.travelDays) parts.push(plural(stats.travelDays, "jour de voyage", "jours de voyage"));
  if (stats.parkDays) parts.push(plural(stats.parkDays, "jour parc d'attractions", "jours parc d'attractions"));
  if (stats.docs) parts.push(plural(stats.docs, "document gardé", "documents gardés"));
  return parts;
}

// A file that could not be read says why (our own errors carry a message made for the person).
function errorText(e) {
  if (e && e.code && e.message) return e.message;
  return "La lecture a échoué. Vérifiez que les fichiers sont lisibles.";
}

// Nothing was recognised: say what happened to each file read, or what the text lacks.
function nothingText(files) {
  const empty = files.filter((f) => !f.text.trim());
  if (empty.length) {
    return empty
      .map((f) =>
        f.kind === "pdf"
          ? `« ${f.name} » ne contient pas de texte (c'est un scan) : ouvrez-le et faites-en une capture d'écran.`
          : `Aucun texte reconnu dans « ${f.name} » : vérifiez que la capture montre toute la confirmation, bien nette.`
      )
      .join(" ");
  }
  if (files.length) return "Le texte est lu (ci-dessus) mais aucune réservation n'y est reconnue. Corrigez-le si besoin, il faut au moins le nom et la date, puis relancez la lecture.";
  return "Aucune réservation reconnue. Le texte doit contenir au moins le nom et la date.";
}

// What a booking is called on its stamp.
const KIND = { hotel: "Hébergement", repas: "Restaurant", activite: "Billet", transport: "Transport" };
const MODE_KIND = { avion: "Vol", train: "Train", bus: "Bus", bateau: "Bateau" };
const kindOf = (item) => (item.type === "transport" && MODE_KIND[item.transportMode]) || KIND[item.type] || KIND.activite;

// One line of what was read: its name small, its value like a figure, and a tick (or a stamp when it is to be checked).
function Fact({ label, value, plain, check, stamp, tint, right, first }) {
  return (
    <View style={[styles.fact, !first && styles.factRule, tint && { backgroundColor: tint }]}>
      <View style={styles.factText}>
        <Text style={styles.factLabel}>{label}</Text>
        <Text style={plain ? styles.factPlain : styles.factValue} numberOfLines={3}>{value}</Text>
      </View>
      {right || (stamp ? <Stamp label={stamp.label} tone={stamp.tone} small tilt={0} decorative /> : check ? <Icon name="checkmark" size={22} color={THEME.teal} /> : null)}
    </View>
  );
}

// A step read, as it will be put in the trip: its day, its hour, what it costs, its code. The box on its title keeps it
// or leaves it out; a step with no date asks for its day.
function ReadCard({ item, trip, withHead, priceText, converted, onToggle, onDay }) {
  const tone = stepTone(item);
  const dated = !!item.date;
  const placeable = dated || !!item.dayId;
  const kept = item.include && placeable;
  const [copied, setCopied] = useState(false);
  const stay = item.type === "hotel" && dated && item.nights >= 1;
  const timeBit = item.time ? ` · ${item.time}` : "";
  const copy = async () => {
    try {
      await Clipboard.setStringAsync(String(item.confirmationCode));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      // no clipboard: the code is on screen
    }
  };
  return (
    <View style={[styles.card, round("lg"), !kept && withHead && { opacity: 0.6 }]}>
      {withHead ? (
        <Pressable
          onPress={() => placeable && onToggle()}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: kept, disabled: !placeable }}
          accessibilityLabel={`${item.title}, ${kept ? "sera ajoutée" : "ignorée"}`}
          style={({ pressed }) => [styles.cardHead, pressed && { backgroundColor: THEME.pressed }]}
        >
          <View style={[styles.cardTile, { backgroundColor: TONES[tone].bg }]}>
            <Icon name={stepIcon(item)} size={20} color={TONES[tone].fg} />
          </View>
          <Text style={[type.name, { flex: 1 }]} numberOfLines={2}>{item.title}</Text>
          <CheckBox checked={kept} />
        </Pressable>
      ) : null}

      {stay ? (
        <>
          <Fact first={!withHead} label="Arrivée" value={`${formatDayLabel(item.date)}${timeBit}`} check />
          <Fact label="Départ" value={formatDayLabel(addDaysISO(item.date, item.nights))} check />
        </>
      ) : (
        <Fact first={!withHead} label="Jour" value={dated ? `${formatDayLabel(item.date)}${timeBit}` : item.dayId ? dayChoiceLabel(trip, item.dayId) : "À choisir"} check={placeable} stamp={placeable ? null : { label: "À choisir", tone: "gold" }} />
      )}
      {!dated ? (
        <View style={[styles.dayPick, styles.factRule]}>
          <Text style={type.caption}>Quel jour ?</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {trip.days.map((d, i) => {
              const date = resolveDayDate(trip, d, i);
              return <Chip key={d.id} label={`J${i + 1}${date ? " · " + formatShortDate(date, false) : ""}`} selected={item.dayId === d.id} onPress={() => onDay(d.id)} accessibilityLabel={`${item.title} : jour ${i + 1}`} />;
            })}
          </ScrollView>
        </View>
      ) : null}
      {item.address ? <Fact label="Adresse" value={item.address} plain check /> : null}
      {priceText ? (
        <Fact
          label={converted ? "Prix total · au taux du voyage" : "Prix total"}
          value={priceText}
          tint={converted ? THEME.goldDim : undefined}
          stamp={converted ? { label: "À vérifier", tone: "gold" } : null}
          check={!converted}
        />
      ) : null}
      {item.confirmationCode ? (
        <Fact
          label="Code de réservation"
          value={String(item.confirmationCode)}
          right={<Button title={copied ? "Copié" : "Copier"} icon={copied ? "checkmark" : undefined} variant="secondary" size="sm" onPress={copy} accessibilityLabel={`Copier le code ${item.confirmationCode}`} />}
        />
      ) : null}
    </View>
  );
}

const dayChoiceLabel = (trip, dayId) => {
  const i = trip.days.findIndex((d) => d.id === dayId);
  if (i < 0) return "À choisir";
  const date = resolveDayDate(trip, trip.days[i], i);
  return date ? formatDayLabel(date) : `Jour ${i + 1}`;
};

// A booking confirmation pasted from an email: what is read from it is shown first, with the day each step goes
// to, and only what the person keeps is added.
export default function ImportConfirmationScreen({ route, navigation }) {
  // initialText / initialFiles: what another app shared; autoRead: read it right away
  const { tripId, initialText, initialFiles, autoRead } = route.params;
  const [trip, setTrip] = useState(null);
  const [text, setText] = useState(initialText || "");
  const [files, setFiles] = useState(initialFiles || []); // [{ uri, name, kind, mime }]
  const [keepOriginal, setKeepOriginal] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState(null); // the steps read: { ...step, include, dayId }
  const [rate, setRate] = useState(null); // what 1 euro is worth in the trip's currency, for the prices read (null: unknown)
  const [done, setDone] = useState(null);
  const autoStarted = useRef(false);

  useEffect(() => {
    (async () => {
      setTrip(await getTrip(tripId));
    })();
  }, [tripId]);

  useEffect(() => {
    if (!autoRead || autoStarted.current || !trip) return;
    autoStarted.current = true;
    if (text.trim() || files.length) read();
  }, [trip]);

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

  function show(steps) {
    setItems(steps.map((s) => ({ ...s, include: !!s.date, dayId: null })));
  }

  async function read() {
    setError("");
    setBusy(true);
    try {
      const fromFiles = files.length ? await readFiles(files) : [];
      const steps = readConfirmations([text, ...fromFiles.map((f) => f.text)].filter((t) => t.trim()), { trip });
      if (steps.length) {
        // the prices read are in euros: a trip in another currency needs the rate to count them
        setRate(trip.currency && trip.currency !== "EUR" && steps.some((x) => x.price != null) ? await euroRateFor(trip) : null);
        show(steps);
      } else {
        // what was read in the files goes into the field: the person can correct it (a misread letter) and read again
        if (fromFiles.some((f) => f.text.trim())) {
          setText([text.trim(), ...fromFiles.map((f) => f.text)].filter(Boolean).join("\n\n"));
          setFiles([]);
        }
        setError(nothingText(fromFiles));
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const needsRate = !!trip && !!trip.currency && trip.currency !== "EUR";
  const patch = (index, change) => setItems((list) => list.map((it, i) => (i === index ? { ...it, ...change } : it)));

  async function add() {
    const chosen = items.filter((it) => it.include && (it.date || it.dayId));
    setBusy(true);
    try {
      const placed = chosen.map(({ include, ...step }) => {
        // a step placed by hand on a day with a date is a step with that date (a hotel then becomes a stay)
        const day = step.dayId ? trip.days.findIndex((d) => d.id === step.dayId) : -1;
        const dated = day >= 0 ? resolveDayDate(trip, trip.days[day], day) : null;
        return dated ? { ...step, date: dated, dayId: null } : step;
      });
      // the prices read are in euros; the trip counts in its own currency
      const steps = needsRate ? inTripCurrency(placed, rate ? rate.rate : 0) : placed;
      // a ticket may be for a theme park: the list of parks tells which one, so the day gets it straight away
      let parks = null;
      if (steps.some((x) => x.type === "activite")) {
        try {
          parks = await fetchParks({ timeoutMs: 4000 });
        } catch (e) {
          // no list: the day is still a park day, the park is chosen on it
        }
      }
      const stats = await addConfirmationSteps(tripId, steps, { parks });
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
          <ActivityIndicator color={THEME.ink} />
        </View>
      </SafeAreaView>
    );
  }

  const ink = tripInk(trip);
  const top = (onBack, label, icon) => <TripTopBar name={`${trip.name} · réservation`} onBack={onBack} backLabel={label} backIcon={icon} />;

  if (done) {
    const parts = summarize(done);
    return (
      <TripInkContext.Provider value={ink}>
        <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
          {top(close, "Fermer", "close")}
          <View style={styles.center}>
            <View style={[styles.ticket, round("xl")]}>
              <View style={styles.tkTitle}>
                {parts.length ? <Stamp label="Ajouté au voyage" tone="teal" icon="checkmark" large style={{ alignSelf: "flex-start" }} /> : <Stamp label="Déjà dans le voyage" tone="gold" large style={{ alignSelf: "flex-start" }} />}
                <Text style={[type.body, { color: THEME.inkMuted, paddingTop: 8 }]}>{parts.length ? parts.join(" · ") : "Cette réservation est déjà dans le voyage : rien à ajouter."}</Text>
              </View>
              <Perforation />
              <View style={styles.tkBtn}>
                <Button title={parts.length ? "Voir le voyage" : "Fermer"} size="lg" full onPress={close} />
              </View>
            </View>
          </View>
        </SafeAreaView>
      </TripInkContext.Provider>
    );
  }

  if (items) {
    const picked = items.filter((it) => it.include && (it.date || it.dayId)).length;
    const first = items[0];
    const kind = kindOf(first);
    const converted = needsRate;
    // what is to be looked at: a step with no day yet, the prices counted at a rate
    const toCheck = items.filter((it) => !it.date && !it.dayId).length + (converted && items.some((it) => it.price != null) ? 1 : 0);
    const sub = [first.address, first.type === "hotel" && first.nights ? plural(first.nights, "nuit") : null, items.length > 1 ? plural(items.length, "étape lue", "étapes lues") : null].filter(Boolean).join(" · ");
    const priceTextOf = (it) =>
      it.price == null ? null : formatMoney(it.price, "EUR") + (needsRate && rate ? ` · ≈ ${formatMoney(it.price * rate.rate, trip.currency)}` : "");
    return (
      <TripInkContext.Provider value={ink}>
        <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
          {top(() => setItems(null), "Retour à la lecture")}
          <ScrollView contentContainerStyle={MAIN} showsVerticalScrollIndicator={false}>
            <View style={styles.head}>
              <Stamp label={kind} tone={stepTone(first)} icon={stepIcon(first)} style={{ alignSelf: "flex-start" }} />
              <Text style={[type.display, { paddingTop: 6 }]} numberOfLines={3} accessibilityRole="header">{first.title}</Text>
              {sub ? <Text style={type.subhead}>{sub}</Text> : null}
            </View>

            {files.length ? (
              <View style={styles.fileCards}>
                {files.map((f) => (
                  <View key={f.uri} style={[styles.fileCard, round("lg")]}>
                    <View style={[styles.cardTile, { backgroundColor: TONES[f.kind === "pdf" ? "stamp" : "blue"].bg, width: 44, height: 44 }]}>
                      <Icon name={f.kind === "pdf" ? "document-text-outline" : "image-outline"} size={22} color={TONES[f.kind === "pdf" ? "stamp" : "blue"].fg} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={type.name} numberOfLines={1}>{f.name}</Text>
                      <Text style={type.subhead}>{`Lu à l'instant${toCheck ? ` · ${toCheck} point${toCheck > 1 ? "s" : ""} à vérifier` : ""}`}</Text>
                    </View>
                    <Stamp label="Lu" tone="teal" icon="checkmark" small tilt={0} decorative />
                  </View>
                ))}
              </View>
            ) : null}

            <Section title="Ce que j'ai lu" count={toCheck ? `${toCheck} à vérifier` : undefined}>
              <Text style={type.subhead}>Décochez ce qui ne va pas : seul ce qui est coché est ajouté. Vous pourrez tout modifier ensuite.</Text>
              {items.map((it, index) => (
                <ReadCard
                  key={index}
                  item={it}
                  trip={trip}
                  withHead={items.length > 1}
                  priceText={priceTextOf(it)}
                  converted={converted && it.price != null}
                  onToggle={() => patch(index, { include: !it.include })}
                  onDay={(dayId) => patch(index, { dayId, include: true })}
                />
              ))}
              {needsRate && items.some((it) => it.price != null) ? (
                <Text style={[type.caption, !rate && { color: THEME.stamp }]}>
                  {rate
                    ? `Prix lus en euros, comptés en ${trip.currency} dans le voyage (1 € = ${String(Math.round(rate.rate * 1000) / 1000).replace(".", ",")} ${trip.currency}).`
                    : `Taux de change indisponible : les prix en euros ne seront pas ajoutés, à saisir sur l'étape en ${trip.currency}.`}
                </Text>
              ) : null}
              {items.length > 1 && items[0].price != null ? <Text style={type.caption}>Le prix total de la réservation est mis sur la première étape.</Text> : null}
            </Section>

            {files.length ? (
              <Group>
                <Row
                  icon="attach-outline"
                  tone="teal"
                  title="Garder l'original dans Documents"
                  subtitle={files.length > 1 ? "Les fichiers rejoignent les documents du voyage (onglet Pratique)." : "Le fichier rejoint les documents du voyage (onglet Pratique)."}
                  right={<CheckBox checked={keepOriginal} />}
                  onPress={() => setKeepOriginal((v) => !v)}
                  accessibilityLabel={`Garder l'original dans Documents : ${keepOriginal ? "oui" : "non"}`}
                />
              </Group>
            ) : null}
            {error ? <Text style={[type.caption, { color: THEME.stamp }]}>{error}</Text> : null}
          </ScrollView>
          <View style={styles.dock}>
            <Button title="Corriger" variant="secondary" size="lg" style={{ flex: 1 }} onPress={() => setItems(null)} accessibilityLabel="Corriger : revenir au texte lu" />
            <Button
              title={!picked ? "Rien de coché" : picked === items.length ? "Tout est bon" : `Ajouter ${plural(picked, "étape")}`}
              size="lg"
              style={{ flex: 1.2 }}
              loading={busy}
              disabled={!picked}
              onPress={add}
            />
          </View>
        </SafeAreaView>
      </TripInkContext.Provider>
    );
  }

  return (
    <TripInkContext.Provider value={ink}>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          {top(close, "Annuler", "close")}
          <ScrollView contentContainerStyle={MAIN} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.head}>
              <Text style={type.display} accessibilityRole="header">Nouvelle réservation</Text>
              <Text style={type.subhead}>
                Collez le texte d'un mail ou d'un SMS, ou choisissez une capture d'écran ou un PDF : vol, train, bus, bateau, hôtel, restaurant ou billet. L'étape est créée sur le bon jour de « {trip.name} », avec l'heure, le prix et le code. Un hôtel devient un séjour.
              </Text>
            </View>
            <View style={styles.block}>
              <Field
                label="Confirmation"
                value={text}
                onChangeText={setText}
                placeholder={"Référence de réservation : K7QX2M\nAller - samedi 30 octobre 2027\nParis (CDG) 10:05 → Tokyo (HND) 06:30\nTotal payé : 1 284,50 €"}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                style={{ marginBottom: 0 }}
                inputStyle={styles.textBox}
              />
              <View style={styles.actions}>
                <Button title="Coller" icon="clipboard-outline" variant="secondary" size="sm" onPress={pasteFromClipboard} accessibilityLabel="Coller le texte copié" />
                <Button title="Capture" icon="image-outline" variant="secondary" size="sm" disabled={files.length >= MAX_FILES} onPress={chooseScreenshots} accessibilityLabel="Choisir une capture d'écran" />
                <Button title="PDF" icon="document-outline" variant="secondary" size="sm" disabled={files.length >= MAX_FILES} onPress={choosePdf} accessibilityLabel="Choisir un PDF" />
              </View>
              {files.length ? (
                <Group>
                  {files.map((f) => (
                    <Row
                      key={f.uri}
                      icon={f.kind === "pdf" ? "document-text-outline" : "image-outline"}
                      tone={f.kind === "pdf" ? "stamp" : "blue"}
                      title={f.name}
                      subtitle={f.kind === "pdf" ? "PDF" : "Capture d'écran"}
                      right={<TopButton icon="close" plain size={18} label={`Retirer ${f.name}`} onPress={() => setFiles((list) => list.filter((x) => x.uri !== f.uri))} />}
                    />
                  ))}
                </Group>
              ) : null}
              {error ? <Text style={[type.subhead, { color: THEME.stamp }]} accessibilityRole="alert">{error}</Text> : null}
            </View>
            <Section title="Ce que je sais lire">
              <Group>
                <Row icon="airplane-outline" tone="blue" title="Vol, train, bus et bateau" subtitle="Deux étapes par trajet : le départ et l'arrivée, avec leurs heures." accessibilityLabel="Vol, train, bus et bateau : deux étapes par trajet, le départ et l'arrivée avec leurs heures" />
                <Row icon="bed-outline" tone="stamp" title="Hôtel" subtitle="Devient un séjour : dates, nuits, adresse, prix total et code." accessibilityLabel="Hôtel : devient un séjour avec dates, nuits, adresse, prix total et code" />
                <Row icon="restaurant-outline" tone="gold" title="Restaurant ou billet" subtitle="Le jour, l'heure, l'adresse et le code." accessibilityLabel="Restaurant ou billet : le jour, l'heure, l'adresse et le code" />
              </Group>
              <Text style={type.caption}>
                La lecture se fait sur le téléphone, rien n'est envoyé. Les captures sont lues par la reconnaissance de texte du téléphone : plus elles sont nettes, meilleur est le résultat. Seuls les prix en euros sont lus.
              </Text>
            </Section>
          </ScrollView>
          <View style={styles.dock}>
            <Button title="Lire la réservation" icon="search-outline" size="lg" style={{ flex: 1 }} loading={busy} disabled={!text.trim() && !files.length} onPress={read} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </TripInkContext.Provider>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, justifyContent: "center", paddingHorizontal: layout.gutter },
  head: { gap: 6 },
  block: { gap: 14 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  textBox: { minHeight: 150, textAlignVertical: "top" },

  ticket: { backgroundColor: THEME.bgCard, overflow: "hidden", ...paperEdge() },
  tkTitle: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 18 },
  tkBtn: { paddingHorizontal: 22, paddingTop: 6, paddingBottom: 22 },

  fileCards: { gap: 10 },
  fileCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: THEME.bgCard, padding: 14, ...paperEdge() },
  card: { backgroundColor: THEME.bgCard, overflow: "hidden", ...paperEdge() },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  cardTile: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  fact: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 64 },
  factRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: THEME.hairStrong },
  factText: { flex: 1, minWidth: 0, gap: 3 },
  factLabel: { fontFamily: FONTS.bodyMed, fontSize: 14, lineHeight: 18, color: THEME.inkMuted },
  factValue: { fontFamily: FONTS.monoMed, fontSize: 17, lineHeight: 24, letterSpacing: -0.3, color: THEME.ink },
  factPlain: { fontFamily: FONTS.bodyMed, fontSize: 16, lineHeight: 22, color: THEME.ink },
  dayPick: { gap: 6, paddingHorizontal: 16, paddingVertical: 12 },
  chips: { gap: space.sm, paddingRight: space.lg },

  dock: { flexDirection: "row", gap: 12, paddingHorizontal: layout.gutter, paddingTop: 14, paddingBottom: 14, backgroundColor: THEME.bg, borderTopWidth: 1, borderTopColor: THEME.hairStrong },
}));
