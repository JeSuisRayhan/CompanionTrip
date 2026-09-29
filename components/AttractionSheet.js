import React, { useState, useEffect } from "react";
import { View, StyleSheet, Alert } from "react-native";

import { space } from "../lib/theme";
import { PARK_PRIORITIES, PARK_IDEA_CATEGORIES, addIdea, editIdea, deleteIdea } from "../lib/ideas";
import { Txt, Button, Chip, Field, Sheet } from "./ui";

const PRIORITY_TONE = { must: "stamp", want: "gold", maybe: "neutral", skip: "neutral" };

function Choices({ label, children }) {
  return (
    <View style={styles.choices}>
      <Txt variant="caption" style={styles.choicesLabel}>
        {label}
      </Txt>
      <View style={styles.chipWrap}>{children}</View>
    </View>
  );
}

// One attraction of the park: how much you want it, the zone, the minimum
// height, the usual queue, the hour of a show. `idea` = null adds a new one.
// The queue and zone of a ride loaded from Queue-Times stay editable: the
// live queue always wins when there is one, the usual one is the fallback.
export default function AttractionSheet({ visible, trip, idea, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("activite");
  const [priority, setPriority] = useState("want");
  const [land, setLand] = useState("");
  const [minHeight, setMinHeight] = useState("");
  const [waitMin, setWaitMin] = useState("");
  const [showTime, setShowTime] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(idea ? idea.name : "");
    setCategoryId(idea ? idea.categoryId : "activite");
    setPriority(idea ? idea.priority : "want");
    setLand(idea && idea.land ? idea.land : "");
    setMinHeight(idea && idea.minHeightCm != null ? String(idea.minHeightCm) : "");
    setWaitMin(idea && idea.waitMin != null ? String(idea.waitMin) : "");
    setShowTime(idea && idea.showTime ? idea.showTime : "");
    setNote(idea && idea.note ? idea.note : "");
    setSaving(false);
  }, [visible, idea]);

  const isShow = categoryId === "spectacle";
  const isMeal = categoryId === "repas";
  const timeOk = !showTime.trim() || /^([01]?\d|2[0-3]):[0-5]\d$/.test(showTime.trim());
  const canSave = !!name.trim() && timeOk && !saving;

  async function save() {
    setSaving(true);
    const hour = showTime.trim();
    const patch = {
      name,
      categoryId,
      priority,
      land: land.trim() || null,
      minHeightCm: isMeal ? null : minHeight,
      waitMin: isMeal ? null : waitMin,
      showTime: isShow && hour ? (hour.length === 4 ? `0${hour}` : hour) : null,
      durationMin: idea && idea.categoryId === categoryId ? idea.durationMin : undefined, // a new type brings its own default
      note,
    };
    if (idea) await editIdea(trip.id, idea.id, patch);
    else await addIdea(trip.id, patch);
    onSaved();
  }

  function confirmDelete() {
    Alert.alert(`Supprimer « ${idea.name} » ?`, "Elle sera aussi retirée de vos journées.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          await deleteIdea(trip.id, idea.id, { removeActivity: true });
          onSaved();
        },
      },
    ]);
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={idea ? "Modifier l'attraction" : "Nouvelle attraction"}>
      <Field label="Nom" value={name} onChangeText={setName} placeholder="Space Mountain" maxLength={80} autoFocus={!idea} />

      <Choices label="Type">
        {PARK_IDEA_CATEGORIES.map((c) => (
          <Chip key={c.id} label={c.label} icon={c.icon} selected={categoryId === c.id} tone="gold" onPress={() => setCategoryId(c.id)} />
        ))}
      </Choices>

      <Choices label="Priorité">
        {PARK_PRIORITIES.map((p) => (
          <Chip key={p.key} label={p.label} tone={PRIORITY_TONE[p.key]} selected={priority === p.key} onPress={() => setPriority(p.key)} />
        ))}
      </Choices>

      <Field label="Zone du parc" value={land} onChangeText={setLand} placeholder="Fantasyland" maxLength={40} />

      {!isMeal && (
        <View style={styles.pair}>
          <Field label="Taille minimale (cm)" value={minHeight} onChangeText={(v) => setMinHeight(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="Aucune" maxLength={3} style={styles.half} />
          <Field label="Attente habituelle (min)" value={waitMin} onChangeText={(v) => setWaitMin(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="30" maxLength={3} style={styles.half} />
        </View>
      )}

      {isShow && (
        <Field
          label="Heure de la séance"
          value={showTime}
          onChangeText={(v) => setShowTime(v.replace(/[^0-9:]/g, ""))}
          keyboardType="numbers-and-punctuation"
          placeholder="16:30"
          maxLength={5}
          error={timeOk ? undefined : "Format attendu : 16:30"}
          hint="Le parcours place le spectacle à cette heure."
        />
      )}

      <Field label="Note" value={note} onChangeText={setNote} placeholder="Fast pass, à faire avant midi…" multiline />

      <View style={styles.buttons}>
        <Button title="Annuler" variant="secondary" style={styles.flex} onPress={onClose} />
        <Button title="Enregistrer" style={styles.flex} disabled={!canSave} loading={saving} onPress={save} />
      </View>
      {idea ? <Button title="Supprimer l'attraction" icon="trash-outline" variant="danger" full style={styles.delete} onPress={confirmDelete} /> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  choices: { marginBottom: space.lg },
  choicesLabel: { marginBottom: space.sm },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  pair: { flexDirection: "row", gap: space.md },
  half: { flex: 1 },
  buttons: { flexDirection: "row", gap: space.md, marginTop: space.sm },
  delete: { marginTop: space.md },
});
