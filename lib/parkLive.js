// Amusement-park mode: the day itself.
//
// What to do next, how long the rest of the day will take with the queues as
// they are right now, and which other ride has almost no queue. Live data comes
// from Queue-Times (see queueTimes.js); without it the usual waits are used.
import { placementIndex, getIdeaCategory, hasPosition } from "./ideas";
import { tooTall } from "./park";
import { waitOf, walkMinutes, toMin, toHHMM, DEFAULT_WALK_MIN } from "./parkPlanner";
import { distanceKm } from "./planner";

const MEAL_MIN = 60;

function timeRank(time) {
  return time ? time : "99:99";
}

// The steps of a day in the order they will happen, each with its idea (when
// it comes from one) and the live data of its ride (when there is any).
export function dayStops(trip, dayId, live) {
  const day = trip.days.find((d) => d.id === dayId);
  if (!day) return [];
  const ideas = new Map((trip.ideas || []).map((i) => [i.id, i]));
  return day.activities
    .map((activity, index) => {
      const idea = activity.ideaId ? ideas.get(activity.ideaId) || null : null;
      return { activity, idea, index, ride: idea && idea.qtId != null && live ? live.get(idea.qtId) || null : null };
    })
    .sort((a, b) => {
      const t = timeRank(a.activity.time).localeCompare(timeRank(b.activity.time));
      return t !== 0 ? t : a.index - b.index;
    });
}

export function isMeal(stop) {
  return stop.activity.type === "repas";
}

// The queue to plan with: the live one when the ride is open, else the usual one.
export function currentWait(stop) {
  if (stop.ride && stop.ride.open && stop.ride.wait != null) return stop.ride.wait;
  return stop.idea ? waitOf(stop.idea) : 0;
}

export function isClosed(stop) {
  return !!stop.ride && stop.ride.open === false;
}

// Minutes the remaining steps will take from the first one: walking, queue, ride;
// a meal counts for its length.
export function remainingMinutes(stops) {
  let total = 0;
  let prev = null;
  for (const s of stops) {
    if (isMeal(s)) {
      total += (s.idea && s.idea.durationMin) || MEAL_MIN;
      prev = s.idea || prev;
      continue;
    }
    total += (s.idea ? walkMinutes(prev, s.idea) : DEFAULT_WALK_MIN) + currentWait(s) + ((s.idea && s.idea.durationMin) || 5);
    prev = s.idea || prev;
  }
  return total;
}

// "HH:MM" the day should end at if everything left is done, from `nowMin` (minutes since midnight).
export function estimatedEnd(stops, nowMin) {
  return stops.length ? toHHMM(nowMin + remainingMinutes(stops)) : null;
}

// Where a postponed step goes: right after the last step still to do.
export function postponedTime(stops, activityId) {
  const others = stops.filter((s) => s.activity.id !== activityId && !s.activity.done);
  const last = others.map((s) => toMin(s.activity.time)).filter((m) => m != null);
  const after = last.length ? Math.max(...last) + 5 : toMin("18:00");
  return toHHMM(Math.min(after, 23 * 60 + 55));
}

// Rides that are open, short queue, not done, not too tall, and not planned for
// another day: the ones worth doing while the long queue goes down.
export function shortQueues(trip, dayId, live, { skipIdeaId = null, maxWait = 20, limit = 3, from = null } = {}) {
  if (!live) return [];
  const placed = placementIndex(trip);
  const out = [];
  for (const idea of trip.ideas || []) {
    if (idea.id === skipIdeaId || idea.priority === "skip" || idea.qtId == null) continue;
    if (getIdeaCategory(trip, idea.categoryId).activityType === "repas") continue;
    if (tooTall(idea, trip)) continue;
    const place = placed.get(idea.id);
    if (place && (place.day.id !== dayId || place.activity.done)) continue;
    const ride = live.get(idea.qtId);
    if (!ride || !ride.open || ride.wait == null || ride.wait > maxWait) continue;
    const km = from && hasPosition(from) && hasPosition(idea) ? distanceKm(from, idea) : null;
    out.push({ idea, ride, km });
  }
  return out
    .sort((a, b) => a.ride.wait - b.ride.wait || (a.km ?? 99) - (b.km ?? 99))
    .slice(0, limit);
}
