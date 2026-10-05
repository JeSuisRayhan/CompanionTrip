import React, { useEffect, useRef } from "react";
import { View, Animated, AccessibilityInfo, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { Stamp } from "./ui";
import { reduceMotionNow } from "../lib/motion";
import { space } from "../lib/theme";

// "Journée faite", inked in the middle of the screen when the last step of a day is ticked: it comes down,
// stays a moment, fades. It never takes a touch. The parent mounts it to play it and unmounts it on `onHide`.
const HOLD = 1300;
const FADE = 350;

export default function DayDoneStamp({ onHide }) {
  const out = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (AccessibilityInfo.announceForAccessibility) AccessibilityInfo.announceForAccessibility("Journée terminée");
    const still = reduceMotionNow();
    if (!still) Animated.timing(out, { toValue: 0, duration: FADE, delay: HOLD, useNativeDriver: true }).start();
    const id = setTimeout(onHide, still ? HOLD + FADE : HOLD + FADE + 50);
    return () => clearTimeout(id);
  }, []);
  return (
    <View style={styles.layer} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={{ opacity: out }}>
        <Stamp label="Journée faite" tone="teal" icon="checkmark-circle" large tilt={-6} thump />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xl },
});
