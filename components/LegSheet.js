import React, { useState, useEffect } from "react";
import { View } from "react-native";

import { space, type as ramp, themedStyles } from "../lib/theme";
import { parseBudgetInput } from "../lib/budget";
import { Txt, Button, Field, Sheet } from "./ui";

// What the way between two steps cost, and what it was done by ("Taxi", "Bus 12"): opened from the line between the steps.
// `leg` is the leg of the day (see travelTime.dayLegs). onSave({ price, label }) with price null when it is left empty.
export default function LegSheet({ visible, leg, toTitle, currency, onClose, onSave }) {
  const [price, setPrice] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return;
    setPrice(leg && leg.price != null ? String(leg.price).replace(".", ",") : "");
    setLabel((leg && leg.label) || "");
    setError("");
  }, [visible]);

  if (!leg) return null;
  const saved = leg.price != null || !!leg.label;

  function save() {
    const typed = price.trim();
    const amount = typed ? parseBudgetInput(typed) : null;
    if (typed && amount == null) {
      setError("Prix non reconnu : écrivez un montant, par exemple 12,50.");
      return;
    }
    onSave({ price: amount, label: label.trim() });
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Prix du trajet">
      <Txt variant="subhead" style={styles.help}>
        {`${leg.fromTitle || "Étape précédente"} → ${toTitle}`}
        {leg.estimated ? `\n${leg.text}` : ""}
      </Txt>
      <Field
        label={`Prix payé (${currency})`}
        value={price}
        onChangeText={(v) => {
          setPrice(v);
          setError("");
        }}
        placeholder="0"
        keyboardType="decimal-pad"
        inputStyle={ramp.numeral}
        error={error}
      />
      <Field label="Moyen de transport (optionnel)" value={label} onChangeText={setLabel} placeholder="Taxi, bus, métro, navette…" maxLength={80} />
      <View style={styles.buttons}>
        {saved ? <Button title="Effacer" variant="secondary" tone="stamp" style={styles.button} onPress={() => onSave({ price: null, label: "" })} /> : <Button title="Annuler" variant="secondary" style={styles.button} onPress={onClose} />}
        <Button title="Enregistrer" style={styles.button} onPress={save} />
      </View>
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  help: { marginBottom: space.lg },
  buttons: { flexDirection: "row", gap: space.md },
  button: { flex: 1 },
}));
