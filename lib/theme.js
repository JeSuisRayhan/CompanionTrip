// Design tokens — the single source of truth for every screen.
//
// Rules (see DESIGN_PLAN): screens import components, components import
// tokens. A colour, size or spacing that appears twice lives here.
// THEME and CARD_SHADOW keep their original names so older code still works.

// ---------- Colour ----------
// Same roles in every palette: gold = act / today, teal = done / live, stamp =
// attention. Surfaces, text, lines AND the accents come from the palette the
// person picked (see PALETTES below): bright accents read well on a dark
// background, deep "ink" ones on paper. applyPalette() rewrites everything in
// place, so every `THEME.bg` read at render time is always current.
//
// Each accent is text-safe on its own palette (>= 4.5:1 on bgCard), so
// `color: THEME.teal` is always readable. Gold is the one that also fills
// shapes (button, today marker): `goldFill` is that shape colour and `onGold`
// the text on it; on the dark palettes goldFill and gold are the same colour.
// `onAccent` is the text on a filled tone.
const DARK_ACCENTS = {
  gold: "#F4B740",
  goldFill: "#F4B740",
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
};

// Stamp-pad inks for the paper palette.
const PAPER_ACCENTS = {
  gold: "#8A5700",
  goldFill: "#F0B53A",
  goldDim: "#F6E4B9",
  teal: "#0B6E62",
  tealDim: "#D2E9E2",
  stamp: "#B8283C",
  stampDim: "#F5D9D8",
  coral: "#A63F16",
  coralDim: "#F6DDCC",
  pink: "#AE2D69",
  pinkDim: "#F3D6E1",
  blue: "#2A5DB0",
  blueDim: "#D7E2F4",
  nature: "#25702F",
  natureDim: "#D8EBD8",
  violet: "#6842B3",
  violetDim: "#E3DAF3",
  sand: "#765826",
  sandDim: "#EEE2CC",
};

export const THEME = { ...DARK_ACCENTS };
// Surfaces, text and lines: filled in by applyPalette() at the bottom.

// A list written once at load time (types, categories) must not freeze the colours of the first palette:
// its `color` and `dim` are read from the live palette every time.
export function liveTone(name, props = {}) {
  const o = { ...props };
  Object.defineProperty(o, "color", { get: () => THEME[name], enumerable: true });
  Object.defineProperty(o, "dim", { get: () => THEME[`${name}Dim`], enumerable: true });
  return o;
}

// The tone a colour saved by an older version stands for ("#6FA1FF" -> "blue"), or null.
export function toneOfAccent(hex) {
  const wanted = String(hex || "").toLowerCase();
  const sets = [DARK_ACCENTS, PAPER_ACCENTS];
  for (const set of sets) {
    const found = Object.keys(set).find((k) => !k.endsWith("Dim") && k !== "goldFill" && set[k].toLowerCase() === wanted);
    if (found) return found;
  }
  return null;
}

