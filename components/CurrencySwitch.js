// "€ / TND": the two money a trip is counted in, as a small switch. Put next to a field where an amount is written,
// it says which of the two the figure is in (the local one, or the person's own).
import React from "react";
import { View, Text, Pressable } from "react-native";
import { THEME, FONTS, themedStyles } from "../lib/theme";
import { currencySymbol, currencyName } from "../lib/budget";

// value: "local" | "home"; local / home: the currency codes.
export default function CurrencySwitch({ value, onChange, local, home, style }) {
  const options = [
    { key: "local", code: local },
    { key: "home", code: home },
  ];
  return (
    <View style={[styles.wrap, style]} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = value === o.key;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`Écrire en ${currencyName(o.code)}`}
            onPress={() => onChange(o.key)}
            hitSlop={{ top: 6, bottom: 6 }}
            style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && !on && { opacity: 0.7 }]}
          >
            <Text style={[styles.text, on && styles.textOn]} numberOfLines={1}>{currencySymbol(o.code)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: { flexDirection: "row", alignItems: "center", backgroundColor: THEME.surfaceSunk, borderRadius: 10, borderWidth: 1, borderColor: THEME.hairStrong, padding: 2 },
  option: { minWidth: 46, height: 30, paddingHorizontal: 10, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  optionOn: { backgroundColor: THEME.action },
  text: { fontFamily: FONTS.monoSemi, fontSize: 13, lineHeight: 17, color: THEME.inkMuted },
  textOn: { color: THEME.onAction },
}));
