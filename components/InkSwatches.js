// The six inks a trip can wear, as round swatches; the chosen one is ringed. Used when a trip is created and in its settings.
import React from "react";
import { View, Pressable } from "react-native";
import { THEME, INK_NAMES, themedStyles } from "../lib/theme";

export const INK_LABELS = { teal: "Vert-bleu", blue: "Bleu", stamp: "Rouge tampon", violet: "Violet", nature: "Vert", pink: "Rose" };

export function InkSwatches({ value, onChange }) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {INK_NAMES.map((name) => {
        const on = name === value;
        return (
          <Pressable
            key={name}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`Encre ${INK_LABELS[name].toLowerCase()}`}
            onPress={() => onChange(name)}
            style={({ pressed }) => [styles.swatch, pressed && { opacity: 0.75 }]}
          >
            <View style={[styles.ring, on && { borderColor: THEME.ink }]} />
            <View style={[styles.dot, { backgroundColor: THEME[name] }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: "row", justifyContent: "space-between" },
  swatch: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, borderRadius: 28, borderWidth: 2, borderColor: "transparent" },
  dot: { width: 46, height: 46, borderRadius: 23 },
}));
