// Pure date/status logic ported directly from the web/PWA version — no DOM
// dependency at all, so this works identically in React Native.

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function isoDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function addDaysISO(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function formatDateLabel(iso) {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

export function resolveDayDate(trip, day, index) {
  if (day.date) return day.date;
  if (trip.startDate) return addDaysISO(trip.startDate, index);
  return null;
}

export function shiftTripDates(trip, deltaDays) {
  return {
    ...trip,
    startDate: trip.startDate ? addDaysISO(trip.startDate, deltaDays) : trip.startDate,
    days: trip.days.map((d) => (d.date ? { ...d, date: addDaysISO(d.date, deltaDays) } : d)),
  };
}

export function tripDates(trip) {
  return trip.days
    .map((d, i) => resolveDayDate(trip, d, i))
    .filter(Boolean)
    .sort();
}

export function tripRange(trip) {
  const dates = tripDates(trip);
  if (!dates.length) return { start: null, end: null };
  return { start: dates[0], end: dates[dates.length - 1] };
}

export function tripStatus(trip, todayISO) {
  const { start, end } = tripRange(trip);
  if (!start) return "undated";
  if (todayISO >= start && todayISO <= end) return "current";
  if (start > todayISO) return "upcoming";
  return "past";
}

export function daysUntilLabel(startISO, todayISO) {
  const diff = Math.round((new Date(startISO + "T00:00:00") - new Date(todayISO + "T00:00:00")) / 86400000);
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return "demain";
  if (diff > 1) return `dans ${diff} jours`;
  return null;
}
