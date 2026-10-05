import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "../components/Icon";

import { bigTextSize } from "../lib/driverCard";

// Held out to someone: black on white, whatever the app's palette is (same as the address shown to a driver).
const PAPER = "#FFFFFF";
const INK = "#111111";
const SOFT = "#5B5B5B";

// A phrase of the trip in large type, to show or to read aloud. The arrows go through the other phrases.
// params: { phrases: [{ phrase, translation, reading? }], index }
export default function ShowPhraseScreen({ route, navigation }) {
  const { phrases = [], index: start = 0 } = route.params || {};
  const [index, setIndex] = useState(Math.min(Math.max(start, 0), Math.max(phrases.length - 1, 0)));
  const current = phrases[index];
  const close = () => navigation.goBack();
  if (!current) return null;
  const size = bigTextSize(current.translation);
  const many = phrases.length > 1;
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.top}>
        <Text style={styles.caption}>{many ? `Phrase ${index + 1} sur ${phrases.length}` : "Phrase à montrer"}</Text>
        <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fermer" style={styles.close}>
          <Icon name="close" size={26} color={INK} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text selectable style={[styles.main, { fontSize: size + 8, lineHeight: Math.round((size + 8) * 1.25) }]} accessibilityRole="header">
          {current.translation}
        </Text>
        {current.reading ? <Text selectable style={styles.reading}>{current.reading}</Text> : null}
        <Text style={styles.french}>{current.phrase}</Text>
      </ScrollView>
      <View style={styles.bar}>
        {many ? (
          <Pressable
            onPress={() => setIndex((i) => (i - 1 + phrases.length) % phrases.length)}
            accessibilityRole="button"
            accessibilityLabel="Phrase précédente"
            style={({ pressed }) => [styles.arrow, pressed && { opacity: 0.7 }]}
          >
            <Icon name="chevron-back" size={26} color={INK} />
          </Pressable>
        ) : null}
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Fermer" style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]}>
          <Text style={styles.buttonText}>Fermer</Text>
        </Pressable>
        {many ? (
          <Pressable
            onPress={() => setIndex((i) => (i + 1) % phrases.length)}
            accessibilityRole="button"
            accessibilityLabel="Phrase suivante"
            style={({ pressed }) => [styles.arrow, pressed && { opacity: 0.7 }]}
          >
            <Icon name="chevron-forward" size={26} color={INK} />
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PAPER },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 8, minHeight: 52 },
  caption: { fontSize: 14, color: SOFT },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -10 },
  body: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 24, gap: 20 },
  main: { color: INK, fontWeight: "700" },
  reading: { fontSize: 26, lineHeight: 34, color: SOFT },
  french: { fontSize: 18, lineHeight: 26, color: SOFT },
  bar: { flexDirection: "row", alignItems: "center", gap: 12, margin: 20 },
  arrow: { width: 56, height: 56, borderRadius: 14, borderWidth: 1.5, borderColor: INK, alignItems: "center", justifyContent: "center" },
  button: { flex: 1, minHeight: 56, borderRadius: 14, backgroundColor: INK, alignItems: "center", justifyContent: "center" },
  buttonText: { color: PAPER, fontSize: 18, fontWeight: "600" },
});
