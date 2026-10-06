// The way to a step, as the person told it: step.leg = { label, price, at, note }. A script's "10:30 Taxi vers l'hôtel 25 €"
// between two steps, or the price typed on the line between two steps, is kept here. Every part is optional.
// This file imports nothing: scripts, trips, budget and travel times all read it.

// The clean leg, or null when nothing usable is left.
export function cleanLeg(leg) {
  if (!leg || typeof leg !== "object") return null;
  const text = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const label = text(leg.label, 80);
  const note = text(leg.note, 200);
  const price = typeof leg.price === "number" && Number.isFinite(leg.price) && leg.price >= 0 ? Math.round(leg.price * 100) / 100 : null;
  const at = typeof leg.at === "string" && /^\d{1,2}:\d{2}$/.test(leg.at) ? leg.at.padStart(5, "0") : null;
  if (!label && !note && price == null && !at) return null;
  return { label: label || null, price, at, note: note || null };
}

// What the person typed on a leg (price, label) put with the rest of what the step already says (the hour, the note).
// null when nothing is left: the leg is removed.
export function withLegEdit(current, { price, label }) {
  const kept = cleanLeg(current) || {};
  return cleanLeg({ ...kept, price: price == null ? null : price, label: label || null });
}

// What was paid for the way to a step: counted as transport in the budget, whatever the step is.
export function legPrice(step) {
  return step && step.leg && typeof step.leg.price === "number" && Number.isFinite(step.leg.price) ? step.leg.price : 0;
}
