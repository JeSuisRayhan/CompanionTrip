// Build a standard .ics calendar file for a trip's activities.
import { resolveDayDate } from "./dates";

function icsEscape(text) {
  return String(text || "").replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
}

function toICSDateTime(dateISO, time) {
  const [h, m] = (time || "00:00").split(":");
  return `${dateISO.replace(/-/g, "")}T${h.padStart(2, "0")}${m.padStart(2, "0")}00`;
}

export function buildTripICS(trip) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CompagnonDeVoyage//FR"];
  trip.days.forEach((day, index) => {
    const dateISO = resolveDayDate(trip, day, index);
    if (!dateISO) return;
    day.activities.forEach((a) => {
      const dtStart = toICSDateTime(dateISO, a.time || "09:00");
      lines.push(
        "BEGIN:VEVENT",
        `UID:${a.id}@compagnon-voyage`,
        `DTSTART:${dtStart}`,
        `SUMMARY:${icsEscape(a.title)}`,
        a.note ? `DESCRIPTION:${icsEscape(a.note)}` : null,
        "END:VEVENT"
      );
    });
  });
  lines.push("END:VCALENDAR");
  return lines.filter(Boolean).join("\r\n");
}
