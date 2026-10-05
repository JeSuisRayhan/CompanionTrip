// Shared UI primitives. Every screen builds from these + lib/theme.js tokens.
//
// Contract for each primitive: variants / sizes / states (pressed, disabled,
// loading), a `style` prop merged last, and accessibility role + state.
// Keep this file small: a view is promoted here only when two or more screens
// use it and it has a nameable role.
import React, { useContext, useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, Image, Modal, KeyboardAvoidingView, ScrollView, StyleSheet, Platform, Animated } from "react-native";
import Icon from "./Icon";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { THEME, TONES, space, layout, radius, type, shadow, paperEdge, themedStyles } from "../lib/theme";
import { useThump } from "../lib/motion";
import TicketArt from "./TicketArt";

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

// On paper, gold is kept for "today / what comes next": a control that asks for the gold tone is drawn in ink.
const goldOnPaper = (tone) => tone === "gold" && THEME.light;

// ---------- Text ----------
// The only way screens set type: pick a ramp step, optionally a colour
// (a THEME key or a literal colour).
export function Txt({ variant = "body", color, style, ...props }) {
  return <Text style={[type[variant], color ? { color: THEME[color] || color } : null, style]} {...props} />;
}

// ---------- Button ----------
const buttonVariants = () => ({
  primary: { bg: THEME.action, fg: THEME.onAction, edge: THEME.action },
  secondary: { bg: THEME.light ? THEME.bgCard : THEME.bgCardAlt, fg: THEME.ink, edge: THEME.light ? THEME.hairStrong : "transparent" },
  ghost: { bg: "transparent", fg: THEME.mark, edge: "transparent" },
  danger: { bg: THEME.stampDim, fg: THEME.stamp, edge: "transparent" },
});
const BUTTON_SIZES = {
  sm: { minHeight: 36, paddingHorizontal: space.md, gap: space.xs + 2, font: "caption", icon: 16 },
  md: { minHeight: 48, paddingHorizontal: space.lg, gap: space.sm, font: "label", icon: 20 },
  lg: { minHeight: 56, paddingHorizontal: space.xl, gap: space.sm, font: "label", icon: 22 },
};

export function Button({ title, icon, variant = "primary", tone, size = "md", loading, disabled, full, style, onPress, accessibilityLabel }) {
  const onRaised = useContext(OnRaisedContext);
  const t = tone && !goldOnPaper(tone)
    ? { bg: toneOf(tone).bg, fg: toneOf(tone).fg, edge: "transparent" }
    : variant === "secondary" && onRaised
      ? { bg: THEME.bgRaised, fg: THEME.ink, edge: THEME.light ? THEME.hairStrong : "transparent" }
      : buttonVariants()[variant];
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
        { backgroundColor: t.bg, borderColor: t.edge, minHeight: s.minHeight, paddingHorizontal: s.paddingHorizontal, gap: s.gap },
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
          {icon ? <Icon name={icon} size={s.icon} color={t.fg} /> : null}
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
  const ink = goldOnPaper(tone);
  const fg = ink ? (filled ? THEME.onAction : THEME.ink) : tone ? toneOf(tone).fg : THEME.inkMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        filled && { backgroundColor: ink ? THEME.action : tone ? toneOf(tone).bg : THEME.bgCardAlt },
        { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        style,
      ]}
    >
      <Icon name={icon} size={size} color={fg} />
    </Pressable>
  );
}

