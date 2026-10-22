// "Nouvelle dépense": the amount on the departure board, typed on a big keypad, then what and which kind.
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "../components/Icon";
import { THEME, TONES, FONTS, space, layout, type, shadow, themedStyles } from "../lib/theme";
import { getTrip, addExpense, updateExpense, removeExpense } from "../lib/trips";
import { isoDate } from "../lib/dates";
import { EXPENSE_CATEGORIES, expenseCategory, formatMoney, currencySymbol, currencyName, moneyOf, effectiveEntry, keptFromTyped, retypeAmount, typedText } from "../lib/budget";
import { tripInk, TripInkContext } from "../lib/tripInk";
import { Button, Field } from "../components/ui";
import { TopButton } from "../components/mix";
import CurrencySwitch from "../components/CurrencySwitch";
import { useEntry } from "../components/MoneyField";
import Flip, { Plate } from "../components/Flip";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "del"];
const MAX_LEN = 9;

// The amount typed so far, one key at a time: digits, one comma, two decimals at most.
export function pressKey(current, key) {
  if (key === "del") return current.slice(0, -1);
  if (key === ",") {
    if (current.includes(",")) return current;
    return current === "" ? "0," : current + ",";
  }
  if (current.length >= MAX_LEN) return current;
  const [, decimals] = current.split(",");
  if (decimals !== undefined && decimals.length >= 2) return current;
  if (current === "0") return key;
  return current + key;
}

