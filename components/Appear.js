import React, { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { reduceMotionNow } from "../lib/motion";

// A block that slides up a little and fades in when it first shows. `index` staggers a list: each item comes
// 70 ms after the one before (the first six; the rest come with the sixth). Nothing plays with "reduce motion".
export default function Appear({ index = 0, style, children }) {
  const play = useRef(!reduceMotionNow()).current;
  const progress = useRef(new Animated.Value(play ? 0 : 1)).current;
  useEffect(() => {
    if (!play) return undefined;
    const anim = Animated.timing(progress, { toValue: 1, duration: 340, delay: Math.min(index, 5) * 70, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    anim.start();
    return () => {
      if (anim.stop) anim.stop();
    };
  }, []);
  return (
    <Animated.View style={[style, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>{children}</Animated.View>
  );
}
