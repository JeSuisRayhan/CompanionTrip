import React, { useRef } from "react";
import { Animated, Pressable } from "react-native";

// Wraps any pressable content with a subtle scale-down-on-press animation —
// makes buttons feel tactile instead of just instantly toggling opacity.
// Drop-in replacement for TouchableOpacity: same onPress/style/children API.
export default function AnimatedPressable({ onPress, style, children, disabled, ...props }) {
  const scale = useRef(new Animated.Value(1)).current;

  function pressIn() {
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  }
  function pressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
  }

  return (
    <Pressable onPress={disabled ? undefined : onPress} onPressIn={pressIn} onPressOut={pressOut} disabled={disabled} {...props}>
      <Animated.View style={[style, { transform: [{ scale }] }, disabled && { opacity: 0.5 }]}>{children}</Animated.View>
    </Pressable>
  );
}
