import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "../components/Icon";
import { THEME, space, radius, type, themedStyles, paperEdge } from "../lib/theme";
import { checkPin } from "../lib/pin";
import { Txt } from "../components/ui";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

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
        <View style={styles.head}>
          <Icon name="lock-closed" size={28} color={THEME.inkMuted} />
          <Txt variant="title" style={styles.title} accessibilityRole="header">
            Code de verrouillage
          </Txt>
          <Txt variant="subhead" color={error ? "stamp" : "inkMuted"} style={styles.title} accessibilityLiveRegion="polite">
            {error ? "Code incorrect. Réessayez." : "Saisissez votre code à 4 chiffres."}
          </Txt>
        </View>

        <View style={styles.dots} accessible accessibilityLabel={`${digits.length} chiffre${digits.length > 1 ? "s" : ""} saisi${digits.length > 1 ? "s" : ""} sur 4`}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.dot, digits.length > i && styles.dotFilled, error && styles.dotError]} />
          ))}
        </View>

        <View style={styles.keypad}>
          {DIGITS.map((d) => (
            <Key key={d} label={d} onPress={() => press(d)} />
          ))}
          <View style={styles.key} />
          <Key label="0" onPress={() => press("0")} />
          <Key icon="backspace-outline" label="Effacer" onPress={backspace} bare />
        </View>
      </View>
    </SafeAreaView>
  );
}

// One round key of the pad: a digit, or an icon for the erase key (`bare` = no fill).
function Key({ label, icon, bare, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.key, !bare && styles.keyFilled, pressed && { backgroundColor: THEME.bgRaised }]}
    >
      {icon ? <Icon name={icon} size={24} color={THEME.inkMuted} /> : <Text style={type.title}>{label}</Text>}
    </Pressable>
  );
}

// Key diameter and pad width come from the spacing scale (48 + 24 = 72).
const KEY = space.xxxl + space.xl;

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xl },
  head: { alignItems: "center", gap: space.sm, marginBottom: space.xl },
  title: { textAlign: "center" },
  dots: { flexDirection: "row", gap: space.lg, marginBottom: space.xxl },
  dot: { width: space.lg, height: space.lg, borderRadius: radius.full, backgroundColor: THEME.light ? THEME.border : THEME.bgRaised },
  dotFilled: { backgroundColor: THEME.mark },
  dotError: { backgroundColor: THEME.stamp },
  keypad: { flexDirection: "row", flexWrap: "wrap", gap: space.lg, width: KEY * 3 + space.lg * 2 },
  key: { width: KEY, height: KEY, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  keyFilled: { backgroundColor: THEME.bgCard, ...paperEdge() },
}));
