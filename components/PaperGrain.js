import React from "react";
import { View, Image, StyleSheet } from "react-native";
import { THEME } from "../lib/theme";

// A faint paper grain over the whole app, on the light palette only: a small tile of ink specks and pale
// fibres, repeated. It takes no touch and changes no colour you could name; it only breaks the flatness of
// a screen-sized block of one tone. (Dark palettes stay clean.)
export default function PaperGrain() {
  if (!THEME.light) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image source={require("../assets/grain.png")} resizeMode="repeat" fadeDuration={0} style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />
    </View>
  );
}
