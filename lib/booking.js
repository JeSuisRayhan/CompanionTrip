// "À réserver": the steps of a trip that still have to be booked, the day they must be booked by, and the
// reminders for it. Pure rules, no phone calls (those are in notifications.js), so they can be tested.
import { resolveDayDate, diffDaysISO, isValidISODate, formatShortDate, addDaysISO, isoDate } from "./dates";
import { splitTitlePlace } from "./script";

// A step has no booking state until the person says so: "todo" = to book, "done" = booked.
export const BOOKING_STATES = [
  { key: "todo", label: "À réserver" },
  { key: "done", label: "Réservé" },
];

// The reminder comes this many days before the deadline (the day itself when that is already too late).
export const BOOKING_LEAD_DAYS = 2;
export const REMINDER_HOUR = 9;
// Phones keep a limited number of pending notifications: bookings take a few places next to the step reminders.
export const MAX_BOOKING_REMINDERS = 10;

export function bookingOf(step) {
  return step && (step.booking === "todo" || step.booking === "done") ? step.booking : null;
}

// How close the deadline is, for the badge: { text, tone, left } (tone: stamp = urgent or missed, neutral = time left).
export function deadlineInfo(by, todayISO) {
  if (!isValidISODate(by) || !isValidISODate(todayISO)) return null;
  const left = diffDaysISO(todayISO, by);
  const date = formatShortDate(by);
  if (left < 0) return { text: `date dépassée (${date})`, tone: "stamp", left };
  if (left === 0) return { text: "à réserver aujourd'hui", tone: "stamp", left };
  if (left <= BOOKING_LEAD_DAYS) return { text: `avant le ${date} · dans ${left} j`, tone: "stamp", left };
  return { text: `avant le ${date}`, tone: "neutral", left };
}

// The steps still to book, the nearest deadline first, then the ones without a deadline in the order of the trip.
// Left out: a step already done, and a step whose day has passed (booking it is moot).
export function pendingBookings(trip, todayISO) {
  const out = [];
  (trip && Array.isArray(trip.days) ? trip.days : []).forEach((day, dayIndex) => {
    const date = resolveDayDate(trip, day, dayIndex);
    if (date && todayISO && date < todayISO) return;
    for (const step of day.activities || []) {
      if (bookingOf(step) !== "todo" || step.done) continue;
      const by = isValidISODate(step.bookBy) ? step.bookBy : null;
      out.push({ dayId: day.id, dayIndex, dayTitle: day.title, date, step, by, info: by ? deadlineInfo(by, todayISO) : null });
    }
  });
  out.sort((a, b) => {
    if (a.by && b.by) return a.by.localeCompare(b.by) || a.dayIndex - b.dayIndex;
    if (a.by) return -1;
    if (b.by) return 1;
    return a.dayIndex - b.dayIndex;
  });
  return out;
}

function at9(dateISO) {
  const d = new Date(dateISO + "T00:00:00");
  d.setHours(REMINDER_HOUR, 0, 0, 0);
  return d;
}

// The notifications to have pending for bookings with a deadline still ahead: 2 days before at 9:00, or on the
// day itself at 9:00 when 2 days before has passed. The nearest `max` of them.
export function planBookingReminders(trips, now = new Date(), { max = MAX_BOOKING_REMINDERS } = {}) {
  const plan = [];
  const today = isoDate(now);
  for (const trip of trips || []) {
    for (const item of pendingBookings(trip, today)) {
      if (!item.by || item.by < today) continue;
      let at = at9(addDaysISO(item.by, -BOOKING_LEAD_DAYS));
      if (at.getTime() <= now.getTime()) at = at9(item.by);
      if (at.getTime() <= now.getTime()) continue;
      const name = splitTitlePlace(item.step.title).title || item.step.title;
      plan.push({
        at,
        title: `À réserver : ${name}`,
        body: `Avant le ${formatShortDate(item.by)} · ${trip.name}`,
        data: { kind: "booking", tripId: trip.id, activityId: item.step.id, screen: "DayDetail", params: { tripId: trip.id, dayId: item.dayId } },
      });
    }
  }
  plan.sort((a, b) => a.at - b.at);
  return plan.slice(0, max);
}
