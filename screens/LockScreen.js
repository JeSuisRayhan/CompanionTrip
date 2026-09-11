import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { THEME } from "../lib/theme";
import { FONTS } from "../lib/fonts";
import { checkPin } from "../lib/pin";

export default function LockScreen({ onUnlock }) {
  const [digits, setDigits] = useState("");
  const [error, setError] = useState(false);

  async function press(d) {
    if (digits.length >= 4) return;
    const next = digits + d;
    setDigits(next);
    setError(false);
    if (next.length === 4) {
      const ok = await checkPin(next);
      if (ok) {
        onUnlock();
      } else {
        setError(true);
        setTimeout(() => setDigits(""), 400);
      }
    }
  }

  function backspace() {
    setDigits((d) => d.slice(0, -1));
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <Ionicons name="lock-closed" size={28} color={THEME.gold} style={{ marginBottom: 16 }} />
        <Text style={styles.title}>Code de verrouillage</Text>
        <View style={styles.dots}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.dot, digits.length > i && styles.dotFilled, error && styles.dotError]} />
          ))}
        </View>
        <View style={styles.keypad}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <TouchableOpacity key={d} style={styles.key} onPress={() => press(d)}>
              <Text style={styles.keyText}>{d}</Text>
            </TouchableOpacity>
          ))}
          <View style={styles.key} />
          <TouchableOpacity style={styles.key} onPress={() => press("0")}>
            <Text style={styles.keyText}>0</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.key} onPress={backspace}>
            <Ionicons name="backspace-outline" size={20} color={THEME.inkMuted} />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { color: THEME.ink, fontSize: 16.5, marginBottom: 26, fontFamily: FONTS.headingSemiBold },
  dots: { flexDirection: "row", gap: 14, marginBottom: 40 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: THEME.border },
  dotFilled: { backgroundColor: THEME.gold, borderColor: THEME.gold },
  dotError: { backgroundColor: THEME.stamp, borderColor: THEME.stamp },
  keypad: { flexDirection: "row", flexWrap: "wrap", width: 260, justifyContent: "center" },
  key: { width: 78, height: 68, alignItems: "center", justifyContent: "center" },
  keyText: { fontSize: 26, color: THEME.ink, fontFamily: FONTS.headingRegular },
});
