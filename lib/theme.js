// Design tokens ported directly from the Claude-artifact / PWA version.
// Same values everywhere so the native app looks and feels identical.
export const THEME = {
  bg: "#170F1F",
  bgCard: "#241A31",
  bgCardAlt: "#2D2039",
  bgRaised: "#392A49",
  ink: "#F8F1FA",
  inkMuted: "#BCA9CC",
  inkFaint: "#846F94",
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
  border: "#40304F",
  borderLight: "#5A44703a",
};

// Shared soft-shadow style for elevated cards — subtle depth without looking
// heavy, consistent across every screen.
export const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.22,
  shadowRadius: 10,
  elevation: 4,
};
