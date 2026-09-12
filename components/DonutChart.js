import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { THEME } from "../lib/theme";
import { FONTS } from "../lib/fonts";

const SIZE = 160;
const STROKE = 20;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// segments: [{ value, color }]. Purely presentational — caller supplies totals.
export default function DonutChart({ segments, centerLabel, centerValue }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  let offsetSoFar = 0;

  return (
    <View style={styles.wrap}>
      <Svg width={SIZE} height={SIZE}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={THEME.bgCardAlt}
          strokeWidth={STROKE}
          fill="transparent"
        />
        {total > 0 &&
          segments
            .filter((seg) => seg.value > 0)
            .map((seg, i) => {
              const fraction = seg.value / total;
              const dashLength = fraction * CIRCUMFERENCE;
              const dashArray = `${dashLength} ${CIRCUMFERENCE - dashLength}`;
              const rotation = (offsetSoFar / total) * 360 - 90;
              offsetSoFar += seg.value;
              return (
                <Circle
                  key={i}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  stroke={seg.color}
                  strokeWidth={STROKE}
                  fill="transparent"
                  strokeDasharray={dashArray}
                  strokeLinecap="butt"
                  rotation={rotation}
                  origin={`${SIZE / 2}, ${SIZE / 2}`}
                />
              );
            })}
      </Svg>
      <View style={styles.centerLabel} pointerEvents="none">
        <Text style={styles.centerValue}>{centerValue}</Text>
        <Text style={styles.centerText}>{centerLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  centerLabel: { position: "absolute", alignItems: "center" },
  centerValue: { fontSize: 18, color: THEME.ink, fontFamily: FONTS.headingBold },
  centerText: { fontSize: 10, color: THEME.inkFaint, fontFamily: FONTS.bodyMedium, marginTop: 2 },
});
