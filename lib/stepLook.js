// How a step of a day is drawn: its tone, its glyph, what goes under its name and its price. Shared by the tabs of a trip
// and by the page of a day, so a step looks the same everywhere.
import { TYPES } from "./constants";
import { formatMoney, convertAmount } from "./budget";

// The means of transport a step names, as a glyph.
const MODE_ICON = { avion: "airplane", train: "train", bus: "bus", bateau: "boat", voiture: "car", autre: "car" };

// Which colour a step takes: where we sleep, what we eat, how we move, the rest.
export function stepTone(step) {
  return step.type === "repas" ? "gold" : step.type === "hotel" ? "stamp" : step.type === "transport" ? "blue" : "teal";
}

// The glyph of a step: the means of transport when there is one, else the one of its kind.
export function stepIcon(step) {
  if (step.type === "transport" && MODE_ICON[step.transportMode]) return MODE_ICON[step.transportMode];
  return (TYPES[step.type] || TYPES.activite).icon;
}

// The first line of the note of a step ("Fort face à la mer · 1 h"): what goes under its name.
export const noteOf = (step) => String(step.note || "").split("\n")[0].trim();

// The price of a step in the person's currency, rounded: an amount worked out from a rate is told with "≈".
// null for a step with no price, "Gratuit" for a price written as 0.
export function priceOf(step, rate, home, sameCurrency) {
  if (step.price == null || step.price === "") return null;
  const n = Number(step.price);
  if (!(n > 0)) return n === 0 ? "Gratuit" : null;
  return `${sameCurrency ? "" : "≈ "}${formatMoney(Math.round(convertAmount(n, rate)), home)}`;
}
