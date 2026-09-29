import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { THEME, space, type } from "../lib/theme";
import { resolveDayDate, formatDayLabel } from "../lib/dates";
import { Button, Group, Row, EmptyState, Sheet, round } from "./ui";

// Bottom sheet listing the trip's days, to pick the one an idea goes on.
// `currentDayId` highlights where the idea already is; `onRemove` (optional)
// adds a "take it out" action (`removeLabel`, "Retirer du programme" by default).
export default function DayPickerModal({ visible, trip, title, currentDayId, removeLabel = "Retirer du programme", onPick, onRemove, onClose }) {
  if (!trip) return null;
  return (
    <Sheet visible={visible} onClose={onClose} title={title || "Choisir un jour"}>
      {trip.days.length === 0 ? (
        <EmptyState icon="calendar-outline" title="Aucun jour pour l'instant" text="Ajoutez-en dans l'onglet Jours." />
      ) : (
        <Group style={styles.list}>
          {trip.days.map((day, index) => {
            const date = resolveDayDate(trip, day, index);
            const current = day.id === currentDayId;
            const count = day.activities.length;
            return (
              <Row
                key={day.id}
                lead={
                  <View style={[styles.dayTile, round("sm"), current && { backgroundColor: THEME.tealDim }]}>
                    <Text style={[type.numeral, current && { color: THEME.teal }]}>J{index + 1}</Text>
                  </View>
                }
                title={day.title}
                subtitle={`${date ? formatDayLabel(date) + " · " : ""}${count} étape${count !== 1 ? "s" : ""}`}
                right={current ? <Ionicons name="checkmark-circle" size={22} color={THEME.teal} /> : null}
                selected={current}
                accessibilityLabel={`${day.title}, jour ${index + 1}${current ? ", jour actuel" : ""}`}
                onPress={() => onPick(day.id)}
                style={current ? styles.rowCurrent : undefined}
              />
            );
          })}
        </Group>
      )}
      {onRemove && currentDayId ? <Button title={removeLabel} icon="remove-circle-outline" variant="danger" full onPress={onRemove} style={styles.action} /> : null}
      <Button title="Annuler" variant="secondary" full onPress={onClose} style={styles.action} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // The sheet is bgCard, so the list sits one step up to read as its own surface.
  list: { marginBottom: space.md, backgroundColor: THEME.bgCardAlt },
  dayTile: { width: 40, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: THEME.bgRaised },
  rowCurrent: { backgroundColor: THEME.tealDim },
  action: { marginTop: space.sm },
});
