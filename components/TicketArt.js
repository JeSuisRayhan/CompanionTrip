import React from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";
import Icon from "./Icon";
import { TONES } from "../lib/theme";

// The picture of an empty screen: a small ticket, a little crooked, with the icon of the thing that is
// missing on it. Drawn, so it follows the palette and costs no asset.
const W = 140;
const H = 100;
const TICKET =
  "M16 14 H92 a8 8 0 0 0 16 0 H124 a8 8 0 0 1 8 8 V78 a8 8 0 0 1 -8 8 H108 a8 8 0 0 0 -16 0 H16 a8 8 0 0 1 -8 -8 V22 a8 8 0 0 1 8 -8 Z";

export default function TicketArt({ icon, tone = "neutral" }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <View style={styles.art} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Path d={TICKET} fill={t.bg} stroke={t.fg} strokeWidth={2} strokeLinejoin="round" />
        <Path d="M100 26 V74" stroke={t.fg} strokeOpacity={0.5} strokeWidth={2} strokeDasharray="2 5" strokeLinecap="round" fill="none" />
        <Path d="M113 40 H123 M113 50 H123 M113 60 H119" stroke={t.fg} strokeOpacity={0.4} strokeWidth={2} strokeLinecap="round" fill="none" />
        <Path d="M20 70 H44" stroke={t.fg} strokeOpacity={0.35} strokeWidth={2} strokeLinecap="round" fill="none" />
      </Svg>
      <View style={styles.icon}>
        <Icon name={icon} size={32} color={t.fg} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  art: { width: W, height: H, transform: [{ rotate: "-5deg" }], marginBottom: 8 },
  icon: { position: "absolute", left: 22, top: 26, width: 64, height: 44, alignItems: "center", justifyContent: "center" },
});
