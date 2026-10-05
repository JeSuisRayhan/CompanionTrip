import React, { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { THEME, space, type, themedStyles } from "../lib/theme";
import { isoDate, isValidISODate, monthGrid, monthTitle, shiftMonth, formatFullDate, formatShortDate, WEEKDAYS_MONDAY_FIRST } from "../lib/dates";
import { FieldFrame, IconButton, Chip, Button, Sheet, Txt, round } from "./ui";

// A date chosen in a calendar instead of typed. The value is an ISO date
// (AAAA-MM-JJ) or "" when empty; what the traveller reads is "Jeudi 1 octobre
// 2026". `min` / `max` grey out the days that are not allowed (a return date
// before the departure, say). Written in plain JS, no native module: it ships
// with a remote update like everything else.
export default function DateField({ label, value, onChange, optional, min, max, compact, placeholder = "Choisir une date", hint, error, style }) {
  const [open, setOpen] = useState(false);
  const valid = isValidISODate(value) ? value : null;
  const shown = valid ? (compact ? formatShortDate(valid, true) : formatFullDate(valid)) : null;
  return (
    <>
      <FieldFrame label={label} hint={hint} error={error} active={open} style={style}>
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={valid ? `${label} : ${formatFullDate(valid)}. Modifier` : `${label} : choisir une date`}
          style={styles.button}
        >
          <Ionicons name="calendar-outline" size={20} color={valid ? THEME.gold : THEME.inkMuted} />
          <Text style={[type.body, styles.text, !valid && { color: THEME.placeholder }]} numberOfLines={2}>
            {shown || placeholder}
          </Text>
        </Pressable>
        {optional && valid ? <IconButton icon="close" label={`Effacer : ${label}`} size={18} tone="neutral" onPress={() => onChange("")} /> : null}
      </FieldFrame>
      <CalendarSheet
        visible={open}
        title={label}
        value={valid}
        min={min}
        max={max}
        optional={optional}
        onPick={(iso) => {
          setOpen(false);
          onChange(iso);
        }}
        onClear={() => {
          setOpen(false);
          onChange("");
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function viewOf(iso) {
  return { year: parseInt(iso.slice(0, 4), 10), month: parseInt(iso.slice(5, 7), 10) - 1 };
}

// The month grid in a bottom sheet. Monday first, the chosen day in gold, today
// ringed. Picking a day closes the sheet.
export function CalendarSheet({ visible, title, value, min, max, optional, onPick, onClear, onClose }) {
  const today = isoDate(new Date());
  const startAt = value || (min && isValidISODate(min) ? min : today);
  const [view, setView] = useState(() => viewOf(startAt));

  useEffect(() => {
    if (visible) setView(viewOf(startAt));
  }, [visible]);

  const weeks = monthGrid(view.year, view.month);
  const nowYear = new Date().getFullYear();
  const years = [nowYear, nowYear + 1, nowYear + 2];
  if (!years.includes(view.year)) years.push(view.year);
  years.sort((a, b) => a - b);

  const blocked = (iso) => (!!min && iso < min) || (!!max && iso > max);
  const todayBlocked = blocked(today);

  return (
    <Sheet visible={visible} onClose={onClose} title={title || "Choisir une date"}>
      <View style={styles.head}>
        <IconButton icon="chevron-back" label="Mois précédent" filled onPress={() => setView(shiftMonth(view, -1))} />
        <Txt variant="heading" style={styles.monthTitle} accessibilityLiveRegion="polite">
          {monthTitle(view.year, view.month)}
        </Txt>
        <IconButton icon="chevron-forward" label="Mois suivant" filled onPress={() => setView(shiftMonth(view, 1))} />
      </View>

      <View style={styles.years}>
        {years.map((y) => (
          <Chip key={y} label={String(y)} selected={y === view.year} tone="gold" accessibilityLabel={`Année ${y}`} onPress={() => setView({ year: y, month: view.month })} />
        ))}
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS_MONDAY_FIRST.map((w) => (
          <Text key={w} style={[type.caption, styles.weekday]} numberOfLines={1}>
            {w}
          </Text>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((iso, di) => {
            if (!iso) return <View key={di} style={styles.cell} />;
            const selected = iso === value;
            const off = blocked(iso);
            const isToday = iso === today;
            return (
              <View key={di} style={styles.cell}>
                <Pressable
                  disabled={off}
                  onPress={() => onPick(iso)}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatFullDate(iso)}${selected ? ", sélectionnée" : ""}${isToday ? ", aujourd'hui" : ""}`}
                  accessibilityState={{ selected, disabled: off }}
                  style={({ pressed }) => [
                    styles.day,
                    round("full"),
                    selected && { backgroundColor: THEME.goldFill },
                    !selected && isToday && { borderWidth: 1.5, borderColor: THEME.gold },
                    pressed && !selected && { backgroundColor: THEME.bgCardAlt },
                  ]}
                >
                  <Text style={[type.numeral, selected && { color: THEME.onGold }, off && { color: THEME.inkFaint, opacity: 0.45 }]}>{parseInt(iso.slice(8, 10), 10)}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}

      <View style={styles.footer}>
        <Button title="Aujourd'hui" variant="secondary" disabled={todayBlocked} style={styles.footerButton} onPress={() => onPick(today)} />
        {optional && value ? <Button title="Effacer" variant="secondary" style={styles.footerButton} onPress={onClear} /> : null}
        <Button title="Annuler" variant="secondary" style={styles.footerButton} onPress={onClose} />
      </View>
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  button: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 48, paddingVertical: space.sm },
  text: { flex: 1 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.sm },
  monthTitle: { flex: 1, textAlign: "center" },
  years: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: space.sm, marginBottom: space.md },
  weekRow: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", paddingBottom: space.xs, color: THEME.inkFaint },
  cell: { flex: 1, height: 48, alignItems: "center", justifyContent: "center" },
  day: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  footer: { flexDirection: "row", gap: space.sm, marginTop: space.md },
  footerButton: { flex: 1 },
}));
