import { tripStatus, tripRange, formatDateRange } from "./dates";

// What another app hands over through "Partager" (a link, a place from Maps, some text), and the trips it can go to.

export const MAX_SHARED_CHARS = 4000;

const clean = (v) => (typeof v === "string" ? v.trim() : "");

// The words the other app sent, plus its title and the link when they are not in them already
// (Maps sends a place name and a link, a browser a page title and an address).
export function sharedTextOf(intent) {
  if (!intent) return "";
  const text = clean(intent.text);
  const url = clean(intent.webUrl);
  const title = clean(intent.meta && intent.meta.title);
  const parts = [];
  if (title && !text.includes(title)) parts.push(title);
  if (text) parts.push(text);
  if (url && !text.includes(url)) parts.push(url);
  return parts.join("\n").trim().slice(0, MAX_SHARED_CHARS);
}

const ORDER = { current: 0, upcoming: 1, undated: 2, past: 3 };

// The trips that have an ideas notebook (not theme-park trips), the ones under way first, then the next ones,
// then the past ones from the most recent.
export function shareTargets(trips, todayISO) {
  return (trips || [])
    .filter((t) => t && t.tripType !== "park")
    .map((trip) => {
      const status = tripStatus(trip, todayISO);
      const { start, end } = tripRange(trip);
      return { trip, status, start, label: start ? formatDateRange(start, end) : "Sans date" };
    })
    .sort((a, b) => {
      if (ORDER[a.status] !== ORDER[b.status]) return ORDER[a.status] - ORDER[b.status];
      if (!a.start || !b.start) return 0;
      return a.status === "past" ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start);
    });
}

export const STATUS_LABELS = { current: "En cours", upcoming: "À venir", undated: "", past: "Terminé" };
