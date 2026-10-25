import React, { useState, useEffect, useRef } from "react";
import { View, Text, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "../components/Icon";
import * as Clipboard from "expo-clipboard";

import { THEME, TONES, space, layout, type, themedStyles } from "../lib/theme";
import { getTrip } from "../lib/trips";
import { DEFAULT_IDEA_CATEGORIES } from "../lib/ideas";
import { analyzeInput, markDuplicates, locatePlaces, addImportedIdeas, extractUrls, sourceOf, SOURCE_LABELS } from "../lib/importIdeas";
import { Txt, Button, Badge, Group, Row, Field, EmptyState, ModalHeader, ProgressBar } from "../components/ui";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;
const categoryOf = (id) => DEFAULT_IDEA_CATEGORIES.find((c) => c.id === id) || DEFAULT_IDEA_CATEGORIES[1];
const toneOfCategory = (cat) => Object.keys(TONES).find((k) => TONES[k].fg === cat.color) || "neutral";
const isVideoLink = (url) => sourceOf(url) === "tiktok" || sourceOf(url) === "youtube";
// What is copied, trimmed ("" when nothing is copied or the clipboard cannot be read).
async function readClipboard() {
  const raw = await Clipboard.getStringAsync();
  return typeof raw === "string" ? raw.trim() : "";
}

// "Construire mon voyage", phase 3: fill the notebook from a link or a text.
// Steps: paste -> (reading of the link) -> tick what is right -> added with positions.
// Opened from the Programme with `autoPaste`: the copied video link is pasted and read at once.
// Opened by sharing a video to the app (`initialText`): it is read at once too.
export default function ImportIdeasScreen({ route, navigation }) {
  const { tripId, initialText, autoPaste } = route.params; // initialText: what another app shared
  const [trip, setTrip] = useState(null);
  const [stage, setStage] = useState("input"); // input | reading | review | saving | done
  const [text, setText] = useState(initialText || "");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState(null); // { places, links }
  const [progress, setProgress] = useState({ i: 0, n: 0, name: "" });
  const [done, setDone] = useState(null); // { count, missing }
  const stopRef = useRef(false);
  const runRef = useRef(0); // which analysis is the current one (a cancelled one is ignored)
  const startedRef = useRef(false);

  useEffect(() => {
    (async () => {
      setTrip(await getTrip(tripId));
    })();
  }, [tripId]);

  const close = () => navigation.goBack();

  // Adds the copied text to the field (a link, then the description of the video, say).
  async function pasteFromClipboard() {
    setNotice("");
    try {
      const clip = await readClipboard();
      if (clip) setText((prev) => (prev.trim() ? `${prev.trim()}\n${clip}` : clip));
      else setNotice("Rien n'est copié pour l'instant.");
    } catch {
      // clipboard unavailable — the field can still be typed into
    }
  }

  async function analyze(value) {
    const input = typeof value === "string" ? value : text;
    if (!input.trim() || !trip) return;
    const run = ++runRef.current;
    setError("");
    setNotice("");
    if (extractUrls(input).length) setStage("reading"); // a link is read on the network: it takes a few seconds
    setAnalyzing(true);
    try {
      const res = await analyzeInput(input);
      if (run !== runRef.current) return;
      const places = markDuplicates(res.places, trip).map((p, i) => ({ ...p, key: String(i), checked: !p.duplicate }));
      setResult({ ...res, places });
      setStage("review");
    } catch (e) {
      if (run !== runRef.current) return;
      setError(e.message || "L'analyse a échoué.");
      setStage("input");
    } finally {
      if (run === runRef.current) setAnalyzing(false);
    }
  }

  function cancelReading() {
    runRef.current += 1;
    setAnalyzing(false);
    setStage("input");
  }

  // From the Programme: the link that was just copied in TikTok or YouTube is pasted and read, nothing else is touched.
  async function pasteAndAnalyze() {
    try {
      const clip = await readClipboard();
      if (clip && extractUrls(clip).some(isVideoLink)) {
        setText(clip);
        analyze(clip);
      } else {
        setNotice("Aucun lien TikTok ou YouTube n'est copié. Dans la vidéo : Partager, Copier le lien. Puis touchez « Coller ».");
      }
    } catch {
      // clipboard unavailable — the field can still be typed into
    }
  }

  useEffect(() => {
    if (!trip || startedRef.current) return;
    startedRef.current = true;
    if (initialText && initialText.trim()) analyze(initialText);
    else if (autoPaste) pasteAndAnalyze();
  }, [trip]);

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

  // Back to the notebook: the page it was opened from when that is the notebook, else the notebook itself.
  function openNotebook() {
    const routes = navigation.getState().routes;
    const before = routes[routes.length - 2];
    if (before && before.name === "Ideas") navigation.goBack();
    else navigation.replace("Ideas", { tripId });
  }

  // Nothing could be read: the traveller writes the idea himself, with the link and the caption already in it.
  function createByHand() {
    const link = (result.links || []).find((l) => !l.error) || (result.links || [])[0];
    const note = link ? [link.title, link.caption].filter((t, i, all) => t && all.indexOf(t) === i).join("\n").slice(0, 280) : "";
    navigation.replace("IdeaEditor", { tripId, prefill: { sourceUrl: link ? link.url : "", note } });
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
            action={{ label: "Voir mes idées", onPress: openNotebook }}
          />
          <Button title="Fermer" variant="ghost" onPress={close} />
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

  if (stage === "reading") {
    return (
      <SafeAreaView style={styles.safe}>
        <ModalHeader title="Importer des idées" left={{ label: "Annuler", onPress: cancelReading }} />
        <View style={styles.center}>
          <ActivityIndicator color={THEME.mark} size="large" />
          <Txt variant="heading" style={[styles.centerText, styles.readingTitle]}>
            Lecture du lien…
          </Txt>
          <Txt variant="subhead" style={styles.centerText}>
            Titre, légende, description et adresses de la vidéo.
          </Txt>
          <Txt variant="caption" color="inkFaint" style={[styles.centerText, styles.readingNote]}>
            Cela peut prendre quelques secondes.
          </Txt>
        </View>
      </SafeAreaView>
    );
  }

  if (stage === "review") {
    const { places, links } = result;
    const picked = places.filter((p) => p.checked).length;
    const notices = links.filter((l) => l.error || l.warning);
    const partial = links.some((l) => l.partial);
    const sources = [...new Set(places.map((p) => p.sourceLabel).filter(Boolean))];
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <ModalHeader title="Lieux trouvés" left={{ label: "Annuler", onPress: close }} />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {notices.length > 0 && (
            <Group style={styles.warnings}>
              {notices.map((l) => {
                const message = l.error || l.warning;
                return (
                  <Row
                    key={l.url}
                    icon="warning-outline"
                    tone={l.error ? "stamp" : "gold"}
                    title={SOURCE_LABELS[l.source] || "Lien"}
                    subtitle={message}
                    subtitleLines={3}
                    chevron
                    onPress={() => setStage("input")}
                    accessibilityLabel={`${SOURCE_LABELS[l.source] || "Lien"} : ${message} Toucher pour modifier le texte.`}
                  />
                );
              })}
            </Group>
          )}

          {places.length === 0 ? (
            <>
              <EmptyState
                icon="search-outline"
                tone="gold"
                title="Aucun lieu reconnu"
                text={
                  partial
                    ? "Dans YouTube, ouvrez la description de la vidéo (« …plus »), copiez-la, puis collez-la à la suite du lien."
                    : "Collez la description complète de la vidéo, ou écrivez un lieu par ligne (avec son adresse si vous l'avez)."
                }
                action={{ label: "Modifier le texte", onPress: () => setStage("input") }}
              />
              <Button title="Créer l'idée à la main" icon="create-outline" variant="secondary" full style={styles.byHand} onPress={createByHand} />
            </>
          ) : (
            <>
              <View style={styles.summary}>
                <View style={styles.flex}>
                  <Txt variant="label">{`${plural(places.length, "lieu trouvé", "lieux trouvés")}`}</Txt>
                  {sources.length > 0 ? (
                    <Txt variant="caption" color="inkFaint" numberOfLines={2}>
                      {sources.join(" · ")}
                    </Txt>
                  ) : null}
                </View>
                <Button title={picked === places.length ? "Tout décocher" : "Tout cocher"} variant="ghost" size="sm" onPress={() => setAll(picked !== places.length)} />
              </View>
              <Txt variant="subhead" style={[styles.note, styles.noteAbove]}>
                Décochez ce qui n'est pas un lieu. Vous pourrez tout modifier ensuite dans le carnet.
              </Txt>
              <Group>
                {places.map((p) => {
                  const cat = categoryOf(p.categoryId);
                  const subtitle = p.address || p.city || "";
                  const located = Number.isFinite(p.lat) && Number.isFinite(p.lng);
                  return (
                    <Row
                      key={p.key}
                      lead={<Icon name={p.checked ? "checkbox" : "square-outline"} size={26} color={p.checked ? THEME.mark : THEME.inkFaint} />}
                      title={p.name}
                      subtitle={subtitle || undefined}
                      subtitleLines={3}
                      selected={p.checked}
                      accessibilityLabel={`${p.name}, ${cat.label}${p.address ? `, ${p.address}` : ""}${p.duplicate ? ", déjà dans le carnet" : ""}, ${p.checked ? "coché" : "décoché"}`}
                      onPress={() => toggle(p.key)}
                      right={p.duplicate ? <Badge label="Déjà noté" tone="neutral" /> : null}
                    >
                      <View style={styles.metaRow}>
                        <View style={styles.metaItem}>
                          <Icon name={cat.icon} size={12} color={TONES[toneOfCategory(cat)].fg} />
                          <Text style={type.caption}>{cat.label}</Text>
                        </View>
                        {located ? (
                          <View style={styles.metaItem}>
                            <Icon name="location" size={12} color={THEME.inkMuted} />
                            <Text style={type.caption}>Position connue</Text>
                          </View>
                        ) : null}
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
            Copiez le lien d'une vidéo TikTok ou YouTube, puis collez-le ici : les noms de lieux et leurs adresses sont lus pour vous. Vous choisirez ensuite ce qui est ajouté.
          </Txt>
          <Field
            label="Lien ou texte"
            value={text}
            onChangeText={(v) => {
              setText(v);
              if (notice) setNotice("");
            }}
            placeholder={"https://vm.tiktok.com/…\nou une liste : un lieu par ligne"}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            error={error || undefined}
            hint={notice || undefined}
          />
          <Button title="Coller" icon="clipboard-outline" variant="secondary" size="sm" style={styles.paste} onPress={pasteFromClipboard} />
          <Group style={styles.help}>
            <Row icon="logo-tiktok" title="TikTok" subtitle="Le lien suffit : la légende et le lieu indiqué sur la vidéo sont lus." accessibilityLabel="TikTok : le lien suffit, la légende et le lieu indiqué sur la vidéo sont lus" />
            <Row icon="logo-youtube" tone="stamp" title="YouTube" subtitle="Le lien suffit : la description est lue, adresses comprises." accessibilityLabel="YouTube : le lien suffit, la description est lue, adresses comprises" />
            <Row icon="logo-instagram" tone="pink" title="Instagram" subtitle="Le lien ne peut pas être lu : collez la description." accessibilityLabel="Instagram : le lien ne peut pas être lu, collez la description" />
          </Group>
          <Txt variant="caption" color="inkFaint" style={styles.note}>
            Si un lien ne peut pas être lu, collez plutôt sa description ou sa légende. Une adresse écrite à côté d'un nom (« Chez Paul, 12 rue des Martyrs, Paris ») sert à placer le lieu sur la carte. Une liste simple fonctionne aussi : un lieu par ligne.
          </Txt>
        </ScrollView>
        <View style={styles.footer}>
          <Button title="Analyser" icon="search" full loading={analyzing} disabled={!text.trim()} onPress={() => analyze()} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
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
  metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space.md, rowGap: space.xs, marginTop: space.xs },
  metaItem: { flexDirection: "row", alignItems: "center", gap: space.xs + 2 },
  readingTitle: { marginTop: space.lg },
  readingNote: { marginTop: space.md },
  byHand: { marginTop: space.lg },
  savingLine: { marginTop: space.sm },
  savingBar: { alignSelf: "stretch", marginVertical: space.lg },
  skip: { marginTop: space.xl },
  footer: { paddingHorizontal: layout.gutter, paddingTop: space.md, paddingBottom: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: THEME.hairStrong, backgroundColor: THEME.bg },
  footerGhost: { marginTop: space.xs },
}));
