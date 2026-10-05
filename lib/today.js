// What a trip under way has to say about today: the day, its steps in order,
// the one to do next, and how far away it is. Pure functions, no storage.
import { resolveDayDate, isoDate } from "./dates";

function stepsOf(day) {
  const withIndex = (day.activities || []).map((a, i) => ({ a, i }));
  // steps without a time go last; same-time steps keep the order they were written in
  withIndex.sort((x, y) => (x.a.time || "99:99").localeCompare(y.a.time || "99:99") || x.i - y.i);
  return withIndex.map((x) => x.a);
}

// Minutes from `now` to an "HH:MM" time of the same day (negative once it has passed); null without a time.
export function minutesUntil(time, now) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time || "");
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]) - (now.getHours() * 60 + now.getMinutes());
}

function duration(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const r = minutes % 60;
  return r ? `${h} h ${String(r).padStart(2, "0")}` : `${h} h`;
}

// "dans 25 min", "maintenant", "prévu il y a 40 min" — with a tone for the badge:
// stamp = running late, gold = soon, neutral = later.
export function countdownInfo(minutes) {
  if (minutes == null) return null;
  if (minutes > 0) return { label: `dans ${duration(minutes)}`, tone: minutes <= 30 ? "gold" : "neutral" };
  if (minutes >= -10) return { label: "maintenant", tone: "gold" };
  return { label: `prévu il y a ${duration(-minutes)}`, tone: "stamp" };
}

// The plan for today, or null when no day of the trip falls on `todayISO`.
export function todayPlan(trip, todayISO, now = new Date()) {
  if (!trip || !Array.isArray(trip.days)) return null;
  const index = trip.days.findIndex((d, i) => resolveDayDate(trip, d, i) === todayISO);
  if (index < 0) return null;
  const day = trip.days[index];
  const steps = stepsOf(day);
  const pending = steps.filter((s) => !s.done);
  const next = pending[0] || null;
  const tomorrow = trip.days[index + 1] || null;
  const docs = (trip.documents || []).filter((d) => d.dayId === day.id);
  return {
    day,
    dayNumber: index + 1,
    dayCount: trip.days.length,
    date: todayISO,
    steps,
    next,
    later: pending.slice(1),
    done: steps.filter((s) => s.done),
    total: steps.length,
    allDone: steps.length > 0 && pending.length === 0,
    countdown: next ? countdownInfo(minutesUntil(next.time, now)) : null,
    docs,
    tomorrow: tomorrow ? { day: tomorrow, firstStep: stepsOf(tomorrow)[0] || null } : null,
  };
}

export function todayISOFrom(now = new Date()) {
  return isoDate(now);
}
