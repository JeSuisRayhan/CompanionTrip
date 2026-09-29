// Amusement-park mode: a notification when the queue of a ride you cannot miss
// drops. "Indispensable" rides only, open, with a wait at or under the limit
// the person chose (10, 15, 20 or 30 minutes).
//
// One notification per drop: a ride is announced when it goes from "above the
// limit" (or closed) to "at or under", and announced again only after it went
// back up. Live data comes from Queue-Times (see queueTimes.js).
//
// No React Native here: the notifier is passed in, so all of it can be tested.
import { placementIndex, getIdeaCategory } from "./ideas";
import { tooTall } from "./park";
import { resolveDayDate, isoDate } from "./dates";
import { updateTrip } from "./trips";
import { loadTrips, getSetting, setSetting } from "./storage";
import { fetchQueueTimes, liveByRideId } from "./queueTimes";

export const ALERT_CHOICES = [10, 15, 20, 30];
export const DEFAULT_ALERT_MIN = 20;
export const ALERT_STATE_KEY = "parkAlertState";
const MAX_DATA_AGE_MIN = 20; // Queue-Times moves every 5 minutes; older than this is not "now"
const DAY_STARTS_AT = 8; // no alert at night, when the app runs in the background
const DAY_ENDS_AT = 23;
const STATE_KEEP_MS = 3 * 24 * 60 * 60 * 1000;
const NAMES_SHOWN = 3;

// ---------- Settings (on the trip's park) ----------

export function alertSettings(trip) {
  const a = trip && trip.park && trip.park.alerts;
  return { on: !!(a && a.on), maxWait: a && ALERT_CHOICES.includes(a.maxWait) ? a.maxWait : DEFAULT_ALERT_MIN };
}

export async function setParkAlerts(tripId, { on, maxWait }) {
  return updateTrip(tripId, (trip) => {
    const current = alertSettings(trip);
    const alerts = { on: on === undefined ? current.on : !!on, maxWait: ALERT_CHOICES.includes(maxWait) ? maxWait : current.maxWait };
    return { ...trip, park: { ...(trip.park || {}), alerts } };
  });
}

// ---------- What is watched ----------

// Rides marked "Indispensable" that still make sense to announce: known by
// Queue-Times, not a show or a meal, not too tall for the group, not done yet.
export function watchedIdeas(trip) {
  const placed = placementIndex(trip);
  return (trip.ideas || []).filter((idea) => {
    if (idea.priority !== "must" || idea.qtId == null) return false;
    if (getIdeaCategory(trip, idea.categoryId).activityType === "repas") return false;
    if (idea.categoryId === "spectacle" || idea.showTime) return false;
    if (tooTall(idea, trip)) return false;
    const place = placed.get(idea.id);
    return !(place && place.activity.done);
  });
}

// In the background the alerts only run on the days of the trip, by day. A
// trip with no dates only gets them while its screens are open (`foreground`).
export function isAlertTime(trip, now = new Date(), { foreground = false } = {}) {
  if (foreground) return true;
  const hour = now.getHours();
  if (hour < DAY_STARTS_AT || hour >= DAY_ENDS_AT) return false;
  return hasAlertDays(trip, isoDate(now));
}

// Does the trip have a dated day (today, when `on` is given)?
export function hasAlertDays(trip, on = null) {
  return (trip.days || []).some((day, i) => {
    const date = resolveDayDate(trip, day, i);
    return !!date && (on == null || date === on);
  });
}

// ---------- Deciding ----------

// `live`: Map of Queue-Times rides by id. `state`: what was announced before.
// Returns the rides to announce and the new state. A ride with no fresh data
// keeps its state: not knowing is not "the queue went up".
export function evaluateAlerts(trip, live, state = {}, nowMs = Date.now()) {
  const { maxWait } = alertSettings(trip);
  const next = { ...state };
  const hits = [];
  for (const idea of watchedIdeas(trip)) {
    const key = `${trip.id}:${idea.id}`;
    const ride = live ? live.get(idea.qtId) : null;
    const age = ride && ride.updated ? (nowMs - Date.parse(ride.updated)) / 60000 : Infinity;
    if (!ride || age > MAX_DATA_AGE_MIN) continue;
    const low = ride.open && ride.wait != null && ride.wait <= maxWait;
    const was = !!(state[key] && state[key].low);
    if (low && !was) hits.push({ idea, wait: ride.wait });
    if (low || was) next[key] = { low, at: nowMs };
  }
  hits.sort((a, b) => a.wait - b.wait);
  return { hits, state: next };
}

