// Design tokens — the single source of truth for every screen.
//
// Rules (see DESIGN_PLAN): screens import components, components import
// tokens. A colour, size or spacing that appears twice lives here.
// THEME and CARD_SHADOW keep their original names so older code still works.

// ---------- Colour ----------
// Accents never change: gold = act / today, teal = done / live, stamp =
// attention. Surfaces, text and lines come from the palette the person picked
// (see PALETTES below); applyPalette() rewrites them in place, so every
// `THEME.bg` read at render time is always current.
export const THEME = {
  // Accents
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
  // Surfaces, text and lines: filled in by applyPalette() at the bottom.
};

// ---------- Palettes ----------
// Five dark palettes, same structure. Surfaces step up in lightness
// (bg < surfaceSunk < bgCard < bgCardAlt < bgRaised). Every text colour keeps
// at least 5:1 (inkFaint) and 7.5:1 (inkMuted) on bgCard.
export const PALETTES = {
  espresso: {
    label: "Espresso",
    hint: "Brun chaud",
    tokens: { bg: "#17120E", surfaceSunk: "#1D1712", bgCard: "#261E17", bgCardAlt: "#30261D", bgRaised: "#3E3226", border: "#43362A", ink: "#F8F2EA", inkMuted: "#C0B09C", inkFaint: "#9E8E7B", placeholder: "#7E6F5E" },
  },
  encre: {
    label: "Encre",
    hint: "Bleu nuit",
    tokens: { bg: "#0D1520", surfaceSunk: "#111B29", bgCard: "#172335", bgCardAlt: "#1E2D42", bgRaised: "#283A54", border: "#2C3E58", ink: "#F2F6FB", inkMuted: "#A9B8CC", inkFaint: "#8496AD", placeholder: "#66788F" },
  },
  foret: {
    label: "Forêt",
    hint: "Vert nuit",
    tokens: { bg: "#0C1512", surfaceSunk: "#101C18", bgCard: "#16241F", bgCardAlt: "#1D2E28", bgRaised: "#273D35", border: "#2B4239", ink: "#F1F7F3", inkMuted: "#A6BDB2", inkFaint: "#859C91", placeholder: "#667D72" },
  },
  ardoise: {
    label: "Ardoise",
    hint: "Gris neutre",
    tokens: { bg: "#121316", surfaceSunk: "#17181C", bgCard: "#1E2025", bgCardAlt: "#272A30", bgRaised: "#33363E", border: "#363A42", ink: "#F4F5F7", inkMuted: "#B0B4BC", inkFaint: "#8C919B", placeholder: "#6D727C" },
  },
  prune: {
    label: "Prune",
    hint: "Violet d'origine",
    tokens: { bg: "#170F1F", surfaceSunk: "#1E1528", bgCard: "#241A31", bgCardAlt: "#2D2039", bgRaised: "#392A49", border: "#40304F", ink: "#F8F1FA", inkMuted: "#BCA9CC", inkFaint: "#9A86AB", placeholder: "#7A6689" },
  },
};
export const PALETTE_IDS = Object.keys(PALETTES);
export const DEFAULT_PALETTE = "espresso";

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ");

// "#RRGGBB" + opacity -> "rgba(r, g, b, a)": for scrims and fades that must
// follow the background instead of a fixed colour.
export function withAlpha(hex, alpha) {
  return `rgba(${rgbOf(hex)}, ${alpha})`;
}

function surfaceTokens(t) {
  return {
    ...t,
    onGold: t.bg,
    // Lines and overlays. Hairlines are ink at low alpha, never a solid grey.
    borderLight: `${t.bgRaised}66`,
    hair: withAlpha(t.ink, 0.08),
    hairStrong: withAlpha(t.ink, 0.16),
    scrim: withAlpha(t.bg, 0.72),
    pressed: withAlpha(t.ink, 0.06),
  };
}

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

// ---------- Live palette ----------
// Styles are read through themedStyles(): the object is rebuilt the first time
// it is read after a palette change. A screen keeps writing `styles.card`.
let paletteId = null;
let version = 0;
const listeners = new Set();

// Which ramp steps are plain text and which are secondary text.
const INK_STEPS = ["display", "title", "heading", "name", "label", "body", "numeral", "numeralLarge"];
const MUTED_STEPS = ["subhead", "caption", "numeralSmall"];

export function currentPalette() {
  return paletteId;
}

export function getThemeVersion() {
  return version;
}

export function subscribeTheme(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Returns true when the palette actually changed.
export function applyPalette(id) {
  const next = PALETTES[id] ? id : DEFAULT_PALETTE;
  if (next === paletteId) return false;
  const first = paletteId === null;
  paletteId = next;
  Object.assign(THEME, surfaceTokens(PALETTES[next].tokens));
  TONES.neutral.fg = THEME.inkMuted;
  TONES.neutral.bg = THEME.bgCardAlt;
  INK_STEPS.forEach((k) => {
    type[k].color = THEME.ink;
  });
  MUTED_STEPS.forEach((k) => {
    type[k].color = THEME.inkMuted;
  });
  if (!first) {
    version += 1;
    listeners.forEach((fn) => fn(version));
  }
  return true;
}

export function themedStyles(factory) {
  let cache = null;
  let at = -1;
  const read = () => {
    if (at !== version) {
      cache = factory();
      at = version;
    }
    return cache;
  };
  return new Proxy({}, { get: (_, key) => read()[key] });
}

applyPalette(DEFAULT_PALETTE);
