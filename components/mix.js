// Small pieces shared by the screens of the "carnet × tableau des départs" design: the top bar of a trip, its four
// tabs, the title of a page, a titled section, the round button.
import React, { useContext } from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import Icon from "./Icon";
import { SectionTitle } from "./ui";
import { THEME, TONES, FONTS, shadow, type, layout, space, themedStyles } from "../lib/theme";
import { useTripInk } from "../lib/tripInk";

// The round button of a top bar: a card with a fine edge (or bare, for "back").
export function TopButton({ icon, label, onPress, plain, size = 22, style }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.topButton, !plain && styles.topButtonFilled, pressed && { opacity: 0.7 }, style]}
    >
      <Icon name={icon} size={size} color={THEME.ink} />
    </Pressable>
  );
}

// The top of a trip: back, the dot of the trip's ink and its name, then the buttons of the screen.
export function TripTopBar({ name, onBack, right, backIcon = "chevron-back", backLabel = "Retour à mes voyages" }) {
  const ink = useTripInk();
  return (
    <View style={styles.topBar}>
      <TopButton icon={backIcon} label={backLabel} plain onPress={onBack} />
      <View style={styles.topName}>
        <View style={[styles.topDot, { backgroundColor: ink.color }]} />
        <Text style={styles.topTitle} numberOfLines={1} accessibilityRole="header">{name}</Text>
      </View>
      {right}
    </View>
  );
}

// The six glyphs of the trip tabs, as drawn in the design (one line weight, round ends).
function TabIcon({ name, color, size = 24 }) {
  const p = { stroke: color, strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "apercu" ? (
        <>
          <Circle cx={12} cy={12} r={9} {...p} />
          <Path d="M15.5 8.5l-2 5-5 2 2-5z" {...p} />
        </>
      ) : name === "today" ? (
        <>
          <Circle cx={12} cy={12} r={4} {...p} />
          <Path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.2 5.2L7 7M17 17l1.8 1.8M5.2 18.8L7 17M17 7l1.8-1.8" {...p} />
        </>
      ) : name === "bilan" ? (
        <Path d="M5.5 21V4M5.5 4.5h12l-2.5 4 2.5 4h-12" {...p} />
      ) : name === "programme" ? (
        <>
          <Rect x={4} y={5.5} width={16} height={14.5} rx={2.5} {...p} />
          <Path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" {...p} />
        </>
      ) : name === "budget" ? (
        <>
          <Path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" {...p} />
          <Path d="M4 7.5V17a2 2 0 0 0 2 2h13V8H6.5A2.5 2.5 0 0 1 4 7.5z" {...p} />
          <Circle cx={15.5} cy={13.5} r={1.2} fill={color} stroke="none" />
        </>
      ) : (
        <>
          <Rect x={3.5} y={7.5} width={17} height={12} rx={2.5} {...p} />
          <Path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5M3.5 12.5h17" {...p} />
        </>
      )}
    </Svg>
  );
}

// The four tabs of a trip; the active one is a pill in the ink of the trip.
export function TripTabBar({ tabs, value, onChange }) {
  const ink = useTripInk();
  const insets = useContext(SafeAreaInsetsContext);
  const bottom = insets ? insets.bottom : 0;
  return (
    <View accessibilityRole="tablist" style={[styles.tabBar, { height: 84 + bottom, paddingBottom: 14 + bottom }]}>
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: on }}
            onPress={() => onChange(t.key)}
            style={styles.tab}
          >
            <View style={[styles.pill, on && { backgroundColor: ink.dim }]}>
              <TabIcon name={t.key} color={on ? ink.color : THEME.inkFaint} />
            </View>
            <Text style={[styles.tabLabel, { color: on ? THEME.ink : THEME.inkFaint }]} numberOfLines={1}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// The title of a page of a trip: a big heading and one line under it.
