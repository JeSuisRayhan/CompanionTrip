// The phrases of a trip: tap one to show it in large type; add the basic ones of the country's language, or your own.
import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import Icon from "../components/Icon";
import { THEME, FONTS, space, type, themedStyles } from "../lib/theme";
import { getTrip, addPhrases, addPhrase, removePhrase } from "../lib/trips";
import { PHRASE_LANGUAGES, packFor, missingFromPack } from "../lib/phrases";
import { detectCountry } from "../lib/countries";
import { tripInk, TripInkContext } from "../lib/tripInk";
import { Button, IconButton, Group, Row, Field, Sheet, Txt, EmptyState } from "../components/ui";
import { TripTopBar, PageHead, Section, MAIN } from "../components/mix";

// A phrase of the trip: the French on the left (with how to say it), the translation big on the right.
export function PhraseRow({ phrase, onPress, right }) {
  const long = phrase.translation.length > 12;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${phrase.phrase}, ${phrase.translation}. Afficher en grand`}
      onPress={onPress}
      style={({ pressed }) => [styles.phrase, pressed && { backgroundColor: THEME.pressed }]}
    >
      <View style={styles.phraseLeft}>
        <Text style={type.name} numberOfLines={2}>{phrase.phrase}</Text>
        {phrase.reading ? <Text style={styles.reading} numberOfLines={1}>{phrase.reading}</Text> : null}
      </View>
      <Text style={[styles.translation, long && styles.translationLong]} numberOfLines={2}>{phrase.translation}</Text>
      {right}
    </Pressable>
  );
}

export default function PhrasesScreen({ route, navigation }) {
  const { tripId } = route.params;
  const [trip, setTrip] = useState(null);
  const [phrase, setPhrase] = useState("");
  const [translation, setTranslation] = useState("");
  const [packOpen, setPackOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => setTrip(await getTrip(tripId)), [tripId]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  if (!trip) return <SafeAreaView style={styles.safe} />;

  const phrases = trip.phrases || [];
  const country = detectCountry(trip);
  // the language of the country of the trip comes first in the list
  const suggested = country && country.phrases ? country.phrases : null;
  const languages = [...PHRASE_LANGUAGES].sort((a, b) => (a.key === suggested ? -1 : 0) - (b.key === suggested ? -1 : 0));

  async function add() {
    if (!phrase.trim() || !translation.trim()) return;
    await addPhrase(trip.id, phrase, translation);
    setPhrase("");
    setTranslation("");
    load();
  }
  async function addPack(lang) {
    setPackOpen(false);
    const n = await addPhrases(trip.id, packFor(lang.key));
    setNotice(n > 0 ? `${n} phrase${n > 1 ? "s" : ""} ajoutée${n > 1 ? "s" : ""} (${lang.label.toLowerCase()})` : "Ces phrases sont déjà dans la liste");
    load();
  }
  const show = (index) => navigation.navigate("ShowPhrase", { phrases: phrases.map((p) => ({ phrase: p.phrase, translation: p.translation, reading: p.reading || null })), index });

  return (
    <TripInkContext.Provider value={tripInk(trip)}>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <TripTopBar name={trip.name} onBack={() => navigation.goBack()} backLabel="Retour au voyage" />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={MAIN} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <PageHead title="Phrases" sub={phrases.length ? "Touchez une phrase pour l'afficher en grand." : "Les phrases qui sauvent, à montrer ou à lire."} />
            {phrases.length === 0 ? (
              <EmptyState icon="chatbubbles-outline" title="Aucune phrase" text="« Où sont les toilettes ? », « c'est trop épicé »…" action={{ label: "Ajouter les phrases de base", icon: "sparkles-outline", onPress: () => setPackOpen(true) }} />
            ) : (
              <Group>
                {phrases.map((p, i) => (
                  <PhraseRow
                    key={p.id}
                    phrase={p}
                    onPress={() => show(i)}
                    right={
                      <IconButton
                        icon="trash-outline"
                        label={`Supprimer ${p.phrase}`}
                        size={18}
                        onPress={async () => {
                          await removePhrase(trip.id, p.id);
                          load();
                        }}
                      />
                    }
                  />
                ))}
              </Group>
            )}
            {notice ? <Text style={[type.caption, { color: THEME.teal }]} accessibilityLiveRegion="polite">{notice}</Text> : null}
            {phrases.length > 0 ? <Button title="Ajouter les phrases de base" icon="sparkles-outline" variant="secondary" full onPress={() => setPackOpen(true)} /> : null}
            <Section title="Ajouter une phrase">
              <Field label="En français" value={phrase} onChangeText={setPhrase} placeholder="Où sont les toilettes ?" style={{ marginBottom: 0 }} />
              <Field label="Traduction" value={translation} onChangeText={setTranslation} placeholder="Where is the toilet?" style={{ marginBottom: 0 }} />
              <Button title="Ajouter" icon="add" disabled={!phrase.trim() || !translation.trim()} onPress={add} full />
            </Section>
          </ScrollView>
        </KeyboardAvoidingView>

        <Sheet visible={packOpen} onClose={() => setPackOpen(false)} title="Phrases de base">
          <Txt variant="subhead" style={{ marginBottom: space.lg }}>
            Quinze phrases utiles (bonjour, merci, l'addition, un médecin…) dans la langue du voyage. Celles déjà dans la liste ne sont pas ajoutées deux fois.
          </Txt>
          <Group style={{ marginBottom: space.md }}>
            {languages.map((l) => {
              const left = missingFromPack(trip, l.key).length;
              const hello = packFor(l.key)[0];
              const forCountry = l.key === suggested ? `Pour ${country.name}` : null;
              return (
                <Row
                  key={l.key}
                  icon="language-outline"
                  tone="neutral"
                  title={l.label}
                  subtitle={left === 0 ? "Déjà toutes dans la liste" : [forCountry, hello ? hello.translation : null].filter(Boolean).join(" · ") || undefined}
                  chevron={left > 0}
                  onPress={left > 0 ? () => addPack(l) : undefined}
                  accessibilityLabel={left === 0 ? `${l.label}, déjà toutes dans la liste` : `Ajouter les phrases de base en ${l.label.toLowerCase()}`}
                />
              );
            })}
          </Group>
        </Sheet>
      </SafeAreaView>
    </TripInkContext.Provider>
  );
}

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  phrase: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 68, paddingHorizontal: space.lg, paddingVertical: 12 },
  phraseLeft: { flex: 1, gap: 2 },
  reading: { ...type.subhead, fontStyle: "italic" },
  translation: { maxWidth: "48%", flexShrink: 1, textAlign: "right", fontFamily: FONTS.head, fontSize: 26, lineHeight: 34, color: THEME.ink },
  translationLong: { fontSize: 18, lineHeight: 24, fontFamily: FONTS.headSemi },
}));
