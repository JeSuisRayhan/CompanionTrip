// "Montrer au chauffeur": what to put on the screen held out to a taxi driver for a step or a hotel.
import { splitTitlePlace } from "./script";

// { name, address, local } or null when the step has nothing to show. `local` is the address written in the
// local language (typed by the person: nothing here can translate it), `address` the one of the step.
export function driverCard(step) {
  if (!step) return null;
  const local = String(step.localAddress || "").trim();
  const split = step.address ? null : splitTitlePlace(step.title || "");
  const address = String(step.address || "").trim() || (split && split.place) || "";
  if (!local && !address) return null;
  return { name: split ? split.title : step.title || "", address, local };
}

// A size that fills the screen without a long address running off it.
export function bigTextSize(text) {
  const n = String(text || "").length;
  if (n <= 28) return 44;
  if (n <= 60) return 36;
  if (n <= 110) return 30;
  return 24;
}