// ---------- Palettes ----------
// Surfaces step up in lightness on the dark palettes (bg < surfaceSunk <
// bgCard < bgCardAlt < bgRaised) and step up in whiteness on the paper one
// (bg is the page, bgCard the ticket stock lying on it). Every text colour
// keeps at least 5:1 (inkFaint) and 7.5:1 (inkMuted) on bgCard.
export const PALETTES = {
  papier: {
    label: "Papier",
    hint: "Carnet clair",
    light: true,
    accents: PAPER_ACCENTS,
    tokens: { bg: "#F2EDE3", surfaceSunk: "#EAE4D7", bgCard: "#FBF8F2", bgCardAlt: "#EFE9DC", bgRaised: "#FFFFFF", border: "#D9D1BF", ink: "#1B2430", inkMuted: "#47505E", inkFaint: "#5C6573", placeholder: "#8C93A0" },
  },
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

// What the palette picker draws for a palette: its background, a card on it, its edge and its gold.
export function swatchOf(id) {
  const p = PALETTES[id];
  return { bg: p.tokens.bg, card: p.tokens.bgCard, border: p.tokens.border, accent: { ...DARK_ACCENTS, ...(p.accents || {}) }.goldFill };
}
export const DEFAULT_PALETTE = "papier";

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ");

// "#RRGGBB" + opacity -> "rgba(r, g, b, a)": for scrims and fades that must
// follow the background instead of a fixed colour.
export function withAlpha(hex, alpha) {
  return `rgba(${rgbOf(hex)}, ${alpha})`;
}

function surfaceTokens(t, light) {
  return {
    ...t,
    light: !!light,
    // Text on a gold shape, and on any other filled tone.
    onGold: light ? t.ink : t.bg,
    onAccent: light ? "#FFFDF8" : t.bg,
    // Lines and overlays. Hairlines are ink at low alpha, never a solid grey.
    borderLight: `${t.bgRaised}66`,
    hair: withAlpha(t.ink, light ? 0.1 : 0.08),
    hairStrong: withAlpha(t.ink, light ? 0.18 : 0.16),
    scrim: light ? withAlpha(t.ink, 0.5) : withAlpha(t.bg, 0.72), // dims what is behind a sheet
    veil: light ? withAlpha(t.bgCard, 0.93) : withAlpha(t.bg, 0.72), // a label laid over a map or a camera: ink text stays readable
    pressed: withAlpha(t.ink, light ? 0.05 : 0.06),
  };
}

// Foreground + tinted background pairs, so a "tone" is one name everywhere.
// Filled in by applyPalette() (the colours depend on the palette).
const TONE_NAMES = ["gold", "teal", "stamp", "coral", "pink", "blue", "nature", "violet", "sand"];
export const TONES = {
  ...Object.fromEntries(TONE_NAMES.map((k) => [k, { fg: THEME[k], bg: THEME[`${k}Dim`] }])),
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
// Tickets and notebooks have small corners: tighter than a typical app, and
// the bigger the surface, the bigger the radius.
export const radius = {
  sm: 8, // small controls, thumbnails
  md: 12, // buttons, fields
  lg: 16, // tickets, grouped lists, sheets
  xl: 22, // hero card
  full: 999, // chips, pills, round buttons
};

// ---------- Type ----------
// Families: Bricolage Grotesque for titles and place names, Inter for text,
// IBM Plex Mono only for real numbers (times, prices, counters).
const F = {
  head: "BricolageGrotesque_700Bold",
  headSemi: "BricolageGrotesque_600SemiBold",
  headMed: "BricolageGrotesque_500Medium",
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
// On paper they are warm brown, never grey, and sit under the object like a
// ticket lying on a desk (single light source, from above). `card` is what a
// ticket rests on: nothing at all on the dark palettes.
const DARK_SHADOWS = {
  card: "0 0 0 0 transparent",
  raised: "0 6px 18px rgba(0, 0, 0, 0.32)",
  overlay: "0 12px 32px rgba(0, 0, 0, 0.5)",
  fab: "0 8px 20px rgba(244, 183, 64, 0.28), 0 2px 6px rgba(0, 0, 0, 0.45)",
};
const PAPER_SHADOWS = {
  card: "0 1px 1px rgba(70, 48, 16, 0.06), 0 6px 14px -8px rgba(70, 48, 16, 0.24)",
  raised: "0 2px 3px rgba(70, 48, 16, 0.08), 0 10px 20px -10px rgba(70, 48, 16, 0.32)",
  overlay: "0 -6px 30px -6px rgba(50, 34, 10, 0.34)",
  fab: "0 10px 18px -6px rgba(27, 36, 48, 0.5), 0 2px 4px rgba(27, 36, 48, 0.2)",
};
export const shadow = { ...DARK_SHADOWS };

// The edge and the shadow of a card lying on paper; nothing on the dark palettes. Spread it into a card
// style written inside themedStyles(): `card: { backgroundColor: THEME.bgCard, ...paperEdge() }`.
export const paperEdge = () => (THEME.light ? { borderWidth: 1, borderColor: THEME.border, boxShadow: shadow.card } : null);

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
  const pal = PALETTES[next];
  Object.assign(THEME, DARK_ACCENTS, pal.accents || {}, surfaceTokens(pal.tokens, pal.light));
  // The colour of the main action and of "you are here" marks. On paper it is ink, so that gold stays for
  // "today / what comes next" and the eye knows where to go; the dark palettes keep gold for all of it.
  THEME.action = pal.light ? THEME.ink : THEME.goldFill;
  THEME.onAction = pal.light ? THEME.onAccent : THEME.onGold;
  THEME.mark = pal.light ? THEME.ink : THEME.gold;
  Object.assign(shadow, pal.light ? PAPER_SHADOWS : DARK_SHADOWS);
  TONE_NAMES.forEach((k) => {
    TONES[k].fg = THEME[k];
    TONES[k].bg = THEME[`${k}Dim`];
  });
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
