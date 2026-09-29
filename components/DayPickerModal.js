import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { THEME, CARD_SHADOW } from "../lib/theme";
import { FONTS } from "../lib/fonts";
import { resolveDayDate, formatDateLabel } from "../lib/dates";

// Bottom sheet listing the trip's days, to pick the one an idea goes on.
// `currentDayId` highlights where the idea already is; `onRemove` (optional)
// adds a "take it out of the programme" row.
export default function DayPickerModal({ visible, trip, title, currentDayId, onPick, onRemove, onClose }) {
  if (!trip) return null;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title} numberOfLines={2}>
            {title || "Choisir un jour"}
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled">
            {trip.days.length === 0 && <Text style={styles.empty}>Aucun jour pour l'instant — ajoutez-en dans l'onglet Jours.</Text>}
            {trip.days.map((day, index) => {
              const date = resolveDayDate(trip, day, index);
              const current = day.id === currentDayId;
              return (
                <TouchableOpacity key={day.id} style={[styles.row, current && styles.rowCurrent]} onPress={() => onPick(day.id)} activeOpacity={0.8}>
                  <Text style={[styles.dayIndex, current && styles.dayIndexCurrent]}>J{index + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dayTitle} numberOfLines={1}>
                      {day.title}
                    </Text>
                    <Text style={styles.dayMeta} numberOfLines={1}>
                      {date ? formatDateLabel(date) + " · " : ""}
                      {day.activities.length} étape{day.activities.length !== 1 ? "s" : ""}
                    </Text>
                  </View>
                  {current && <Ionicons name="checkmark-circle" size={18} color={THEME.teal} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {onRemove && currentDayId ? (
            <TouchableOpacity style={styles.removeRow} onPress={onRemove}>
              <Ionicons name="remove-circle-outline" size={17} color={THEME.stamp} />
              <Text style={styles.removeText}>Retirer du programme</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#00000099", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: THEME.bgCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    maxHeight: "75%",
    borderWidth: 1,
    borderColor: THEME.border,
    ...CARD_SHADOW,
  },
  title: { fontSize: 16, color: THEME.ink, fontFamily: FONTS.headingSemiBold, marginBottom: 12 },
  empty: { color: THEME.inkMuted, fontSize: 13.5, fontFamily: FONTS.body, paddingVertical: 20, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    backgroundColor: THEME.bgCardAlt,
  },
  rowCurrent: { borderColor: THEME.teal, backgroundColor: THEME.tealDim },
  dayIndex: {
    backgroundColor: THEME.goldDim,
    color: THEME.gold,
    fontSize: 11,
    fontFamily: FONTS.bodySemiBold,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    overflow: "hidden",
  },
  dayIndexCurrent: { backgroundColor: THEME.teal, color: THEME.bg },
  dayTitle: { color: THEME.ink, fontSize: 14.5, fontFamily: FONTS.headingSemiBold },
  dayMeta: { color: THEME.inkFaint, fontSize: 11.5, marginTop: 2, textTransform: "capitalize", fontFamily: FONTS.body },
  removeRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12 },
  removeText: { color: THEME.stamp, fontSize: 14, fontFamily: FONTS.bodyMedium },
  cancel: { alignItems: "center", paddingVertical: 12 },
  cancelText: { color: THEME.inkFaint, fontSize: 13.5, fontFamily: FONTS.body },
});
