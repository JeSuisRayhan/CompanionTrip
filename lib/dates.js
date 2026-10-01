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

// Real calendar check: "2026-13-45" matches the regex but is not a date.
export function isValidISODate(iso) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(iso + "T00:00:00");
  return !isNaN(d.getTime()) && isoDate(d) === iso;
}

// Accepts AAAA-MM-JJ or JJ/MM/AAAA (separators / - .). Returns an ISO date
// string, or null when empty or not a real date.
export function parseDateInput(value) {
  const s = (value || "").trim();
  if (!s) return null;
  let iso = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    iso = s;
  } else {
    const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) iso = `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
  }
  return iso && isValidISODate(iso) ? iso : null;
}

// "0930", "9:30", "9h30" -> "09:30", "9h" -> "09:00"; null when empty or not a real time.
export function parseTimeInput(value) {
  const v = String(value || "").trim();
  const m = v.match(/^(\d{1,2})\s*[h:]\s*(\d{2})?$/i) || v.match(/^(\d{2})(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  return h <= 23 && min <= 59 ? `${pad2(h)}:${pad2(min)}` : null;
}

// While typing a time: "0930" shows as "09:30"; once a ":" or "h" is typed, the text is left alone.
export function maskTimeInput(text) {
  const t = String(text || "");
  if (/[h:]/i.test(t)) return t.replace(/[^\dh:]/gi, "").slice(0, 5);
  const d = t.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
}

// Whole days from a to b (b - a). Rounded so a DST change can't skew it.
export function diffDaysISO(a, b) {
  return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
}

export function formatDateLabel(iso) {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

// "dimanche 27 septembre" -> "Dimanche 27 septembre". French months and
// weekdays are lowercase; only the first letter of the label is capitalised
// (textTransform: "capitalize" would give "Dimanche 27 Septembre").
export function formatDayLabel(iso) {
  const s = formatDateLabel(iso);
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : null;
}

// "27 sept." / "27 sept. 2027" (year only when it is not the current one)
export function formatShortDate(iso, withYear) {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  const showYear = withYear === undefined ? d.getFullYear() !== new Date().getFullYear() : withYear;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", ...(showYear ? { year: "numeric" } : {}) });
}

// "27 sept. – 3 oct." (or a single date when start === end)
export function formatDateRange(startISO, endISO) {
  if (!startISO) return null;
  if (!endISO || endISO === startISO) return formatShortDate(startISO);
  const a = new Date(startISO + "T00:00:00");
  const b = new Date(endISO + "T00:00:00");
  // Same month and year: "14 – 16 nov." instead of "14 nov. – 16 nov."
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()} – ${formatShortDate(endISO)}`;
  }
  return `${formatShortDate(startISO)} – ${formatShortDate(endISO)}`;
}

// "Jeudi 1 octobre 2026": the date as the calendar field shows it.
export function formatFullDate(iso) {
  if (!iso) return null;
  const s = new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- Calendar (month grid) ----------

export const WEEKDAYS_MONDAY_FIRST = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];

// The weeks of a month, Monday first. Each cell is an ISO date, or null for
// the padding before the 1st and after the last day. `month` is 0 to 11.
export function monthGrid(year, month) {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= count; d++) cells.push(`${year}-${pad2(month + 1)}-${pad2(d)}`);
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// "Octobre 2026"
export function monthTitle(year, month) {
  const s = new Date(year, month, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// { year, month } moved by n months (negative goes back).
export function shiftMonth(view, n) {
  const d = new Date(view.year, view.month + n, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

// "lun." / "mar." ...
export function formatWeekdayShort(iso) {
  if (!iso) return null;
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short" });
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
