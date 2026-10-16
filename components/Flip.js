// The departure board: digits on tiles split in two halves by a hinge, lit on an ink plate. One flip number per
// screen (the one that counts now); the status itself stays a stamp.
import React, { createContext, useContext } from "react";
import { View, Text } from "react-native";
import { THEME, LIT, FONTS, shadow, themedStyles } from "../lib/theme";
import { useTripInk } from "../lib/tripInk";

const SIZES = {
  sm: { w: 30, h: 44, r: 6, font: 32, gap: 4, sep: 24, hinge: 1.5, notch: 0 },
  md: { w: 44, h: 64, r: 8, font: 46, gap: 5, sep: 34, hinge: 2, notch: 3.75 },
  lg: { w: 56, h: 80, r: 9, font: 58, gap: 5, sep: 34, hinge: 2, notch: 3.75 },
  xl: { w: 64, h: 92, r: 10, font: 68, gap: 5, sep: 52, hinge: 2, notch: 3.75 },
};

// Characters that are drawn between the tiles, not on one.
const SEPARATORS = [":", "/", ",", ".", "-", "−"];

// True inside a Plate: its tiles are a step lighter than the plate, with no shadow of their own.
const OnPlateContext = createContext(false);

function Tile({ ch, s, color, onPlate }) {
  const top = onPlate ? THEME.plateTileTop : THEME.plateTop;
  const bottom = onPlate ? THEME.plateTileBottom : THEME.plateBottom;
  return (
    <View style={[{ width: s.w, height: s.h, borderRadius: s.r, backgroundColor: bottom }, styles.tile, !onPlate && { boxShadow: "0 3px 6px -2px rgba(27, 36, 48, 0.5)" }]}>
      <View style={[styles.top, { height: s.h / 2, backgroundColor: top }]} />
      {s.notch ? (
        <>
          <View style={[styles.notch, { width: s.notch * 2, height: s.notch * 2, borderRadius: s.notch, left: -s.notch, top: s.h / 2 - s.notch }]} />
          <View style={[styles.notch, { width: s.notch * 2, height: s.notch * 2, borderRadius: s.notch, right: -s.notch, top: s.h / 2 - s.notch }]} />
        </>
      ) : null}
      <Text style={[styles.digit, { fontSize: s.font, lineHeight: s.font, color }]} allowFontScaling={false}>{ch}</Text>
      <View style={[styles.hinge, { top: s.h / 2 - s.hinge / 2, height: s.hinge }]} />
      <View style={[styles.hingeLight, { top: s.h / 2 + s.hinge / 2 }]} />
    </View>
  );
}

// value: "84", "14:30", "5/5", "12,5". tone: "trip" (the ink of the trip), "gold" (what comes next), "red" (over) or "plain".
export default function Flip({ value, size = "md", tone = "trip", label, style }) {
  const ink = useTripInk();
  const onPlate = useContext(OnPlateContext);
  const s = SIZES[size] || SIZES.md;
  const color = tone === "gold" ? LIT.gold : tone === "red" ? LIT.stamp : tone === "plain" ? THEME.plateInk : ink.lit;
  const chars = String(value).split("");
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label || String(value)} style={[styles.row, { gap: s.gap }, style]}>
      {chars.map((ch, i) =>
        SEPARATORS.includes(ch) ? (
          <Text key={i} style={[styles.sep, { fontSize: s.sep, lineHeight: s.sep, color: onPlate ? THEME.plateInk : THEME.ink }]} importantForAccessibility="no" allowFontScaling={false}>{ch}</Text>
        ) : (
          <Tile key={i} ch={ch} s={s} color={color} onPlate={onPlate} />
        )
      )}
    </View>
  );
}

// The plate itself, for the number that counts: a caption in small capitals above, the tiles below.
export function Plate({ cap, capRight, children, style }) {
  return (
    <OnPlateContext.Provider value={true}>
      <View style={[styles.plate, style]}>
        {cap || capRight ? (
          <View style={styles.cap}>
            <Text style={styles.capText}>{cap}</Text>
            {capRight ? <Text style={styles.capText}>{capRight}</Text> : null}
          </View>
        ) : null}
        {children}
      </View>
    </OnPlateContext.Provider>
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start" },
  tile: { overflow: "hidden", alignItems: "center", justifyContent: "center" },
  top: { position: "absolute", left: 0, right: 0, top: 0 },
  notch: { position: "absolute", backgroundColor: THEME.plateLine },
  digit: { fontFamily: FONTS.monoSemi, includeFontPadding: false, textAlign: "center" },
  hinge: { position: "absolute", left: 0, right: 0, backgroundColor: THEME.plateLine },
  hingeLight: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: "rgba(255, 255, 255, 0.07)" },
  sep: { fontFamily: FONTS.monoSemi, includeFontPadding: false, paddingHorizontal: 1 },
  plate: { backgroundColor: THEME.plate, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, gap: 10, boxShadow: shadow.raised },
  cap: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  capText: { fontFamily: FONTS.mono, fontSize: 12, lineHeight: 12, letterSpacing: 1.7, textTransform: "uppercase", color: THEME.plateDim },
}));
