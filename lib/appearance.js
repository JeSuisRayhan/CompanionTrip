// The colour palette the person picked: saved on the phone, applied before the
// first screen is drawn, and switchable at any time (see theme.js).
import { applyPalette, currentPalette, PALETTES, DEFAULT_PALETTE } from "./theme";
import { getSetting, setSetting } from "./storage";

export const PALETTE_KEY = "palette";

export async function loadPalette() {
  const id = await getSetting(PALETTE_KEY);
  applyPalette(PALETTES[id] ? id : DEFAULT_PALETTE);
  return currentPalette();
}

export async function choosePalette(id) {
  if (!PALETTES[id]) return currentPalette();
  applyPalette(id);
  await setSetting(PALETTE_KEY, id);
  return id;
}