export function PageHead({ title, sub, right }) {
  return (
    <View style={styles.head}>
      <View style={styles.headText}>
        <Text style={type.display} accessibilityRole="header">{title}</Text>
        {sub ? <Text style={type.subhead}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

// A titled block: the title (with its count and rule), then what it holds.
export function Section({ title, count, action, children, style }) {
  return (
    <View style={[styles.section, style]}>
      <SectionTitle title={title} count={count} action={action} style={{ marginBottom: 0 }} />
      {children}
    </View>
  );
}

// The little ticket that holds the day number and the weekday; `linked` draws a dotted line down to the next one.
// state: "today" (gold), "done" (teal), else plain.
export function DayNum({ date, index, state, linked }) {
  const ink = useTripInk();
  const d = date ? new Date(date + "T00:00:00") : null;
  const wd = d ? d.toLocaleDateString("fr-FR", { weekday: "short" }).toUpperCase() : "JOUR";
  const fg = state === "today" ? THEME.onGold : state === "done" ? THEME.teal : THEME.ink;
  const sub = state === "today" ? THEME.onGold : state === "done" ? THEME.teal : THEME.inkFaint;
  return (
    <View style={styles.numCol}>
      <View style={[styles.daynum, state === "today" && { backgroundColor: THEME.goldFill, borderColor: THEME.goldFill }, state === "done" && { backgroundColor: THEME.tealDim, borderColor: "transparent", boxShadow: "0 0 0 0 transparent" }]}>
        <Text style={[styles.daynumNum, { color: fg }]}>{d ? d.getDate() : index + 1}</Text>
        <Text style={[styles.daynumSub, { color: sub }]}>{wd}</Text>
      </View>
      {linked ? (
        <View style={styles.link} pointerEvents="none">
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.linkDot, { backgroundColor: ink.color }]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// A short label on a tinted ground: the weather, a price, a status. tone: "trip" (the ink of the trip), a tone name, or
// none (grey). `mono` for figures.
export function Tag({ icon, label, tone, mono, style, accessibilityLabel }) {
  const ink = useTripInk();
  const t = tone === "trip" ? { fg: ink.color, bg: ink.dim } : tone && TONES[tone] ? TONES[tone] : { fg: THEME.inkMuted, bg: THEME.bgCardAlt };
  return (
    <View accessible accessibilityLabel={accessibilityLabel || label} style={[styles.tag, { backgroundColor: t.bg }, style]}>
      {icon ? <Icon name={icon} size={14} color={t.fg} /> : null}
      <Text style={[mono ? styles.tagMono : styles.tagText, { color: t.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

// The dotted line from one node of a timeline to the next: drawn on its own (absolute) so it never makes the row taller.
const DOT_COUNT = 40;
export function DotLine({ color }) {
  return (
    <View pointerEvents="none" style={styles.lineDots}>
      {Array.from({ length: DOT_COUNT }).map((_, i) => (
        <View key={i} style={[styles.lineMark, { backgroundColor: color }]} />
      ))}
    </View>
  );
}

// The node of a step on a timeline: a round glyph in the tone of the step; a check once done; gold (with a halo) for the
// one that comes next. Tapping it ticks the step.
export function StepDot({ icon, tone = "teal", state = "todo", onPress, label, hint, disabled }) {
  const t = TONES[tone] || TONES.teal;
  const done = state === "done";
  const next = state === "next";
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      hitSlop={8}
      disabled={disabled}
      onPress={onPress}
      style={[styles.stepDot, { backgroundColor: done ? THEME.tealDim : next ? THEME.goldFill : t.bg }, next && { boxShadow: `0 0 0 4px ${THEME.goldDim}` }]}
    >
      <Icon name={done ? "checkmark" : icon} size={18} color={done ? THEME.teal : next ? THEME.onGold : t.fg} />
    </Pressable>
  );
}

// The days of a trip as a strip of little tickets; the open one is inked.
export function DayChip({ date, index, state, selected, onPress, label }) {
  const d = date ? new Date(date + "T00:00:00") : null;
  const wd = d ? d.toLocaleDateString("fr-FR", { weekday: "short" }).toUpperCase() : "JOUR";
  const bg = selected ? THEME.ink : state === "today" ? THEME.goldFill : state === "done" ? THEME.tealDim : THEME.bgCard;
  const fg = selected ? THEME.bg : state === "today" ? THEME.onGold : state === "done" ? THEME.teal : THEME.ink;
  const sub = selected ? THEME.bg : state === "today" ? THEME.onGold : state === "done" ? THEME.teal : THEME.inkFaint;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.dayChip, { backgroundColor: bg, borderColor: selected ? THEME.ink : state === "today" ? THEME.goldFill : state === "done" ? "transparent" : THEME.border }, pressed && { opacity: 0.8 }]}
    >
      <Text style={[styles.daynumNum, { color: fg }]}>{d ? d.getDate() : index + 1}</Text>
      <Text style={[styles.daynumSub, { color: sub }]}>{wd}</Text>
    </Pressable>
  );
}

// The tear-off line of a ticket: two notches cut in its edges and a dotted rule between them.
const NOTCH = 22;
export function Perforation() {
  return (
    <View style={styles.perforation} pointerEvents="none">
      <View style={[styles.notch, { left: -NOTCH / 2 }]} />
      <View style={styles.dots}>
        {Array.from({ length: 26 }).map((_, i) => (
          <View key={i} style={styles.dot} />
        ))}
      </View>
      <View style={[styles.notch, { right: -NOTCH / 2 }]} />
    </View>
  );
}

// A tick box that is a big square: the lists of the trip.
export function CheckBox({ checked, size = 26 }) {
  const ink = useTripInk();
  return (
    <View style={[styles.box, { width: size, height: size }, checked ? { backgroundColor: ink.color, borderColor: ink.color } : null]}>
      {checked ? <Icon name="checkmark" size={size - 6} color={THEME.onAccent} /> : null}
    </View>
  );
}

// One line of a list to tick: the box, the label (struck through when done).
export function CheckRow({ label, checked, onPress, right, accessibilityLabel }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!checked }}
      accessibilityLabel={accessibilityLabel || label}
      onPress={onPress}
      style={({ pressed }) => [styles.checkRow, pressed && { backgroundColor: THEME.pressed }]}
    >
      <CheckBox checked={checked} />
      <Text style={[type.name, styles.checkLabel, checked && styles.checkDone]} numberOfLines={2}>{label}</Text>
      {right}
    </Pressable>
  );
}

// An amount in two currencies: the person's own big, the local one small under it.
export function AmountCol({ main, local, style }) {
  return (
    <View style={[styles.amountCol, style]}>
      <Text style={styles.amountMain} numberOfLines={1}>{main}</Text>
      {local ? <Text style={styles.amountLocal} numberOfLines={1}>{local}</Text> : null}
    </View>
  );
}

// A bar cut in parts, one colour each (what is booked, what is spent): [{ ratio: 0..1, color }].
export function SplitBar({ parts, height = 8, style }) {
  return (
    <View style={[styles.splitTrack, { height, borderRadius: height / 2 }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {parts.map((p, i) => (p.ratio > 0 ? <View key={i} style={{ width: `${Math.max(0, Math.min(1, p.ratio)) * 100}%`, height, backgroundColor: p.color, marginRight: 2 }} /> : null))}
    </View>
  );
}

// What a page's scroll puts around its sections.
export const MAIN = { paddingHorizontal: layout.gutter, paddingTop: 20, paddingBottom: 28, gap: 24 };

const styles = themedStyles(() => ({
  topButton: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  topButtonFilled: { backgroundColor: THEME.bgCard, borderWidth: 1, borderColor: THEME.border, boxShadow: shadow.card },
  topBar: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: layout.gutter, paddingTop: space.sm },
  topName: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  topDot: { width: 10, height: 10, borderRadius: 5 },
  topTitle: { flexShrink: 1, fontFamily: type.display.fontFamily, fontSize: 20, lineHeight: 24, letterSpacing: -0.2, color: THEME.ink },
  tabBar: {
    flexDirection: "row",
    paddingTop: 8,
    paddingHorizontal: 6,
    backgroundColor: THEME.bgCard,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    boxShadow: THEME.light ? "0 -8px 16px -12px rgba(70, 48, 16, 0.35)" : "0 0 0 0 transparent",
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  pill: { width: 58, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  tabLabel: { fontFamily: type.label.fontFamily, fontSize: 13, lineHeight: 15 },
  head: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space.md },
  headText: { flex: 1, gap: 6 },
  section: { gap: 12 },
  lineDots: { position: "absolute", top: 39, bottom: 5, left: 16, width: 2, overflow: "hidden", alignItems: "center", opacity: 0.6 },
  lineMark: { width: 2, height: 2.5, borderRadius: 1, marginBottom: 5.5 },
  stepDot: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  dayChip: { flex: 1, minWidth: 56, height: 64, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 3, boxShadow: "0 1px 1px rgba(70, 48, 16, 0.06), 0 6px 14px -8px rgba(70, 48, 16, 0.24)" },
  numCol: { width: 52, height: 58 },
  daynum: { width: 52, height: 58, borderRadius: 12, backgroundColor: THEME.bgCard, borderWidth: 1, borderColor: THEME.border, boxShadow: "0 1px 1px rgba(70, 48, 16, 0.06), 0 6px 14px -8px rgba(70, 48, 16, 0.24)", alignItems: "center", justifyContent: "center", gap: 3 },
  daynumNum: { fontFamily: FONTS.monoSemi, fontSize: 22, lineHeight: 22 },
  daynumSub: { fontFamily: FONTS.bodySemi, fontSize: 12, lineHeight: 12, letterSpacing: 1 },
  link: { position: "absolute", left: 25, top: 58, height: 20, width: 2, alignItems: "center", justifyContent: "space-evenly" },
  linkDot: { width: 2, height: 2.5, borderRadius: 1, opacity: 0.6 },
  tag: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, height: 26, paddingHorizontal: 9, borderRadius: 6 },
  tagText: { fontFamily: FONTS.bodySemi, fontSize: 13, lineHeight: 16 },
  tagMono: { fontFamily: FONTS.monoMed, fontSize: 13, lineHeight: 16, letterSpacing: -0.3 },
  splitTrack: { flexDirection: "row", overflow: "hidden", backgroundColor: THEME.bgCardAlt, boxShadow: `inset 0 0 0 1px ${THEME.hair}` },
  perforation: { height: NOTCH, justifyContent: "center" },
  notch: { position: "absolute", width: NOTCH, height: NOTCH, borderRadius: NOTCH / 2, backgroundColor: THEME.bg, borderWidth: THEME.light ? 1 : 0, borderColor: THEME.border },
  dots: { flexDirection: "row", justifyContent: "space-between", marginHorizontal: NOTCH },
  dot: { width: 4, height: 2, borderRadius: 1, backgroundColor: THEME.hairStrong },
  box: { borderRadius: 7, borderWidth: 2, borderColor: THEME.inkFaint, alignItems: "center", justifyContent: "center" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 58, paddingHorizontal: space.lg, paddingVertical: 8 },
  checkLabel: { flex: 1 },
  checkDone: { color: THEME.inkFaint, textDecorationLine: "line-through", textDecorationStyle: "solid" },
  amountCol: { alignItems: "flex-end" },
  amountMain: { fontFamily: type.numeral.fontFamily, fontSize: 17, lineHeight: 22, letterSpacing: -0.3, color: THEME.ink },
  amountLocal: { fontFamily: type.numeralSmall.fontFamily, fontSize: 13, lineHeight: 17, color: THEME.inkFaint },
}));
