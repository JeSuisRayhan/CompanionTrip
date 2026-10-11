import React from "react";
import { View, Pressable } from "react-native";
import Icon from "./Icon";

import { THEME, space, themedStyles } from "../lib/theme";
import { CURRENCY_PRESETS } from "../lib/constants";
import { Group, Row, Field, Sheet } from "./ui";

// "Dinar tunisien (TND)" for a known code, the code itself otherwise.
export const currencyLabel = (code) => CURRENCY_PRESETS.find((c) => c.code === code)?.label || code;

// A read-only Field that opens a picker: same look as its sibling inputs.
export function PickerField({ label, value, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} : ${value}`}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Field label={label} value={value} editable={false} right={<Icon name="chevron-down" size={18} color={THEME.inkMuted} />} />
      </View>
    </Pressable>
  );
}

export function CurrencyPickerModal({ visible, selected, onClose, onSelect }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Choisir une devise">
      <Group style={styles.currencyList}>
        {CURRENCY_PRESETS.map((item) => (
          <Row
            key={item.code}
            title={item.label}
            selected={item.code === selected}
            right={item.code === selected ? <Icon name="checkmark" size={20} color={THEME.mark} /> : null}
            onPress={() => onSelect(item.code)}
          />
        ))}
      </Group>
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  pressed: { opacity: 0.8 },
  currencyList: { marginBottom: space.md },
}));
