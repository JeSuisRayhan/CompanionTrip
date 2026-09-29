// Design tokens — the single source of truth for every screen.
//
// Rules (see DESIGN_PLAN): screens import components, components import
// tokens. A colour, size or spacing that appears twice lives here.
// THEME and CARD_SHADOW keep their original names so older code still works.

// ---------- Colour ----------
export const THEME = {
  // Surfaces (night plum, stepping up in lightness)
  bg: "#170F1F",
  surfaceSunk: "#1E1528",
  bgCard: "#241A31",
  bgCardAlt: "#2D2039",
  bgRaised: "#392A49",

  // Text
  ink: "#F8F1FA",
  inkMuted: "#BCA9CC",
  inkFaint: "#9A86AB", // 5:1 on bgCard (was #846F94, 3.7:1)
  placeholder: "#7A6689",
  onGold: "#170F1F",

  // Accents. gold = act / today, teal = done / live, stamp = attention.
  gold: "#F4B740",
  goldDim: "#3D2E12",
  teal: "#3FD6C0",
  tealDim: "#123832",
  stamp: "#FF6B7A",
  stampDim: "#3D1B22",
  coral: "#FF7A59",
  coralDim: "#3D2013",
  pink: "#F2679D",
  pinkDim: "#3A1828",
  blue: "#6FA1FF",
  blueDim: "#182A47",
  nature: "#7BD88F",
  natureDim: "#16301F",
  violet: "#B48CFF",
  violetDim: "#2A1F47",
  sand: "#E8C9A0",
  sandDim: "#3A2E1E",

  // Lines and overlays. Hairlines are ink at low alpha, never a solid grey.
  border: "#40304F",
  borderLight: "#5A44703a",
  hair: "rgba(248, 241, 250, 0.08)",
  hairStrong: "rgba(248, 241, 250, 0.16)",
  scrim: "rgba(23, 15, 31, 0.72)",
  pressed: "rgba(248, 241, 250, 0.06)",
};

// Foreground + tinted background pairs, so a "tone" is one name everywhere.
export const TONES = {
  gold: { fg: THEME.gold, bg: THEME.goldDim },
  teal: { fg: THEME.teal, bg: THEME.tealDim },
  stamp: { fg: THEME.stamp, bg: THEME.stampDim },
  coral: { fg: THEME.coral, bg: THEME.coralDim },
  pink: { fg: THEME.pink, bg: THEME.pinkDim },
  blue: { fg: THEME.blue, bg: THEME.blueDim },
  nature: { fg: THEME.nature, bg: THEME.natureDim },
  violet: { fg: THEME.violet, bg: THEME.violetDim },
  sand: { fg: THEME.sand, bg: THEME.sandDim },
  neutral: { fg: THEME.inkMuted, bg: THEME.bgCardAlt },
};

// ---------- Space (4-pt grid, named by size) ----------
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

// Screen edge padding. One value, used by every screen.
export const layout = {
  gutter: 20,
  minTouch: 44,
  tabBarClearance: 96, // room under lists for the floating action button
};

// ---------- Radius (one per role) ----------
export const radius = {
  sm: 10, // small controls, thumbnails
  md: 14, // buttons, fields
  lg: 20, // grouped lists, sheets
  xl: 28, // hero card
  full: 999, // chips, pills, round buttons
};

// ---------- Type ----------
// Families: Space Grotesk for titles and place names, Inter for text,
// IBM Plex Mono only for real numbers (times, prices, counters).
const F = {
  head: "SpaceGrotesk_700Bold",
  headSemi: "SpaceGrotesk_600SemiBold",
  headMed: "SpaceGrotesk_500Medium",
  body: "Inter_400Regular",
  bodyMed: "Inter_500Medium",
  bodySemi: "Inter_600SemiBold",
  mono: "IBMPlexMono_400Regular",
  monoMed: "IBMPlexMono_500Medium",
};

export const type = {
  display: { fontFamily: F.head, fontSize: 34, lineHeight: 38, letterSpacing: -0.7, color: THEME.ink },
  title: { fontFamily: F.head, fontSize: 26, lineHeight: 30, letterSpacing: -0.4, color: THEME.ink },
  heading: { fontFamily: F.headSemi, fontSize: 19, lineHeight: 24, letterSpacing: -0.2, color: THEME.ink },
  name: { fontFamily: F.headSemi, fontSize: 16, lineHeight: 22, letterSpacing: -0.1, color: THEME.ink }, // place / trip / row names
  label: { fontFamily: F.bodySemi, fontSize: 16, lineHeight: 22, color: THEME.ink },
  body: { fontFamily: F.body, fontSize: 15, lineHeight: 22, color: THEME.ink },
  subhead: { fontFamily: F.body, fontSize: 14, lineHeight: 20, color: THEME.inkMuted },
  caption: { fontFamily: F.bodyMed, fontSize: 12, lineHeight: 16, color: THEME.inkMuted },
  numeral: { fontFamily: F.monoMed, fontSize: 15, lineHeight: 20, color: THEME.ink },
  numeralSmall: { fontFamily: F.mono, fontSize: 12, lineHeight: 16, color: THEME.inkMuted },
  numeralLarge: { fontFamily: F.monoMed, fontSize: 40, lineHeight: 44, letterSpacing: -1, color: THEME.ink },
};

// ---------- Elevation (boxShadow strings, New Architecture) ----------
// On a dark UI, depth comes mostly from a lighter surface; shadows stay soft.
export const shadow = {
  raised: "0 6px 18px rgba(0, 0, 0, 0.32)",
  overlay: "0 12px 32px rgba(0, 0, 0, 0.5)",
  fab: "0 8px 20px rgba(244, 183, 64, 0.28), 0 2px 6px rgba(0, 0, 0, 0.45)",
};

// ---------- Motion ----------
export const motion = {
  fast: 150, // press / toggle feedback
  base: 250, // element enter / exit
  slow: 400, // large surfaces
};

// Legacy shadow (shadow* / elevation props). New code uses `shadow` above.
export const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.22,
  shadowRadius: 10,
  elevation: 4,
};
