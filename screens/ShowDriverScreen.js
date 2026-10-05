import React from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "../components/Icon";

import { bigTextSize } from "../lib/driverCard";

// Held out to a taxi driver in daylight: black on white, whatever the app's palette is.
const PAPER = "#FFFFFF";
const INK = "#111111";
const SOFT = "#5B5B5B";

export default function ShowDriverScreen({ route, navigation }) {
  const { name, address, local } = route.params || {};
  const main = local || address || "";
  const secondary = local && address ? address : "";
  const close = () => navigation.goBack();
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.top}>
        <Text style={styles.caption}>Adresse à montrer</Text>
        <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fermer" style={styles.close}>
          <Icon name="close" size={26} color={INK} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {name ? <Text style={styles.name} accessibilityRole="header">{name}</Text> : null}
        <Text selectable style={[styles.main, { fontSize: bigTextSize(main), lineHeight: Math.round(bigTextSize(main) * 1.25) }]}>
          {main}
        </Text>
        {secondary ? <Text selectable style={styles.secondary}>{secondary}</Text> : null}
      </ScrollView>
      <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Fermer" style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]}>
        <Text style={styles.buttonText}>Fermer</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PAPER },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 8, minHeight: 52 },
  caption: { fontSize: 14, color: SOFT },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -10 },
  body: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 24, gap: 20 },
  name: { fontSize: 22, lineHeight: 28, color: SOFT, fontWeight: "600" },
  main: { color: INK, fontWeight: "700" },
  secondary: { fontSize: 22, lineHeight: 30, color: SOFT },
  button: { margin: 20, minHeight: 56, borderRadius: 14, backgroundColor: INK, alignItems: "center", justifyContent: "center" },
  buttonText: { color: PAPER, fontSize: 18, fontWeight: "600" },
});
