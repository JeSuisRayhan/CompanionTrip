// "Montrer au chauffeur": the address of a step in big black letters, held out to a taxi driver in daylight. White paper
// and black ink whatever the palette of the app is, so nothing here reads the theme.
import React from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Line } from "react-native-svg";
import Icon from "../components/Icon";

import { bigTextSize } from "../lib/driverCard";
import { FONTS } from "../lib/theme";

const PAPER = "#FFFFFF";
const INK = "#111111";
const SOFT = "#5B5B5B";
const EDGE = "#D8D8D8";

// Written right to left (Arabic, Hebrew), or in a script the fonts of the app do not have (the phone brings its own)
const RTL = /[֐-ࣿ]/;
const NOT_LATIN = /[Ͱ-￿]/;

export default function ShowDriverScreen({ route, navigation }) {
  const { name, address, local } = route.params || {};
  const main = local || address || "";
  const secondary = local && address ? address : "";
  const rtl = RTL.test(main);
  const size = bigTextSize(main);
  const close = () => navigation.goBack();
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.top}>
        <View style={styles.tag} accessible accessibilityLabel="Adresse à montrer">
          <View style={styles.tagInner}>
            <Icon name="map-outline" size={13} color={INK} />
            <Text style={styles.tagText}>Adresse à montrer</Text>
          </View>
        </View>
        <Pressable onPress={close} hitSlop={8} accessibilityRole="button" accessibilityLabel="Fermer" style={({ pressed }) => [styles.close, pressed && { opacity: 0.7 }]}>
          <Icon name="close" size={24} color={INK} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.cardOuter}>
          <View style={styles.cardInner}>
            {name ? <Text style={styles.name} accessibilityRole="header">{name}</Text> : null}
            <Text
              selectable
              style={[
                styles.main,
                NOT_LATIN.test(main) ? { fontWeight: "700" } : { fontFamily: FONTS.head },
                { fontSize: size, lineHeight: Math.round(size * 1.35), textAlign: rtl ? "right" : "left", writingDirection: rtl ? "rtl" : "ltr" },
              ]}
            >
              {main}
            </Text>
            {secondary ? (
              <>
                <Svg height={2} width="100%" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Line x1="0" y1="1" x2="100%" y2="1" stroke={INK} strokeWidth={1.5} strokeDasharray="6 5" />
                </Svg>
                <Text selectable style={styles.secondary}>{secondary}</Text>
              </>
            ) : null}
          </View>
        </View>
        <Text style={styles.hint}>{rtl ? "Montrez l'écran au chauffeur, il lit l'arabe." : "Montrez l'écran au chauffeur."}</Text>
      </ScrollView>

      <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Fermer" style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}>
        <Text style={styles.buttonText}>Fermer</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PAPER },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 8, minHeight: 56 },
  // the stamp: a double edge, like the ones of the trip, in black
  tag: { borderWidth: 2, borderColor: INK, borderRadius: 7, padding: 2, backgroundColor: PAPER },
  tagInner: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: INK, borderRadius: 4, paddingVertical: 3, paddingHorizontal: 8 },
  tagText: { fontFamily: FONTS.bodySemi, fontSize: 12, lineHeight: 16, letterSpacing: 1.1, textTransform: "uppercase", color: INK },
  close: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: PAPER, borderWidth: 1, borderColor: EDGE },
  body: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 20, paddingVertical: 24, gap: 16 },
  cardOuter: { borderWidth: 2, borderColor: INK, borderRadius: 22, padding: 4 },
  cardInner: { borderWidth: 1.5, borderColor: INK, borderRadius: 18, paddingHorizontal: 20, paddingVertical: 20, gap: 16 },
  name: { fontFamily: FONTS.headSemi, fontSize: 22, lineHeight: 28, color: SOFT },
  main: { color: INK, letterSpacing: -0.3 },
  secondary: { fontFamily: FONTS.head, fontSize: 30, lineHeight: 36, letterSpacing: -0.3, color: INK },
  hint: { fontFamily: FONTS.bodyMed, fontSize: 14, lineHeight: 20, color: SOFT, textAlign: "center" },
  button: { marginHorizontal: 20, marginBottom: 20, minHeight: 58, borderRadius: 14, backgroundColor: INK, alignItems: "center", justifyContent: "center" },
  buttonText: { fontFamily: FONTS.head, color: PAPER, fontSize: 19, lineHeight: 24 },
});
