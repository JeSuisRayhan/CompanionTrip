import React, { useState, useEffect } from "react";
import { View } from "react-native";

import { space, themedStyles } from "../lib/theme";
import { keptFromTyped, typedText } from "../lib/budget";
import { Txt, Button, Field, Sheet } from "./ui";
import MoneyField, { useEntry } from "./MoneyField";

// What the way between two steps cost, and what it was done by ("Taxi", "Bus 12"): opened from the line between the steps.
// `leg` is the leg of the day (see travelTime.dayLegs); `money` = moneyOf(trip). The price may be typed in the local
// currency or in the person's own; onSave({ price, label }) gives it in the local one, null when it is left empty.
export default function LegSheet({ visible, leg, toTitle, money, onClose, onSave }) {
  const [price, setPrice] = useState("");
  const [entry, chooseEntry, reopenEntry] = useEntry(false);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return;
    const known = !!(leg && leg.price != null);
    setPrice(known ? typedText(leg.price) : "");
    reopenEntry(known); // a saved price is shown in the local currency; a new one the way it was last left
    setLabel((leg && leg.label) || "");
    setError("");
  }, [visible]);

  if (!leg) return null;
  const saved = leg.price != null || !!leg.label;

  function save() {
    const typed = price.trim();
    const amount = typed ? keptFromTyped(typed, money, entry) : null;
    if (typed && !(amount > 0)) {
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
      <MoneyField
        label="Prix payé"
        money={money}
        entry={entry}
        onEntryChange={chooseEntry}
        value={price}
        onChangeText={(v) => {
          setPrice(v);
          setError("");
        }}
        placeholder="0"
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
