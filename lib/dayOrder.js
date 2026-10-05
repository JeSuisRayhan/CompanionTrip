// Réordonner une journée par proximité: the steps without a time (the ones that can go in any order) are put in
// the order that shortens the way between them. The steps with a time, the ones already done and the ones whose
// place is unknown stay where they are. Straight-line distances, like the rest of the travel times.
import { distanceKm } from "./planner";
import { positionOfStep } from "./travelTime";

const MIN_GAIN_KM = 0.05; // under 50 m saved, the current order is as good as any
const MAX_STARTS = 25; // with no fixed starting point, every step is tried as the first one up to there

function pathKm(order, pos, from) {
  let km = 0;
  let prev = from;
  for (const id of order) {
    const p = pos.get(id);
    if (prev) km += distanceKm(prev, p);
    prev = p;
  }
  return km;
}

// Always go to the closest step not seen yet. `first` (an id) starts the path when there is no starting point.
function nearestFirst(ids, pos, from, first) {
  const left = ids.slice();
  const out = [];
  let cur = from;
  if (!cur) {
    out.push(...left.splice(left.indexOf(first), 1));
    cur = pos.get(first);
  }
  while (left.length) {
    let best = 0;
    let bestKm = Infinity;
    left.forEach((id, i) => {
      const d = distanceKm(cur, pos.get(id));
      if (d < bestKm) {
        bestKm = d;
        best = i;
      }
    });
    const [id] = left.splice(best, 1);
    out.push(id);
    cur = pos.get(id);
  }
  return out;
}

// Reverse pieces of the path as long as that makes it shorter (2-opt): a few steps, so it is instant.
function untangle(order, pos, from) {
  let best = order.slice();
  let bestKm = pathKm(best, pos, from);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const cand = best.slice(0, i).concat(best.slice(i, j + 1).reverse(), best.slice(j + 1));
        const km = pathKm(cand, pos, from);
        if (km < bestKm - 1e-9) {
          best = cand;
          bestKm = km;
          improved = true;
        }
      }
    }
  }
  return best;
}

// null when there is nothing to order (a park day, fewer than two movable steps with a known place).
// Otherwise { changed, before, after, saved, order (the movable steps, new order), ids (all the steps of the day,
// new order), previousIds (to undo), anchor (the step the walk starts from, or null), skipped }.
export function proximityOrder(trip, day) {
  if (!day || trip.tripType === "park" || day.dayType === "park") return null;
  const acts = day.activities || [];
  const pos = new Map();
  const movable = [];
  let skipped = 0;
  for (const a of acts) {
    if (a.time || a.done) continue;
    const p = positionOfStep(trip, a);
    if (p) {
      pos.set(a.id, p);
      movable.push(a.id);
    } else skipped++;
  }
  if (movable.length < 2) return null;

  // The steps with a time come first in the day: the walk starts from the last of them that has a place.
  const timed = acts
    .map((a, i) => ({ a, i }))
    .filter((x) => x.a.time && positionOfStep(trip, x.a))
    .sort((x, y) => x.a.time.localeCompare(y.a.time) || x.i - y.i);
  const anchor = timed.length ? timed[timed.length - 1].a : null;
  const from = anchor ? positionOfStep(trip, anchor) : null;

  const before = pathKm(movable, pos, from);
  let best = null;
  let bestKm = Infinity;
  const starts = from ? [null] : movable.length <= MAX_STARTS ? movable : [movable[0]];
  for (const first of starts) {
    const path = untangle(nearestFirst(movable, pos, from, first), pos, from);
    const km = pathKm(path, pos, from);
    if (km < bestKm) {
      bestKm = km;
      best = path;
    }
  }
  const changed = bestKm < before - MIN_GAIN_KM;
  const order = changed ? best : movable;

  // the movable steps take the places the movable steps had: everything else stays put
  const ids = acts.map((a) => a.id);
  let k = 0;
  acts.forEach((a, i) => {
    if (pos.has(a.id)) ids[i] = order[k++];
  });
  const byId = new Map(acts.map((a) => [a.id, a]));
  return {
    changed,
    before,
    after: changed ? bestKm : before,
    saved: changed ? before - bestKm : 0,
    order: order.map((id) => byId.get(id)),
    ids,
    previousIds: acts.map((a) => a.id),
    anchor,
    skipped,
  };
}