// ---------- Chip (selectable) ----------
export function Chip({ label, icon, selected, tone = "gold", count, onPress, onLongPress, style, accessibilityLabel }) {
  const t = toneOf(tone);
  const ink = goldOnPaper(tone); // selected = an ink-filled tab, readable at a glance
  const selectedFg = ink ? THEME.onAction : tone === "neutral" ? THEME.ink : t.fg;
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
        selected
          ? ink
            ? { backgroundColor: THEME.action, borderColor: THEME.action }
            : { backgroundColor: t.bg, borderColor: tone === "neutral" ? THEME.hairStrong : t.fg }
          : THEME.light
            ? { backgroundColor: THEME.bgCard, borderColor: THEME.hairStrong }
            : { backgroundColor: THEME.bgCardAlt, borderColor: "transparent" },
        pressed && { opacity: 0.75 },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={15} color={fg} /> : null}
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
      {icon ? <Icon name={icon} size={12} color={solid ? THEME.onAccent : t.fg} /> : null}
      <Text style={[type.caption, styles.badgeText, { color: solid ? THEME.onAccent : t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// ---------- Stamp ----------
// A status inked on a ticket: a double outline, slightly crooked, like a rubber stamp. The one decorative
// touch of the app: for a status ("En cours", "J-46"), never for a plain label. Solid inside, so it stays
// readable on a photo.
// `thump`: it comes down on the ticket when it shows (after `delay` ms); `large` is for a stamp on its own
// (the day that is finished).
export function Stamp({ label, tone = "stamp", icon, small, large, tilt = -3, decorative, thump, delay, style }) {
  const t = toneOf(tone);
  const k = useThump(thump, delay);
  return (
    <Animated.View
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : label}
      accessibilityElementsHidden={!!decorative}
      importantForAccessibility={decorative ? "no-hide-descendants" : "auto"}
      style={[
        styles.stampOuter,
        { borderColor: t.fg, transform: [{ rotate: `${tilt}deg` }, { scale: k.scale }], opacity: k.opacity },
        small && styles.stampOuterSmall,
        large && styles.stampOuterLarge,
        style,
      ]}
    >
      <View style={[styles.stampInner, { borderColor: t.fg }, small && styles.stampInnerSmall, large && styles.stampInnerLarge]}>
        {icon ? <Icon name={icon} size={large ? 22 : small ? 11 : 13} color={t.fg} /> : null}
        <Text style={[small ? type.numeralSmall : large ? type.heading : type.caption, styles.stampText, { color: t.fg }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Animated.View>
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
        <View {...props} style={[round(r), { backgroundColor: bg, padding }, tone !== "sunk" && styles.ticketEdge, style]}>
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
          <Icon name={icon} size={20} color={t.fg} />
        </View>
      ) : null}
      <View style={styles.rowText}>
        {title != null ? <Text style={type.name} numberOfLines={2}>{title}</Text> : null}
        {subtitle ? <Text style={[type.subhead, styles.rowSubtitle]} numberOfLines={2}>{subtitle}</Text> : null}
        {children}
      </View>
      {right ? right : null}
      {chevron ? <Icon name="chevron-forward" size={18} color={THEME.inkFaint} /> : null}
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
      {uri ? <Image source={{ uri }} style={{ width: size, height: size }} /> : <Icon name={icon} size={Math.round(size * 0.46)} color={t.fg} />}
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
      <View style={styles.sectionRule} />
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={action.label}>
          <Text style={[type.caption, { color: THEME.mark, fontFamily: type.label.fontFamily, textDecorationLine: THEME.light ? "underline" : "none" }]}>{action.label}</Text>
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
  const borderColor = error ? THEME.stamp : active ? THEME.mark : THEME.hairStrong;
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
        selectionColor={THEME.mark}
        cursorColor={THEME.mark}
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
            <Text style={[type.label, { color: THEME.mark }]}>{right.label}</Text>
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
// A ticket with the icon on it, a title, one line of help and at most one main action.
export function EmptyState({ icon = "compass-outline", tone = "neutral", title, text, action, style }) {
  return (
    <View style={[styles.empty, style]}>
      <TicketArt icon={icon} tone={goldOnPaper(tone) ? "neutral" : tone} />
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
      <Icon name={icon} size={22} color={THEME.onAction} />
      <Text style={[type.label, { color: THEME.onAction }]}>{label}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  buttonBase: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1 },
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
  badge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: space.xs, height: 24, paddingHorizontal: space.sm + 2, borderRadius: radius.sm - 2, borderCurve: "continuous" },
  badgeText: { fontFamily: type.label.fontFamily, flexShrink: 1 },
  stampOuter: { alignSelf: "flex-start", borderWidth: 2, borderRadius: 7, padding: 2, backgroundColor: THEME.bgCard },
  stampOuterSmall: { borderWidth: 1.5, borderRadius: 6, padding: 1.5 },
  stampInner: { flexDirection: "row", alignItems: "center", gap: space.xs, borderWidth: 1, borderRadius: 4, paddingHorizontal: space.sm, paddingVertical: 3 },
  stampInnerSmall: { paddingHorizontal: space.xs + 2, paddingVertical: 1 },
  stampOuterLarge: { borderWidth: 3, borderRadius: 10, padding: 3 },
  stampInnerLarge: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: 6 },
  stampText: { fontFamily: type.label.fontFamily, letterSpacing: 1.1, textTransform: "uppercase" },
  // What makes a card a ticket on paper: a fine warm edge and a shadow like a sheet lying on a desk.
  // On the dark palettes depth comes from the lighter surface alone.
  ticketEdge: { ...paperEdge() },
  group: { backgroundColor: THEME.bgCard, overflow: "hidden", ...paperEdge() },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: THEME.hairStrong },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 56 },
  rowTile: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, gap: 2 },
  rowSubtitle: { color: THEME.inkMuted },
  thumb: { alignItems: "center", justifyContent: "center" },
  sectionTitle: { flexDirection: "row", alignItems: "center", gap: space.md, marginBottom: space.md },
  sectionRule: { flex: 1, height: 1, marginTop: 3, backgroundColor: THEME.hair },
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
  modalHeaderSide: { flex: 1, minWidth: 96 }, // "Enregistrer" must not wrap, even with a large system font
  modalHeaderAction: { minHeight: layout.minTouch, justifyContent: "center" },
  modalHeaderTitle: { flex: 2, textAlign: "center" },
  backHeader: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: layout.gutter, paddingTop: space.sm, paddingBottom: space.md },
  empty: { alignItems: "center", gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: layout.gutter },
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
    backgroundColor: THEME.action,
  },
}));
