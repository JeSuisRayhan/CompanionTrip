// A field where an amount is written, in the local currency or in the person's own: a small switch on the label's
// line says which. The amounts of a trip are kept in the local currency, so what is written in the other one is
// converted when it is saved (toLocalAmount); the field shows what it comes to in the other currency as it is typed.
import React, { useState, useCallback } from "react";
import { View, Text } from "react-native";
import { THEME, type, themedStyles } from "../lib/theme";
import { formatMoney, parseAmount, retypeAmount, currencySymbol } from "../lib/budget";
import { entryPref, rememberEntry } from "../lib/entryPref";
import { Field } from "./ui";
import CurrencySwitch from "./CurrencySwitch";

// The currency a money field is typed in ("local" | "home"), and how to change it. A new figure opens the way the
// last one was left (remembered on the phone); a figure already saved opens in the local currency, in which it is
// kept. `reopen(saved)` does the same again for a sheet that stays mounted.
export function useEntry(saved) {
  const [entry, setEntry] = useState(saved ? "local" : entryPref());
  const choose = useCallback((next) => {
    rememberEntry(next);
    setEntry(next);
  }, []);
  const reopen = useCallback((hasSaved) => setEntry(hasSaved ? "local" : entryPref()), []);
  return [entry, choose, reopen];
}

// money: moneyOf(trip) = { home, local, rate, different }; entry: "local" | "home".
export default function MoneyField({ label, money, entry, onEntryChange, value, onChangeText, hint, style, ...fieldProps }) {
  const m = money || { home: null, local: null, rate: 1, different: false }; // the trip is still being read
  const inHome = m.different && entry === "home";
  const code = inHome ? m.home : m.local;
  const typed = parseAmount(value);
  // what the figure typed comes to in the other currency
  let equivalent = null;
  if (m.different && typed != null && typed > 0) equivalent = inHome ? `≈ ${formatMoney(typed / m.rate, m.local)} au taux du voyage` : `≈ ${formatMoney(typed * m.rate, m.home)} au taux du voyage`;
  // turning the switch keeps the money the same: the figure typed is shown in the other currency
  const turn = (next) => {
    const current = inHome ? "home" : "local";
    if (next === current) return;
    const converted = retypeAmount(value, current, next, m.rate);
    if (converted !== value) onChangeText(converted);
    onEntryChange(next);
  };
  return (
    <View style={style}>
      <View style={styles.head}>
        <Text style={[type.caption, styles.label]} numberOfLines={2}>{label}</Text>
        {m.different ? <CurrencySwitch value={inHome ? "home" : "local"} onChange={turn} local={m.local} home={m.home} /> : null}
      </View>
      <Field
        accessibilityLabel={code ? `${label} (${code})` : label}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        inputStyle={type.numeral}
        right={code ? <Text style={type.numeralSmall}>{currencySymbol(code)}</Text> : undefined}
        hint={[equivalent, hint].filter(Boolean).join("\n") || undefined}
        {...fieldProps}
      />
    </View>
  );
}

const styles = themedStyles(() => ({
  head: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 6 },
  label: { flex: 1, color: THEME.inkMuted },
}));
