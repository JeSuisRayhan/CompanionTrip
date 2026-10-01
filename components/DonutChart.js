import React from "react";
import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { THEME, type, themedStyles } from "../lib/theme";

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
      {centerValue != null || centerLabel != null ? (
        <View style={styles.centerLabel} pointerEvents="none">
          {centerValue != null ? <Text style={styles.centerValue}>{centerValue}</Text> : null}
          {centerLabel != null ? <Text style={styles.centerText}>{centerLabel}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  centerLabel: { position: "absolute", alignItems: "center" },
  centerValue: { ...type.heading },
  centerText: { ...type.caption, color: THEME.inkFaint, marginTop: 2 },
}));
