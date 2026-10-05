// How long it takes to get from one step to the next. An estimate from the straight line between the two
// places (stretched by a detour factor), never a route: the wording says "environ" and the real itinerary is
// one tap away with « Y aller ». Pure functions, no network.
import { distanceKm } from "./planner";
import { minutesUntil } from "./today";

const DETOUR = 1.3; // the road is longer than the crow flies
const WALK_MAX_KM = 1.8; // up to there people walk
const WALK_M_PER_MIN = 80; // 4.8 km/h
const TOO_FAR_KM = 150; // beyond: a train or a flight, no honest duration from a straight line
const SAME_PLACE_KM = 0.12; // two steps at the same address: nothing to show
const MARGIN_MIN = 5; // to leave a little earlier when it is not a walk

const isPos = (o) => !!o && Number.isFinite(o.lat) && Number.isFinite(o.lng);

// Where a step is: its own position, else the one of the idea it comes from; null when unknown.
export function positionOfStep(trip, step) {
  if (!step) return null;
  if (isPos(step)) return { lat: step.lat, lng: step.lng };
  const idea = step.ideaId ? (trip.ideas || []).find((i) => i.id === step.ideaId) : null;
  return isPos(idea) ? { lat: idea.lat, lng: idea.lng } : null;
}

export function formatDistance(km) {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  if (km < 10) return `${km.toFixed(1).replace(".", ",")} km`;
  return `${Math.round(km)} km`;
}

function roundMinutes(m) {
  return m >= 20 ? Math.round(m / 5) * 5 : Math.max(1, Math.round(m));
}

export function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const r = minutes % 60;
  return r ? `${h} h ${String(r).padStart(2, "0")}` : `${h} h`;
}

// Estimate between two positions: { km, minutes (null when too far to say), mode, text }.
// null when they are the same place.
export function estimateLeg(a, b) {
  if (!isPos(a) || !isPos(b)) return null;
  const km = distanceKm(a, b);
  if (km < SAME_PLACE_KM) return null;
  const road = km * DETOUR;
  if (km > TOO_FAR_KM) return { km, minutes: null, mode: "far", text: `environ ${formatDistance(km)} à vol d'oiseau` };
  if (road <= WALK_MAX_KM) {
    const minutes = roundMinutes((road * 1000) / WALK_M_PER_MIN);
    return { km, minutes, mode: "walk", text: `environ ${formatDuration(minutes)} à pied · ${formatDistance(road)}` };
  }
  const speed = road < 10 ? 20 : road < 40 ? 35 : 60; // km/h, waits and city traffic included
  const minutes = roundMinutes((road / speed) * 60);
  return { km, minutes, mode: "drive", text: `environ ${formatDuration(minutes)} en voiture ou transports · ${formatDistance(road)}` };
}

const toMin = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const toTime = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

// The legs of a day: `steps` in the order they are shown. A leg goes between two steps that follow each other
// and both have a position: with a step of unknown place in between, nothing is said (it would be a guess on a guess).
// Returns a Map: id of the step arrived at -> { fromId, fromTitle, ...estimate, leaveBy, tight }.
//   leaveBy: "HH:MM" to leave the previous step to be at the next one on time (null without an hour or a duration)
//   tight:   the two hours are closer than the trip itself
export function dayLegs(trip, steps) {
  const legs = new Map();
  for (let i = 1; i < steps.length; i++) {
    const from = steps[i - 1];
    const to = steps[i];
    const leg = estimateLeg(positionOfStep(trip, from), positionOfStep(trip, to));
    if (!leg) continue;
    const arrive = toMin(to.time);
    const depart = toMin(from.time);
    let leaveBy = null;
    if (leg.minutes != null && arrive != null) {
      const margin = leg.mode === "walk" ? 0 : MARGIN_MIN;
      const at = Math.floor((arrive - leg.minutes - margin) / 5) * 5;
      if (at >= 0) leaveBy = toTime(at);
    }
    const tight = leg.minutes != null && arrive != null && depart != null && arrive - depart < leg.minutes;
    legs.set(to.id, { ...leg, fromId: from.id, fromTitle: from.title || "", leaveBy, tight });
  }
  return legs;
}

// The advice that goes with a leg, or null when there is nothing useful to add.
//   arriveAt: "HH:MM" of the step arrived at; now: the clock when the day is the one being lived (null otherwise)
// tone: "stamp" = a problem, "gold" = leave soon, "neutral" = information.
export function legAdvice(leg, arriveAt, now = null) {
  if (!leg) return null;
  if (leg.tight) return { text: "Trajet plus long que le temps prévu entre les deux étapes", tone: "stamp" };
  if (leg.mode === "far") return { text: "Trajet long : prévoyez un train, un vol ou la voiture", tone: "neutral" };
  if (!leg.leaveBy) return null;
  const left = now ? minutesUntil(leg.leaveBy, now) : null;
  if (left != null && left <= 0) return { text: `Il est temps de partir (conseillé à ${leg.leaveBy})`, tone: "stamp" };
  return { text: `Partir à ${leg.leaveBy} pour arriver à ${arriveAt}`, tone: left != null && left <= 30 ? "gold" : "neutral" };
}