export function alertMessage(hits, maxWait) {
  if (hits.length === 1) {
    const { idea, wait } = hits[0];
    return { title: `File courte : ${idea.name}`, body: wait === 0 ? "Pas d'attente en ce moment. C'est le moment d'y aller." : `${wait} min d'attente, sous vos ${maxWait} min. C'est le moment d'y aller.` };
  }
  const names = hits.slice(0, NAMES_SHOWN).map((h) => `${h.idea.name} (${h.wait} min)`);
  const more = hits.length > NAMES_SHOWN ? ` et ${hits.length - NAMES_SHOWN} autre${hits.length - NAMES_SHOWN > 1 ? "s" : ""}` : "";
  return { title: `${hits.length} files courtes`, body: `${names.join(", ")}${more}.` };
}

// ---------- Running ----------

// Two screens can refresh at the same moment; the checks go one after the other
// so that both do not read the state before either wrote it (two notifications).
let queue = Promise.resolve();
function inTurn(job) {
  const run = queue.then(job);
  queue = run.catch(() => {});
  return run;
}

async function loadState(nowMs) {
  try {
    const raw = await getSetting(ALERT_STATE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    const kept = {};
    Object.keys(all || {}).forEach((k) => {
      if (all[k] && nowMs - all[k].at < STATE_KEEP_MS) kept[k] = all[k];
    });
    return kept;
  } catch (e) {
    return {};
  }
}

// Check one trip against live data already in hand (the screens do this after
// each refresh). Returns the rides announced.
export function checkTripAlerts(trip, data, { notify, now = new Date() } = {}) {
  if (!trip || !alertSettings(trip).on || !data) return Promise.resolve([]);
  return inTurn(async () => {
    const nowMs = now.getTime();
    const { hits, state } = evaluateAlerts(trip, liveByRideId(data), await loadState(nowMs), nowMs);
    await setSetting(ALERT_STATE_KEY, JSON.stringify(state));
    if (hits.length && notify) {
      const m = alertMessage(hits, alertSettings(trip).maxWait);
      await notify(m.title, m.body);
    }
    return hits;
  });
}

// The background pass: every trip with alerts on and a visit today.
// Returns { checked, notified, errors } and never throws.
export function runParkAlerts(options = {}) {
  return inTurn(() => runParkAlertsNow(options));
}

async function runParkAlertsNow({ notify, fetcher = fetchQueueTimes, now = new Date(), foreground = false, timeoutMs = 8000 }) {
  const out = { checked: 0, notified: 0, errors: [] };
  let trips = [];
  try {
    trips = await loadTrips();
  } catch (e) {
    out.errors.push(e);
    return out;
  }
  const active = trips.filter((t) => t.tripType === "park" && t.park && t.park.qtId != null && alertSettings(t).on && isAlertTime(t, now, { foreground }));
  if (!active.length) return out;
  const nowMs = now.getTime();
  let state = await loadState(nowMs);
  const fetched = new Map(); // park id -> data | null
  for (const trip of active) {
    const id = trip.park.qtId;
    if (!fetched.has(id)) {
      try {
        fetched.set(id, await fetcher(id, { force: true, timeoutMs }));
      } catch (e) {
        out.errors.push(e);
        fetched.set(id, null);
      }
    }
    const data = fetched.get(id);
    if (!data) continue;
    out.checked++;
    const res = evaluateAlerts(trip, liveByRideId(data), state, nowMs);
    state = res.state;
    if (res.hits.length && notify) {
      const m = alertMessage(res.hits, alertSettings(trip).maxWait);
      try {
        await notify(m.title, m.body);
        out.notified += res.hits.length;
      } catch (e) {
        out.errors.push(e);
      }
    }
  }
  try {
    await setSetting(ALERT_STATE_KEY, JSON.stringify(state));
  } catch (e) {
    out.errors.push(e);
  }
  return out;
}
