import { tripStatus, tripRange, formatDateRange } from "./dates";
import { parseConfirmation } from "./confirmation";
import { describeFile } from "./fileKinds";

// What another app hands over through "Partager" (a link, a place from Maps, some text), and the trips it can go to.

export const MAX_SHARED_CHARS = 4000;
export const MAX_SHARED_FILES = 5;

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

// The pictures and PDFs sent (the other files are left out): [{ uri, name, kind, mime }], five at most.
export function sharedFilesOf(intent) {
  const list = intent && Array.isArray(intent.files) ? intent.files : [];
  return list
    .map((f) => (f ? describeFile({ uri: f.path, name: f.fileName, mimeType: f.mimeType }) : null))
    .filter(Boolean)
    .slice(0, MAX_SHARED_FILES);
}

// Everything readable in what was shared: { text, files, unsupported }, or null when there is nothing at all.
// "unsupported": files were sent but none is a picture or a PDF (the person must be told, not left with nothing).
export function sharedContentOf(intent) {
  const text = sharedTextOf(intent);
  const files = sharedFilesOf(intent);
  const sent = !!(intent && Array.isArray(intent.files) && intent.files.length);
  if (!text && !files.length && !sent) return null;
  return { text, files, unsupported: !text && !files.length };
}

// "2 captures d'écran et 1 PDF" (what the person sees as received when files were shared).
export function filesLabel(files) {
  const images = files.filter((f) => f.kind === "image").length;
  const pdfs = files.filter((f) => f.kind === "pdf").length;
  const parts = [];
  if (images) parts.push(`${images} capture${images > 1 ? "s" : ""} d'écran`);
  if (pdfs) parts.push(`${pdfs} PDF`);
  return parts.join(" et ");
}

const BOOKING_WORDS = /(confirmation|confirmed|confirm[ée]e?|r[ée]f[ée]rence de r[ée]servation|booking (?:ref|reference|number)|num[ée]ro de r[ée]servation|e-?billet|e-?ticket|itin[ée]raire|itinerary|check-?in)/i;

// What a shared thing is: a "booking" (files, or the text of a confirmation: a day and a flight, a stay, a ticket...) or
// "ideas" (a link, a place, a list of places).
export function shareKind({ text = "", files = [] } = {}) {
  if (files.length) return "booking";
  if (!text.trim()) return "ideas";
  const steps = parseConfirmation(text);
  if (steps.some((s) => s.date && (s.kind !== "activity" || s.confirmationCode || s.time))) return "booking";
  return text.length >= 80 && BOOKING_WORDS.test(text) ? "booking" : "ideas";
}

const ORDER = { current: 0, upcoming: 1, undated: 2, past: 3 };

// The trips that have an ideas notebook and a planning of their own (not theme-park trips), the ones under way first,
// then the next ones, then the past ones from the most recent.
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
