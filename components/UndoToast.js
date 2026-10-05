import React, { useContext, useEffect, useRef } from "react";
import { Text, Pressable, Animated } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { THEME, space, layout, type, shadow, themedStyles } from "../lib/theme";
import { round } from "./ui";

const AUTO_DISMISS_MS = 5000;

// Controlled by the parent screen: pass `visible`, a `message`, and what to
// do on `onUndo` / when it times out (`onDismiss`). The parent is
// responsible for actually performing the delete right away and undoing it
// if the user taps "Annuler" before the timer runs out.
// It floats above the home indicator; screens leave `layout.tabBarClearance`
// of empty space under their content so it never hides anything.
export default function UndoToast({ visible, message, onUndo, onDismiss, undoLabel = "Annuler la suppression" }) {
  const translateY = useRef(new Animated.Value(80)).current;
  const timerRef = useRef(null);
  const insets = useContext(SafeAreaInsetsContext);

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 16, bounciness: 4 }).start();
      timerRef.current = setTimeout(() => {
        onDismiss && onDismiss();
      }, AUTO_DISMISS_MS);
    } else {
      Animated.timing(translateY, { toValue: 80, duration: 200, useNativeDriver: true }).start();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible, message]);

  if (!visible) return null;

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[styles.wrap, round("md"), { bottom: space.xl + (insets ? insets.bottom : 0), transform: [{ translateY }] }]}
    >
      <Text style={styles.message} numberOfLines={2}>
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={undoLabel}
        onPress={() => {
          if (timerRef.current) clearTimeout(timerRef.current);
          onUndo && onUndo();
        }}
        hitSlop={space.sm}
        style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
      >
        <Text style={styles.undoText}>Annuler</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = themedStyles(() => ({
  wrap: {
    position: "absolute",
    left: layout.gutter,
    right: layout.gutter,
    minHeight: 56,
    paddingLeft: space.lg,
    paddingRight: space.sm,
    backgroundColor: THEME.bgRaised,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    boxShadow: shadow.overlay,
  },
  message: { ...type.subhead, color: THEME.ink, flex: 1, paddingVertical: space.sm },
  action: { minHeight: layout.minTouch, paddingHorizontal: space.md, justifyContent: "center" },
  undoText: { ...type.label, color: THEME.mark },
}));
