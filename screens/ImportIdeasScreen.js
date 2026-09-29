import React, { useState, useEffect, useRef } from "react";
import { View, Text, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";

import { THEME, TONES, space, layout, type } from "../lib/theme";
import { getTrip } from "../lib/trips";
import { getSetting } from "../lib/storage";
import { DEFAULT_IDEA_CATEGORIES } from "../lib/ideas";
import { analyzeInput, markDuplicates, locatePlaces, addImportedIdeas, SOURCE_LABELS } from "../lib/importIdeas";
import { Txt, Button, Badge, Group, Row, Field, EmptyState, ModalHeader, ProgressBar } from "../components/ui";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;
const categoryOf = (id) => DEFAULT_IDEA_CATEGORIES.find((c) => c.id === id) || DEFAULT_IDEA_CATEGORIES[1];
const toneOfCategory = (cat) => Object.keys(TONES).find((k) => TONES[k].fg === cat.color) || "neutral";

// "Construire mon voyage", phase 3: fill the notebook from a link or a text.
// Steps: paste -> tick what is right -> added with positions.
export default function ImportIdeasScreen({ route, navigation }) {
  const { tripId } = route.params;
  const [trip, setTrip] = useState(null);
  const [hasKey, setHasKey] = useState(false);
  const [stage, setStage] = useState("input"); // input | review | saving | done
  const [text, setText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { places, links, usedAI, aiError }
  const [progress, setProgress] = useState({ i: 0, n: 0, name: "" });
  const [done, setDone] = useState(null); // { count, missing }
  const stopRef = useRef(false);

  useEffect(() => {
    (async () => {
      setTrip(await getTrip(tripId));
      setHasKey(!!(await getSetting("anthropicApiKey")));
    })();
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

  async function analyze() {
    setAnalyzing(true);
    setError("");
    try {
      const key = await getSetting("anthropicApiKey");
      const res = await analyzeInput(text, { apiKey: key });
      const places = markDuplicates(res.places, trip).map((p, i) => ({ ...p, key: String(i), checked: !p.duplicate }));
      setResult({ ...res, places });
      setStage("review");
    } catch (e) {
      setError(e.message || "L'analyse a échoué.");
    } finally {
      setAnalyzing(false);
    }
  }

  function toggle(key) {
    setResult((r) => ({ ...r, places: r.places.map((p) => (p.key === key ? { ...p, checked: !p.checked } : p)) }));
  }

  function setAll(checked) {
    setResult((r) => ({ ...r, places: r.places.map((p) => ({ ...p, checked })) }));
  }

  async function addSelected() {
    const picked = result.places.filter((p) => p.checked);
    stopRef.current = false;
    setProgress({ i: 0, n: picked.length, name: picked[0] ? picked[0].name : "" });
    setStage("saving");
    const located = await locatePlaces(picked, trip, {
      onProgress: (i, n) => setProgress({ i, n, name: picked[i] ? picked[i].name : "" }),
      shouldStop: () => stopRef.current,
    });
    const created = await addImportedIdeas(tripId, located.places);
    setDone({ count: created.length, missing: located.missing });
    setStage("done");
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

  if (stage === "done") {
    return (
      <SafeAreaView style={styles.safe}>
        <ModalHeader title="Importer des idées" />
        <View style={styles.center}>
          <EmptyState
            icon="checkmark-circle-outline"
            tone="teal"
            title={`${plural(done.count, "idée ajoutée", "idées ajoutées")}`}
            text={
              done.missing > 0
                ? `${plural(done.missing, "n'a", "n'ont")} pas de position (lieu introuvable ou recherche interrompue). Ouvrez-les depuis le carnet pour lancer « Trouver sur la carte ».`
                : "Elles ont toutes une position : le planning pourra tenir compte des distances."
            }
            action={{ label: "Voir mon carnet", onPress: close }}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (stage === "saving") {
    const pct = progress.n ? progress.i / progress.n : 0;
    return (
      <SafeAreaView style={styles.safe}>
        <ModalHeader title="Importer des idées" />
        <View style={styles.center}>
          <Txt variant="heading" style={styles.centerText}>
            Recherche des positions
          </Txt>
          <Txt variant="subhead" style={[styles.centerText, styles.savingLine]} numberOfLines={1}>
            {progress.i < progress.n ? `${progress.i + 1} sur ${progress.n} : ${progress.name}` : "Enregistrement…"}
          </Txt>
          <ProgressBar value={pct} tone="gold" height={6} style={styles.savingBar} />
          <Txt variant="caption" color="inkFaint" style={styles.centerText}>
            Une recherche par seconde, comme l'exige OpenStreetMap.
          </Txt>
          <Button title="Passer la recherche des positions" variant="secondary" size="sm" style={styles.skip} onPress={() => (stopRef.current = true)} />
        </View>
      </SafeAreaView>
    );
  }

  if (stage === "review") {
    const { places, links } = result;
    const picked = places.filter((p) => p.checked).length;
    const linkErrors = links.filter((l) => l.error);
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <ModalHeader title="Lieux trouvés" left={{ label: "Annuler", onPress: close }} />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {linkErrors.length > 0 && (
            <Group style={styles.warnings}>
              {linkErrors.map((l) => (
                <Row key={l.url} icon="warning-outline" tone="stamp" title={SOURCE_LABELS[l.source] || "Lien"} subtitle={l.error} accessibilityLabel={`Lien non lu (${l.url}) : ${l.error}`} />
              ))}
            </Group>
          )}
          {result.aiError ? (
            <Txt variant="caption" color="inkFaint" style={styles.note}>
              {`L'IA n'a pas répondu (${result.aiError}). La liste ci-dessous vient d'une lecture simple du texte.`}
            </Txt>
          ) : null}

          {places.length === 0 ? (
            <EmptyState
              icon="search-outline"
              tone="gold"
              title="Aucun lieu reconnu"
              text={
                hasKey
                  ? "Écrivez un lieu par ligne, ou collez la description complète de la vidéo."
                  : "Écrivez un lieu par ligne (ou avec 📍 devant chaque lieu). Pour lire un texte libre, enregistrez une clé API dans les réglages."
              }
              action={{ label: "Modifier le texte", onPress: () => setStage("input") }}
            />
          ) : (
            <>
              <View style={styles.summary}>
                <Txt variant="label">{`${plural(places.length, "lieu trouvé", "lieux trouvés")}`}</Txt>
                <Button title={picked === places.length ? "Tout décocher" : "Tout cocher"} variant="ghost" size="sm" onPress={() => setAll(picked !== places.length)} />
              </View>
              <Txt variant="subhead" style={[styles.note, styles.noteAbove]}>
                Décochez ce qui n'est pas un lieu. Vous pourrez tout modifier ensuite dans le carnet.
              </Txt>
              <Group>
                {places.map((p) => {
                  const cat = categoryOf(p.categoryId);
                  const subtitle = [p.city, p.sourceLabel].filter(Boolean).join(" · ");
                  return (
                    <Row
                      key={p.key}
                      lead={<Ionicons name={p.checked ? "checkbox" : "square-outline"} size={26} color={p.checked ? THEME.gold : THEME.inkFaint} />}
                      title={p.name}
                      subtitle={subtitle || undefined}
                      selected={p.checked}
                      accessibilityLabel={`${p.name}, ${cat.label}${p.duplicate ? ", déjà dans le carnet" : ""}, ${p.checked ? "coché" : "décoché"}`}
                      onPress={() => toggle(p.key)}
                      right={p.duplicate ? <Badge label="Déjà noté" tone="neutral" /> : null}
                    >
                      <View style={styles.metaItem}>
                        <Ionicons name={cat.icon} size={12} color={TONES[toneOfCategory(cat)].fg} />
                        <Text style={type.caption}>{cat.label}</Text>
                      </View>
                    </Row>
                  );
                })}
              </Group>
            </>
          )}
        </ScrollView>
        {places.length > 0 && (
          <View style={styles.footer}>
            <Button title={picked ? `Ajouter ${plural(picked, "idée")}` : "Rien de coché"} icon="add" full disabled={picked === 0} onPress={addSelected} />
            <Button title="Modifier le texte" variant="ghost" full onPress={() => setStage("input")} style={styles.footerGhost} />
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ModalHeader title="Importer des idées" left={{ label: "Annuler", onPress: close }} />
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Txt variant="subhead" style={styles.intro}>
            Collez un lien TikTok ou YouTube, la description d'une vidéo, ou une liste de lieux (un par ligne). Vous choisirez ensuite ce qui est ajouté.
          </Txt>
          <Field
            label="Lien ou texte"
            value={text}
            onChangeText={setText}
            placeholder={"https://vm.tiktok.com/…\nou\nFushimi Inari\nKiyomizu-dera\nGion"}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            error={error || undefined}
          />
          <Button title="Coller" icon="clipboard-outline" variant="secondary" size="sm" style={styles.paste} onPress={pasteFromClipboard} />
          <Group style={styles.help}>
            <Row icon="logo-tiktok" title="TikTok" subtitle="Le lien suffit : la légende de la vidéo est lue." accessibilityLabel="TikTok : le lien suffit, la légende de la vidéo est lue" />
            <Row icon="logo-youtube" tone="stamp" title="YouTube" subtitle="Seul le titre est lisible : collez aussi la description de la vidéo." accessibilityLabel="YouTube : seul le titre est lisible, collez aussi la description" />
            <Row icon="logo-instagram" tone="pink" title="Instagram" subtitle="Collez la description, le lien ne peut pas être lu." accessibilityLabel="Instagram : collez la description, le lien ne peut pas être lu" />
          </Group>
          <Txt variant="caption" color="inkFaint" style={styles.note}>
            {hasKey
              ? "Les textes en phrases sont lus par l'IA (votre clé API, enregistrée dans les réglages)."
              : "Pour lire un texte en phrases, enregistrez une clé API dans les réglages. Sans elle, une liste (un lieu par ligne, ou 📍 devant chaque lieu) fonctionne très bien."}
          </Txt>
        </ScrollView>
        <View style={styles.footer}>
          <Button title="Analyser" icon="search" full loading={analyzing} disabled={!text.trim()} onPress={analyze} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: layout.gutter },
  centerText: { textAlign: "center" },
  scrollContent: { padding: layout.gutter, paddingBottom: space.xxl },
  intro: { marginBottom: space.lg },
  paste: { alignSelf: "flex-start" },
  help: { marginTop: space.xl },
  note: { marginTop: space.md },
  noteAbove: { marginBottom: space.md },
  warnings: { marginBottom: space.md },
  summary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  metaItem: { flexDirection: "row", alignItems: "center", gap: space.xs + 2, marginTop: space.xs },
  savingLine: { marginTop: space.sm },
  savingBar: { alignSelf: "stretch", marginVertical: space.lg },
  skip: { marginTop: space.xl },
  footer: { paddingHorizontal: layout.gutter, paddingTop: space.md, paddingBottom: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: THEME.hairStrong, backgroundColor: THEME.bg },
  footerGhost: { marginTop: space.xs },
});
