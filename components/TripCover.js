import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { TONES, space, type, themedStyles } from "../lib/theme";
import { tripRange } from "../lib/dates";

// The cover of a trip: a drawing on the tone of its kind (long trip = gold, short = teal, park = pink), with
// a postmark that says where and when. The photo of the trip, when there is one, is laid over it: with no
// network (or no photo) the cover is still a picture, never an empty block.
//   long trip  -> a flight route over a globe grid
//   short trip -> ripples around a point, like a map's contour lines
//   park       -> bunting and stars
// Children are drawn on top (stamp, buttons...).

export function coverTone(trip) {
  return trip.tripType === "park" ? "pink" : trip.tripType === "short" ? "teal" : "gold";
}

const MONTHS = ["JANV", "FÉVR", "MARS", "AVR", "MAI", "JUIN", "JUIL", "AOÛT", "SEPT", "OCT", "NOV", "DÉC"];

// "Tokyo, Japon" -> "TOKYO"; no place: the first word of the name.
export function postmarkCity(trip) {
  const raw = (trip.defaultLocation || trip.name || "").split(",")[0].trim();
  const word = raw.length > 11 ? raw.split(/\s+/)[0] : raw;
  return (word || "VOYAGE").slice(0, 10).toUpperCase();
}

export function postmarkDate(trip) {
  const { start } = tripRange(trip);
  if (!start) return "À DATER";
  return `${parseInt(start.slice(8, 10), 10)} ${MONTHS[parseInt(start.slice(5, 7), 10) - 1] || ""}`.trim();
}

// A four-point star centred on (x, y).
const star = (x, y, r) => `M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z`;

function Art({ kind, fg }) {
  if (kind === "park") {
    const flags = [];
    for (let i = 1; i <= 9; i++) {
      const t = i / 10;
      const x = -10 + 380 * t;
      const y = (1 - t) * (1 - t) * 28 + 2 * (1 - t) * t * 78 + t * t * 28;
      flags.push(<Path key={i} d={`M${x - 9} ${y} L${x + 9} ${y} L${x} ${y + 18}Z`} fill={fg} fillOpacity={i % 2 ? 0.2 : 0.36} />);
    }
    return (
      <>
        <Path d="M-10 28 Q180 78 370 28" stroke={fg} strokeOpacity={0.4} strokeWidth={1.5} fill="none" />
        {flags}
        <Path d={star(66, 150, 15)} fill={fg} fillOpacity={0.3} />
        <Path d={star(150, 176, 8)} fill={fg} fillOpacity={0.22} />
        <Path d={star(300, 152, 19)} fill={fg} fillOpacity={0.26} />
      </>
    );
  }
  if (kind === "short") {
    return (
      <>
        {[28, 54, 82, 112, 144].map((r) => (
          <Circle key={r} cx={270} cy={118} r={r} stroke={fg} strokeOpacity={0.2} strokeWidth={1.2} fill="none" />
        ))}
        <Path d="M16 172 Q90 118 150 150 T270 118" stroke={fg} strokeOpacity={0.55} strokeWidth={2} strokeDasharray="2 7" strokeLinecap="round" fill="none" />
        <Circle cx={16} cy={172} r={5} fill={fg} fillOpacity={0.7} />
        <Circle cx={270} cy={118} r={6} fill={fg} fillOpacity={0.7} />
      </>
    );
  }
  return (
    <>
      {["M-10 150 Q180 100 370 150", "M-10 108 Q180 58 370 108", "M-10 66 Q180 16 370 66"].map((d) => (
        <Path key={d} d={d} stroke={fg} strokeOpacity={0.16} strokeWidth={1} fill="none" />
      ))}
      {["M90 -10 Q68 100 90 210", "M180 -10 Q180 100 180 210", "M270 -10 Q292 100 270 210"].map((d) => (
        <Path key={d} d={d} stroke={fg} strokeOpacity={0.14} strokeWidth={1} fill="none" />
      ))}
      <Path d="M40 156 C120 40 230 36 322 122" stroke={fg} strokeOpacity={0.6} strokeWidth={2} strokeDasharray="2 7" strokeLinecap="round" fill="none" />
      <Circle cx={40} cy={156} r={5.5} fill={fg} fillOpacity={0.75} />
      <Circle cx={322} cy={122} r={6} stroke={fg} strokeOpacity={0.75} strokeWidth={2} fill="none" />
    </>
  );
}

// The cancellation of a letter: wavy lines, then the ring with the place and the day.
function Postmark({ trip, fg, style }) {
  return (
    <View style={[styles.postmark, style]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={64} height={44} viewBox="0 0 64 44">
        {[6, 17, 28, 39].map((y) => (
          <Path key={y} d={`M0 ${y} q8 -6 16 0 t16 0 t16 0 t16 0`} stroke={fg} strokeOpacity={0.5} strokeWidth={1.5} fill="none" strokeLinecap="round" />
        ))}
      </Svg>
      <View style={[styles.ringOuter, { borderColor: fg }]}>
        <View style={[styles.ringInner, { borderColor: fg }]}>
          <Text style={[styles.city, { color: fg }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {postmarkCity(trip)}
          </Text>
          <View style={[styles.rule, { backgroundColor: fg }]} />
          <Text style={[styles.day, { color: fg }]} numberOfLines={1}>
            {postmarkDate(trip)}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function TripCover({ trip, height = 148, photoUri, postmarkStyle, showPostmark = true, style, children }) {
  const tone = coverTone(trip);
  const t = TONES[tone];
  return (
    <View style={[styles.cover, { height, backgroundColor: t.bg }, style]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width="100%" height="100%" viewBox="0 0 360 200" preserveAspectRatio="xMidYMid slice">
          <Art kind={tone === "pink" ? "park" : tone === "teal" ? "short" : "long"} fg={t.fg} />
        </Svg>
      </View>
      {photoUri ? <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
      {!photoUri && showPostmark ? <Postmark trip={trip} fg={t.fg} style={postmarkStyle} /> : null}
      {children}
    </View>
  );
}

const styles = themedStyles(() => ({
  cover: { overflow: "hidden" },
  postmark: { position: "absolute", right: space.lg, top: space.xl + 8, flexDirection: "row", alignItems: "center", transform: [{ rotate: "-9deg" }], opacity: 0.92 },
  ringOuter: { width: 96, height: 96, borderRadius: 48, borderWidth: 2, padding: 3, marginLeft: -10 },
  ringInner: { flex: 1, borderRadius: 44, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
  city: { ...type.caption, fontFamily: type.label.fontFamily, fontSize: 10, lineHeight: 13, letterSpacing: 0.4 },
  rule: { width: 40, height: 1, marginVertical: 3, opacity: 0.6 },
  day: { ...type.numeralSmall, fontSize: 11, lineHeight: 14 },
}));
