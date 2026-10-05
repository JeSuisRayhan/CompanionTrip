// La note du soir: a few lines the traveller writes about a day, kept with the day. Pure rules.
import { resolveDayDate } from "./dates";

export const MAX_JOURNAL = 800;

// The note of a day, trimmed; "" when there is none.
export function journalOf(day) {
  return day && typeof day.journal === "string" ? day.journal.trim() : "";
}

// What is saved: trimmed and cut at the limit; null for an empty note (the day has none).
export function cleanJournal(text) {
  const t = String(text == null ? "" : text).trim().slice(0, MAX_JOURNAL).trim();
  return t || null;
}

// A note is for a day that has begun: today or before, or a day where something was ticked (days without a date).
// Writing about tomorrow makes no sense.
export function canWriteJournal(trip, day, dayIndex, todayISO) {
  const date = resolveDayDate(trip, day, dayIndex);
  if (date && todayISO) return date <= todayISO;
  return (day.activities || []).some((a) => a.done);
}

// The notes of a trip in the order of its days: [{ dayId, dayNumber, title, date, text }]
export function journalEntries(trip) {
  const out = [];
  ((trip && trip.days) || []).forEach((day, i) => {
    const text = journalOf(day);
    if (text) out.push({ dayId: day.id, dayNumber: i + 1, title: day.title || `Jour ${i + 1}`, date: resolveDayDate(trip, day, i), text });
  });
  return out;
}
