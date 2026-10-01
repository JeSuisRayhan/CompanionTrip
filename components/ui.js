// Shared UI primitives. Every screen builds from these + lib/theme.js tokens.
//
// Contract for each primitive: variants / sizes / states (pressed, disabled,
// loading), a `style` prop merged last, and accessibility role + state.
// Keep this file small: a view is promoted here only when two or more screens
// use it and it has a nameable role.
import React, { useContext, useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, Image, Modal, KeyboardAvoidingView, ScrollView, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { THEME, TONES, space, layout, radius, type, shadow, themedStyles } from "../lib/theme";

// True inside surfaces that are themselves card-coloured (Group, Sheet), so a
// Field there can step darker and stay visible.
const OnCardContext = React.createContext(false);
// True inside a raised surface: a secondary button steps one level up there, else it vanishes into it.
const OnRaisedContext = React.createContext(false);

// Rounded corners + iOS continuous curve, from a radius token name.
export function round(name) {
  return { borderRadius: radius[name], borderCurve: "continuous" };
}

function toneOf(tone) {
  return TONES[tone] || TONES.neutral;
}

// ---------- Text ----------
// The only way screens set type: pick a ramp step, optionally a colour
// (a THEME key or a literal colour).
export function Txt({ variant = "body", color, style, ...props }) {
  return <Text style={[type[variant], color ? { color: THEME[color] || color } : null, style]} {...props} />;
}

// ---------- Button ----------
const buttonVariants = () => ({
  primary: { bg: THEME.gold, fg: THEME.onGold },
  secondary: { bg: THEME.bgCardAlt, fg: THEME.ink },
  ghost: { bg: "transparent", fg: THEME.gold },
  danger: { bg: THEME.stampDim, fg: THEME.stamp },
});
const BUTTON_SIZES = {
  sm: { minHeight: 36, paddingHorizontal: space.md, gap: space.xs + 2, font: "caption", icon: 16 },
  md: { minHeight: 48, paddingHorizontal: space.lg, gap: space.sm, font: "label", icon: 20 },
  lg: { minHeight: 56, paddingHorizontal: space.xl, gap: space.sm, font: "label", icon: 22 },
};

export function Button({ title, icon, variant = "primary", tone, size = "md", loading, disabled, full, style, onPress, accessibilityLabel }) {
  const onRaised = useContext(OnRaisedContext);
  const t = tone ? { bg: toneOf(tone).bg, fg: toneOf(tone).fg } : variant === "secondary" && onRaised ? { bg: THEME.bgRaised, fg: THEME.ink } : buttonVariants()[variant];
  const s = BUTTON_SIZES[size];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      hitSlop={size === "sm" ? 6 : 0}
      style={({ pressed }) => [
        styles.buttonBase,
        round("md"),
        { backgroundColor: t.bg, minHeight: s.minHeight, paddingHorizontal: s.paddingHorizontal, gap: s.gap },
        full && { alignSelf: "stretch" },
        { opacity: inactive ? 0.45 : pressed ? 0.82 : 1 },
        pressed && !inactive && { transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={t.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={s.icon} color={t.fg} /> : null}
          <Text style={[type[s.font], { color: t.fg, fontFamily: type.label.fontFamily }, full && { flexShrink: 1, textAlign: "center" }]} numberOfLines={full ? 2 : 1}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

// Icon-only control with a 44pt touch target. `label` is required (screen readers).
export function IconButton({ icon, label, onPress, tone, filled, size = 22, disabled, style }) {
  const fg = tone ? toneOf(tone).fg : THEME.inkMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        filled && { backgroundColor: tone ? toneOf(tone).bg : THEME.bgCardAlt },
        { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        style,
      ]}
    >
      <Ionicons name={icon} size={size} color={fg} />
    </Pressable>
  );
}

// ---------- Chip (selectable) ----------
export function Chip({ label, icon, selected, tone = "gold", count, onPress, onLongPress, style, accessibilityLabel }) {
  const t = toneOf(tone);
  const selectedFg = tone === "neutral" ? THEME.ink : t.fg;
  const fg = selected ? selectedFg : THEME.inkMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.chip,
        selected ? { backgroundColor: t.bg, borderColor: tone === "neutral" ? THEME.hairStrong : t.fg } : { backgroundColor: THEME.bgCardAlt, borderColor: "transparent" },
        pressed && { opacity: 0.75 },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={15} color={fg} /> : null}
      <Text style={[type.caption, styles.chipText, { color: selected ? selectedFg : THEME.ink }]} numberOfLines={1}>
        {label}
      </Text>
      {count != null ? <Text style={[type.numeralSmall, { color: fg }]}>{count}</Text> : null}
    </Pressable>
  );
}

// ---------- Badge (static status pill) ----------
export function Badge({ label, tone = "neutral", icon, solid, style }) {
  const t = toneOf(tone);
  return (
    <View style={[styles.badge, { backgroundColor: solid ? t.fg : t.bg }, style]}>
      {icon ? <Ionicons name={icon} size={12} color={solid ? THEME.onGold : t.fg} /> : null}
      <Text style={[type.caption, styles.badgeText, { color: solid ? THEME.onGold : t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// ---------- Surfaces ----------
// A plain container. Use sparingly: group rows with <Group> instead of
// boxing every row.
export function Surface({ tone = "card", r = "lg", pad, style, children, ...props }) {
  const bg = tone === "sunk" ? THEME.surfaceSunk : tone === "raised" ? THEME.bgCardAlt : THEME.bgCard;
  const padding = pad == null ? undefined : typeof pad === "number" ? pad : space[pad];
  return (
    <OnCardContext.Provider value={tone !== "sunk"}>
      <OnRaisedContext.Provider value={tone === "raised"}>
        <View {...props} style={[round(r), { backgroundColor: bg, padding }, style]}>
          {children}
        </View>
      </OnRaisedContext.Provider>
    </OnCardContext.Provider>
  );
}

// Rows on one shared surface, separated by inset hairlines.
export function Group({ children, style, inset = true }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <OnCardContext.Provider value={true}>
      <View style={[round("lg"), styles.group, style]}>
        {items.map((child, i) => (
          <React.Fragment key={child.key != null ? child.key : i}>
            {i > 0 ? <View style={[styles.separator, inset && { marginLeft: space.lg }]} /> : null}
            {child}
          </React.Fragment>
        ))}
      </View>
    </OnCardContext.Provider>
  );
}

// One row of a Group: optional leading tile/thumb, title + subtitle, trailing node.
export function Row({ icon, tone = "neutral", lead, title, subtitle, right, chevron, onPress, onLongPress, selected, style, accessibilityLabel, children }) {
  const t = toneOf(tone);
  const body = (
    <>
      {lead ? lead : icon ? (
        <View style={[styles.rowTile, round("sm"), { backgroundColor: t.bg }]}>
          <Ionicons name={icon} size={20} color={t.fg} />
        </View>
      ) : null}
      <View style={styles.rowText}>
        {title != null ? <Text style={type.name} numberOfLines={2}>{title}</Text> : null}
        {subtitle ? <Text style={[type.subhead, styles.rowSubtitle]} numberOfLines={2}>{subtitle}</Text> : null}
        {children}
      </View>
      {right ? right : null}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={THEME.inkFaint} /> : null}
    </>
  );
  if (!onPress && !onLongPress) {
    return (
      <View accessible={!!accessibilityLabel} accessibilityLabel={accessibilityLabel} style={[styles.row, style]}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || (typeof title === "string" ? title : undefined)}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: THEME.pressed }, style]}
    >
      {body}
    </Pressable>
  );
}

// Round thumbnail: a photo when we have one, otherwise a tinted icon tile.
export function Thumb({ uri, icon = "location", tone = "neutral", size = 48 }) {
  const t = toneOf(tone);
  return (
    <View style={[{ width: size, height: size, backgroundColor: t.bg, overflow: "hidden" }, round("sm"), styles.thumb]}>
      {uri ? <Image source={{ uri }} style={{ width: size, height: size }} /> : <Ionicons name={icon} size={Math.round(size * 0.46)} color={t.fg} />}
    </View>
  );
}

// ---------- Section title ----------
export function SectionTitle({ title, count, action, style }) {
  return (
    <View style={[styles.sectionTitle, style]}>
      <View style={styles.sectionTitleLeft}>
        <Text style={type.heading} accessibilityRole="header">{title}</Text>
        {count != null ? <Text style={[type.numeralSmall, { color: THEME.inkFaint }]}>{count}</Text> : null}
      </View>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={action.label}>
          <Text style={[type.caption, { color: THEME.gold, fontFamily: type.label.fontFamily }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------- Field (labelled text input) ----------
// The frame of a field (label, bordered box, then error or hint) around any
// content. Field puts a text input in it; DateField puts a button.
export function FieldFrame({ label, hint, error, multiline, active, style, children }) {
  const onCard = useContext(OnCardContext);
  const borderColor = error ? THEME.stamp : active ? THEME.gold : THEME.hairStrong;
  return (
    <View style={[styles.field, style]}>
      {label ? <Text style={[type.caption, styles.fieldLabel]}>{label}</Text> : null}
      <View style={[styles.inputWrap, round("md"), { borderColor }, onCard && { backgroundColor: THEME.surfaceSunk }, multiline && styles.inputWrapMulti]}>{children}</View>
      {error ? <Text style={[type.caption, { color: THEME.stamp, marginTop: space.xs }]}>{error}</Text> : hint ? <Text style={[type.caption, styles.fieldHint]}>{hint}</Text> : null}
    </View>
  );
}

export function Field({ label, hint, error, multiline, style, inputStyle, left, right, ...inputProps }) {
  const [focused, setFocused] = useState(false);
  return (
    <FieldFrame label={label} hint={hint} error={error} multiline={multiline} active={focused} style={style}>
      {left}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={THEME.placeholder}
        selectionColor={THEME.gold}
        cursorColor={THEME.gold}
        multiline={multiline}
        {...inputProps}
        onFocus={(e) => {
          setFocused(true);
          inputProps.onFocus && inputProps.onFocus(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          inputProps.onBlur && inputProps.onBlur(e);
        }}
        style={[type.body, styles.input, multiline && styles.inputMulti, inputStyle]}
      />
      {right}
    </FieldFrame>
  );
}

// ---------- Progress ----------
export function ProgressBar({ value = 0, tone = "teal", height = 4, style }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      style={[{ height, borderRadius: height, backgroundColor: THEME.bgCardAlt, overflow: "hidden" }, style]}
    >
      <View style={{ width: `${pct}%`, height, borderRadius: height, backgroundColor: toneOf(tone).fg }} />
    </View>
  );
}

// ---------- Headers ----------
// Modal-style: [Annuler]  Title  [Enregistrer]
export function ModalHeader({ title, left, right }) {
  return (
    <View style={styles.modalHeader}>
      <View style={styles.modalHeaderSide}>
        {left ? (
          <Pressable onPress={left.onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={left.label} style={styles.modalHeaderAction}>
            <Text style={[type.label, { color: THEME.inkMuted, fontFamily: type.body.fontFamily }]}>{left.label}</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={[type.label, styles.modalHeaderTitle]} numberOfLines={1} accessibilityRole="header">{title}</Text>
      <View style={[styles.modalHeaderSide, { alignItems: "flex-end" }]}>
        {right ? (
          <Pressable
            onPress={right.onPress}
            disabled={right.disabled}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={right.label}
            accessibilityState={{ disabled: !!right.disabled }}
            style={[styles.modalHeaderAction, right.disabled && { opacity: 0.4 }]}
          >
            <Text style={[type.label, { color: THEME.gold }]}>{right.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// Pushed-screen header: [‹]  Title (+ subtitle)  [action]
export function BackHeader({ title, subtitle, onBack, right, numberOfLines = 1 }) {
  return (
    <View style={styles.backHeader}>
      <IconButton icon="chevron-back" label="Retour" onPress={onBack} tone="neutral" style={{ marginLeft: -space.sm }} />
      <View style={{ flex: 1 }}>
        {subtitle ? <Text style={type.caption} numberOfLines={1}>{subtitle}</Text> : null}
        <Text style={type.title} numberOfLines={numberOfLines} accessibilityRole="header">{title}</Text>
      </View>
      {right}
    </View>
  );
}

// ---------- Empty state ----------
export function EmptyState({ icon = "compass-outline", tone = "neutral", title, text, action, style }) {
  const t = toneOf(tone);
  return (
    <View style={[styles.empty, style]}>
      <View style={[styles.emptyIcon, { backgroundColor: t.bg }]}>
        <Ionicons name={icon} size={28} color={t.fg} />
      </View>
      <Text style={[type.heading, { textAlign: "center" }]}>{title}</Text>
      {text ? <Text style={[type.subhead, { textAlign: "center", maxWidth: 300 }]}>{text}</Text> : null}
      {action ? <Button title={action.label} icon={action.icon} onPress={action.onPress} style={{ marginTop: space.sm }} /> : null}
    </View>
  );
}


// ---------- Bottom sheet ----------
// Replaces centred pop-up dialogs: a panel that slides up from the bottom.
// Children are scrollable so forms stay reachable with the keyboard open.
export function Sheet({ visible, onClose, title, children }) {
  const insets = useContext(SafeAreaInsetsContext);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={styles.sheetRoot}>
        <Pressable style={styles.sheetScrim} onPress={onClose} accessibilityLabel="Fermer" accessibilityRole="button" />
        <View style={[styles.sheet, { paddingBottom: space.xl + (insets ? insets.bottom : 0) }]}>
          <View style={styles.sheetHandle} />
          {title ? (
            <Text style={[type.heading, styles.sheetTitle]} accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          <OnCardContext.Provider value={true}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>
              {children}
            </ScrollView>
          </OnCardContext.Provider>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------- Action sheet ----------
// A list of actions in a bottom sheet: the way to keep occasional actions off
// the screen. actions: [{ icon, title, subtitle, tone, onPress }] (falsy entries
// are skipped). The sheet closes first, then the action runs: an Alert opened
// while a Modal is still closing is lost on iOS.
export function ActionSheet({ visible, onClose, title, actions }) {
  const list = actions.filter(Boolean);
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <Group style={{ marginBottom: space.md }}>
        {list.map((a) => (
          <Row
            key={a.title}
            icon={a.icon}
            tone={a.tone}
            title={a.title}
            subtitle={a.subtitle}
            onPress={() => {
              onClose();
              if (Platform.OS === "ios") setTimeout(a.onPress, 350);
              else a.onPress();
            }}
          />
        ))}
      </Group>
    </Sheet>
  );
}

// ---------- Floating action button ----------
export function Fab({ label, icon = "add", onPress }) {
  const insets = useContext(SafeAreaInsetsContext);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        round("full"),
        { bottom: space.xl + (insets ? insets.bottom : 0), boxShadow: shadow.fab },
        pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 },
      ]}
    >
      <Ionicons name={icon} size={22} color={THEME.onGold} />
      <Text style={[type.label, { color: THEME.onGold }]}>{label}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  buttonBase: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  iconButton: { width: layout.minTouch, height: layout.minTouch, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs + 2,
    minHeight: 36,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.full,
    borderWidth: 1.5,
  },
  chipText: { fontFamily: type.label.fontFamily, flexShrink: 1 },
  badge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: space.xs, height: 24, paddingHorizontal: space.sm + 2, borderRadius: radius.full },
  badgeText: { fontFamily: type.label.fontFamily, flexShrink: 1 },
  group: { backgroundColor: THEME.bgCard, overflow: "hidden" },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: THEME.hairStrong },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 56 },
  rowTile: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, gap: 2 },
  rowSubtitle: { color: THEME.inkMuted },
  thumb: { alignItems: "center", justifyContent: "center" },
  sectionTitle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.md },
  sectionTitleLeft: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  field: { marginBottom: space.lg },
  fieldLabel: { marginBottom: space.sm - 2, color: THEME.inkMuted },
  fieldHint: { marginTop: space.xs, color: THEME.inkFaint },
  inputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: THEME.bgCard, borderWidth: 1.5, minHeight: 50, paddingHorizontal: space.lg - 2 },
  inputWrapMulti: { alignItems: "flex-start", paddingVertical: space.sm },
  input: { flex: 1, paddingVertical: space.md, minHeight: 48 },
  inputMulti: { minHeight: 96, textAlignVertical: "top", paddingTop: space.sm },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    paddingHorizontal: layout.gutter,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: THEME.hairStrong,
  },
  modalHeaderSide: { flex: 1 },
  modalHeaderAction: { minHeight: layout.minTouch, justifyContent: "center" },
  modalHeaderTitle: { flex: 2, textAlign: "center" },
  backHeader: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: layout.gutter, paddingTop: space.sm, paddingBottom: space.md },
  empty: { alignItems: "center", gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: layout.gutter },
  emptyIcon: { width: 64, height: 64, borderRadius: radius.full, alignItems: "center", justifyContent: "center", marginBottom: space.sm },
  sheetRoot: { flex: 1, justifyContent: "flex-end" },
  sheetScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: THEME.scrim },
  sheet: {
    maxHeight: "88%",
    backgroundColor: THEME.bgCard,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderCurve: "continuous",
    paddingHorizontal: layout.gutter,
    paddingTop: space.md,
    boxShadow: shadow.overlay,
  },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: THEME.hairStrong, marginBottom: space.lg },
  sheetTitle: { marginBottom: space.lg },
  fab: {
    position: "absolute",
    right: layout.gutter,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    height: 56,
    paddingHorizontal: space.xl - 4,
    backgroundColor: THEME.gold,
  },
}));
