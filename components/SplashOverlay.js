import React, { useRef } from "react";
import { Animated, Easing, AccessibilityInfo } from "react-native";
import * as SplashScreen from "expo-splash-screen";

// The native splash screen cannot animate, so the same logo is drawn again by the app, right on top of it,
// and spins while the app loads. Same image, same size (288 dp, centred) and same background as the native
// one: the hand-over is not visible. A turn always runs to its end, so the logo never stops half-way, then
// the whole thing fades out over the first screen.
export const SPLASH_BACKGROUND = "#17120E";
const LOGO_SIZE = 288;
const TURN_MS = 900;
const FADE_MS = 280;

export default function SplashOverlay({ ready, onDone }) {
  const turn = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const calm = useRef(false); // "reduce motion" in the system settings: no spinning
  const started = useRef(false);

  function fadeOut() {
    Animated.timing(fade, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => onDone && onDone());
  }

  function spin() {
    if (calm.current) {
      if (readyRef.current) fadeOut();
      else setTimeout(spin, 100);
      return;
    }
    turn.setValue(0);
    Animated.timing(turn, { toValue: 1, duration: TURN_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      if (readyRef.current) fadeOut();
      else spin(); // still loading: another turn
    });
  }

  // Called when the overlay is on screen: only then is the native splash screen taken away, so there is no gap.
  function begin() {
    if (started.current) return;
    started.current = true;
    SplashScreen.hideAsync().catch(() => {});
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled())
      .catch(() => false)
      .then((reduced) => {
        calm.current = !!reduced;
        spin();
      });
  }

  return (
    <Animated.View
      pointerEvents="auto"
      onLayout={begin}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: SPLASH_BACKGROUND, alignItems: "center", justifyContent: "center", opacity: fade }}
    >
      <Animated.Image
        source={require("../assets/splash-icon.png")}
        style={{ width: LOGO_SIZE, height: LOGO_SIZE, transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}
      />
    </Animated.View>
  );
}
