import React, { useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";
import { THEME } from "../lib/theme";
import { FONTS } from "../lib/fonts";

const AUTO_DISMISS_MS = 5000;

// Controlled by the parent screen: pass `visible`, a `message`, and what to
// do on `onUndo` / when it times out (`onDismiss`). The parent is
// responsible for actually performing the delete right away and undoing it
// if the user taps "Annuler" before the timer runs out.
export default function UndoToast({ visible, message, onUndo, onDismiss }) {
  const translateY = useRef(new Animated.Value(80)).current;
  const timerRef = useRef(null);

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
    <Animated.View style={[styles.wrap, { transform: [{ translateY }] }]}>
      <Text style={styles.message} numberOfLines={1}>
        {message}
      </Text>
      <TouchableOpacity
        onPress={() => {
          if (timerRef.current) clearTimeout(timerRef.current);
          onUndo && onUndo();
        }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={styles.undoText}>Annuler</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: THEME.bgRaised,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  message: { color: THEME.ink, fontSize: 13.5, fontFamily: FONTS.body, flex: 1, marginRight: 12 },
  undoText: { color: THEME.teal, fontSize: 13.5, fontFamily: FONTS.bodySemiBold },
});
