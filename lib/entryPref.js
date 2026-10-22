// The currency amounts are typed in when a trip has two: "local" (the country's) or "home" (the person's own).
// The switch next to a money field leaves its last position here (kept on the phone), so the next field opens the way
// the last one was left. A figure already saved is shown in the local currency, in which it is kept.
import { getSetting, setSetting } from "./storage";

export const ENTRY_KEY = "amountEntry";
let current = "local";
let touched = false;

export function entryPref() {
  return current;
}

export async function loadEntryPref() {
  const saved = await getSetting(ENTRY_KEY);
  if (!touched) current = saved === "home" ? "home" : "local";
  return current;
}

export function rememberEntry(next) {
  touched = true;
  current = next === "home" ? "home" : "local";
  setSetting(ENTRY_KEY, current).catch(() => {});
}
