// One ink per trip: the colour of its cover, its active tab, its lit digits. The person can pick it in the trip's
// settings (trip.ink); a trip that has none gets a steady default from its id, so it never changes colour.
import { createContext, useContext } from "react";
import { INK_NAMES, inkTone } from "./theme";

// What a trip without a chosen ink draws from (the park has its own violet).
const AUTO_INKS = ["teal", "blue", "stamp", "nature", "pink"];

function hashOf(text) {
  let h = 0;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function inkNameOf(trip) {
  if (trip && INK_NAMES.includes(trip.ink)) return trip.ink;
  if (trip && trip.tripType === "park") return "violet";
  return AUTO_INKS[hashOf(trip && (trip.id || trip.name)) % AUTO_INKS.length];
}

// { name, color, dim, lit }: read at render time, so it follows the palette.
export function tripInk(trip) {
  return inkTone(inkNameOf(trip));
}

// The ink a new trip starts with: the first one none of the trips already has (the park keeps its violet).
export function freeInkName(trips, tripType) {
  if (tripType === "park") return "violet";
  const used = new Set((trips || []).map(inkNameOf));
  return AUTO_INKS.find((n) => !used.has(n)) || AUTO_INKS[(trips || []).length % AUTO_INKS.length];
}

// Screens inside a trip read their ink from here (default: teal).
export const TripInkContext = createContext(null);
export function useTripInk() {
  return useContext(TripInkContext) || inkTone("teal");
}
