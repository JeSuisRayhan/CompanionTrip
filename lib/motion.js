import { useEffect, useRef, useState } from "react";
import { Animated, AccessibilityInfo } from "react-native";

// Motion in the app is decoration (a stamp lands, tickets slide in, a card gives under the finger). With the
// system's "reduce motion" setting on, none of it plays: things are simply there.

let reduce = false;
let started = false;
const listeners = new Set();

function set(value) {
  reduce = !!value;
  listeners.forEach((l) => l(reduce));
}

function start() {
  if (started) return;
  started = true;
  try {
    if (AccessibilityInfo.isReduceMotionEnabled) AccessibilityInfo.isReduceMotionEnabled().then(set).catch(() => {});
    if (AccessibilityInfo.addEventListener) AccessibilityInfo.addEventListener("reduceMotionChanged", set);
  } catch (e) {
    // no accessibility info on this platform: motion stays on
  }
}

// The setting right now, for the one-shot animations that decide when they mount.
export function reduceMotionNow() {
  start();
  return reduce;
}

export function useReduceMotion() {
  start();
  const [value, setValue] = useState(reduce);
  useEffect(() => {
    listeners.add(setValue);
    setValue(reduce);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

// An ink stamp coming down: it starts big and transparent, lands with a small bounce. `delay` in ms.
// Not enabled (or reduce motion): it is simply there, no animation is created.
export function useThump(enabled, delay = 0, from = 1.7) {
  const play = useRef(!!enabled && !reduceMotionNow()).current;
  const scale = useRef(new Animated.Value(play ? from : 1)).current;
  const opacity = useRef(new Animated.Value(play ? 0 : 1)).current;
  useEffect(() => {
    if (!play) return undefined;
    const anim = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 80, delay, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, delay, speed: 30, bounciness: 9, useNativeDriver: true }),
    ]);
    anim.start();
    return () => {
      if (anim.stop) anim.stop();
    };
  }, []);
  return { scale, opacity };
}

// A card gives a little under the finger: scale on press in, back on release.
export function usePressScale(to = 0.98) {
  const scale = useRef(new Animated.Value(1)).current;
  const move = (value, speed, bounciness) => {
    if (reduceMotionNow()) return;
    Animated.spring(scale, { toValue: value, useNativeDriver: true, speed, bounciness }).start();
  };
  return {
    scale,
    onPressIn: () => move(to, 40, 0),
    onPressOut: () => move(1, 24, 6),
  };
}