export default function ExpenseScreen({ route, navigation }) {
  // `prefill` ({ label, category, amount, stepId }): an expense noted from a step of the programme
  const { tripId, expenseId, prefill } = route.params;
  const [trip, setTrip] = useState(null);
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("repas");
  // the currency the amount is typed in ("local" | "home"): the way it was left last time, or the local one for a figure already known
  const [entry, chooseEntry] = useEntry(!!expenseId || !!(prefill && prefill.amount > 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const t = await getTrip(tripId);
    setTrip(t);
    const e = expenseId ? (t.expenses || []).find((x) => x.id === expenseId) : null;
    if (e) {
      setAmount(typedText(e.amount));
      setLabel(e.label === "Dépense" ? "" : e.label);
      setCategory(expenseCategory(e));
    } else if (prefill) {
      if (prefill.label) setLabel(prefill.label);
      if (prefill.category) setCategory(prefill.category);
      if (prefill.amount > 0) setAmount(typedText(prefill.amount));
    }
  }, [tripId, expenseId]);
  useEffect(() => {
    load();
  }, [load]);

  if (!trip) return <SafeAreaView style={styles.safe} />;
  const ink = tripInk(trip);
  const money = moneyOf(trip);
  const { home, local, rate, different } = money;
  // The amount may be typed in the person's own currency: it is kept in the local one, like every amount of the trip.
  const typedIn = effectiveEntry(money, entry);
  const inHome = typedIn === "home";
  const typedCode = inHome ? home : local;
  const value = parseFloat(String(amount).replace(",", "."));
  const valid = value > 0;
  const keptAmount = valid ? keptFromTyped(amount, money, entry) : 0; // in the local currency
  // the tiles shrink as the figure grows, so it always fits on the plate with its currency
  const digitCount = (amount || "0").replace(",", "").length;
  const flipSize = digitCount <= 4 ? "lg" : digitCount <= 5 ? "md" : "sm";
  function switchEntry(next) {
    if (next === typedIn) return;
    setAmount((cur) => retypeAmount(cur, typedIn, next, rate)); // the money stays the same, shown in the other currency
    chooseEntry(next);
    setError("");
  }

  async function save() {
    if (!valid) {
      setError("Indiquez un montant.");
      return;
    }
    setBusy(true);
    try {
      if (expenseId) await updateExpense(trip.id, expenseId, { label, amount: keptAmount, category });
      else await addExpense(trip.id, { label, amount: keptAmount, category, date: isoDate(new Date()), stepId: prefill && prefill.stepId });
      navigation.goBack();
    } catch (e) {
      setError("Échec de l'enregistrement.");
      setBusy(false);
    }
  }
  function confirmDelete() {
    Alert.alert("Supprimer cette dépense ?", "Le budget sera recalculé.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          await removeExpense(trip.id, expenseId);
          navigation.goBack();
        },
      },
    ]);
  }

  return (
    <TripInkContext.Provider value={ink}>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.top}>
          <TopButton icon="close" label="Fermer sans enregistrer" onPress={() => navigation.goBack()} />
          <Text style={styles.title} numberOfLines={1} accessibilityRole="header">{expenseId ? "Modifier la dépense" : "Nouvelle dépense"}</Text>
          {expenseId ? <TopButton icon="trash-outline" label="Supprimer la dépense" plain onPress={confirmDelete} /> : null}
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {different ? (
              <View style={styles.entryRow}>
                <Text style={[type.subhead, { flex: 1 }]}>Je tape le montant en</Text>
                <CurrencySwitch value={inHome ? "home" : "local"} onChange={switchEntry} local={local} home={home} />
              </View>
            ) : null}
            <Plate cap={`Montant en ${currencyName(typedCode)}`} capRight={different ? `1 ${local} = ${(Math.round(rate * 10000) / 10000).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${currencySymbol(home)}` : undefined}>
              <View style={styles.amountRow}>
                <Flip value={amount || "0"} size={flipSize} tone={amount ? "trip" : "plain"} label={`${amount || "0"} ${typedCode}`} />
                <Text style={styles.code}>{currencySymbol(typedCode)}</Text>
              </View>
              {different ? <Text style={styles.plateLine}>≈ {formatMoney(inHome ? keptAmount : (valid ? value * rate : 0), inHome ? local : home)}</Text> : null}
            </Plate>
            {error ? <Text style={[type.caption, { color: THEME.stamp }]}>{error}</Text> : null}

            <Field label="Description · facultatif" value={label} onChangeText={setLabel} placeholder="Ex : ramen, taxi, souvenirs" style={{ marginBottom: 0 }} returnKeyType="done" />

            <View style={styles.cats} accessibilityRole="radiogroup">
              {EXPENSE_CATEGORIES.map((c) => {
                const on = category === c.key;
                return (
                  <Pressable
                    key={c.key}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={c.label}
                    onPress={() => setCategory(c.key)}
                    style={({ pressed }) => [styles.cat, on ? styles.catOn : null, pressed && { opacity: 0.8 }]}
                  >
                    <Icon name={c.icon} size={18} color={on ? THEME.onAction : TONES[c.tone].fg} />
                    <Text style={[styles.catLabel, { color: on ? THEME.onAction : THEME.ink }]} numberOfLines={1}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.keypad}>
              {KEYS.map((k) => (
                <Pressable
                  key={k}
                  accessibilityRole="button"
                  accessibilityLabel={k === "del" ? "Effacer" : k === "," ? "Virgule" : k}
                  onPress={() => {
                    setError("");
                    setAmount((cur) => pressKey(cur, k));
                  }}
                  onLongPress={k === "del" ? () => setAmount("") : undefined}
                  style={({ pressed }) => [styles.key, pressed && { backgroundColor: THEME.pressed, transform: [{ scale: 0.97 }] }]}
                >
                  {k === "del" ? <Icon name="backspace-outline" size={26} color={THEME.ink} /> : <Text style={styles.keyText}>{k}</Text>}
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
        <View style={styles.dock}>
          <Button title="Enregistrer" size="lg" full loading={busy} disabled={!valid} onPress={save} />
        </View>
      </SafeAreaView>
    </TripInkContext.Provider>
  );
}

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  top: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: layout.gutter, paddingTop: space.sm },
  title: { flex: 1, ...type.title, fontSize: 24, lineHeight: 28 },
  body: { paddingHorizontal: layout.gutter, paddingTop: 18, paddingBottom: 16, gap: 18 },
  entryRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: -4 },
  amountRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 14, minHeight: 80 },
  code: { fontFamily: FONTS.head, fontSize: 26, lineHeight: 30, color: THEME.plateInk },
  plateLine: { ...type.subhead, fontSize: 15, color: THEME.plateDim },
  cats: { flexDirection: "row", gap: 8 },
  cat: { flex: 1, minHeight: 66, borderRadius: 14, alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: THEME.bgCard, borderWidth: 1.5, borderColor: THEME.hairStrong },
  catOn: { backgroundColor: THEME.action, borderColor: THEME.action },
  catLabel: { fontFamily: FONTS.bodySemi, fontSize: 14, lineHeight: 16 },
  keypad: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  key: { width: "31.9%", flexGrow: 1, height: 58, borderRadius: 12, backgroundColor: THEME.bgCard, borderWidth: 1, borderColor: THEME.border, boxShadow: shadow.card, alignItems: "center", justifyContent: "center" },
  keyText: { fontFamily: FONTS.monoMed, fontSize: 28, lineHeight: 30, color: THEME.ink },
  dock: { paddingHorizontal: layout.gutter, paddingTop: 14, paddingBottom: 14, backgroundColor: THEME.bg, borderTopWidth: 1, borderTopColor: THEME.hairStrong },
}));
