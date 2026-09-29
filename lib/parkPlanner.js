// Amusement-park mode: the plan of one day.
//
// Everything in a park day is measured in queue time, not in kilometres, so
// this is not the city planner. The idea:
//   1. pick what fits the day: indispensable first, then "envie", then "si le
//      temps", the longest queues first inside a tier
//   2. order it into a walk: start where the queues are the longest, then move
//      to the closest zone, ride by ride inside a zone
//   3. give every step a time: walk + queue + ride, lunch around 12:30, shows
//      at their fixed hour
// All the times are estimates (the queue of a ride is `waitMin`, 30 min when
// nobody said otherwise); the live screen corrects them on the day.
import { getIdeaCategory, placementIndex, activityFromIdea, hasPosition, sortIdeas } from "./ideas";
import { updateTrip } from "./trips";
import { uid, pad2 } from "./dates";
import { distanceKm } from "./planner";
import { tooTall } from "./park";

export const DEFAULT_START = "09:00";
export const DEFAULT_END = "21:00";
export const DEFAULT_WAIT_MIN = 30;
export const DEFAULT_SHOW_WAIT_MIN = 10; // seats: arrive a little early
export const DEFAULT_WALK_MIN = 8;
const SAME_LAND_WALK_MIN = 5;
const LUNCH_AT = 12 * 60 + 30;
const LUNCH_MIN = 60;
const DINNER_AT = 19 * 60;
const DINNER_MIN = 60;
const SHOW_EARLY_MIN = 15;
const WALK_M_PER_MIN = 70; // 4.2 km/h, families with strollers included
const DETOUR = 1.3;
const TIER_WEIGHT = { must: 3, want: 2, maybe: 1 };
const TIER_RANK = { must: 0, want: 1, maybe: 2 };

export const DAY_STARTS = ["08:30", "09:00", "09:30", "10:00"];
export const DAY_ENDS = ["17:00", "19:00", "21:00", "22:30"];

export function toMin(hhmm) {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

export function toHHMM(min) {
  const m = Math.max(0, Math.round(min / 5) * 5);
  return `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;
}

export function waitOf(idea) {
  if (idea.waitMin != null) return idea.waitMin;
  return idea.showTime ? DEFAULT_SHOW_WAIT_MIN : DEFAULT_WAIT_MIN;
}

export function walkMinutes(a, b) {
  if (!a || !b) return DEFAULT_WALK_MIN;
  if (hasPosition(a) && hasPosition(b)) {
    const m = distanceKm(a, b) * 1000 * DETOUR;
    return Math.min(25, Math.max(3, Math.round(m / WALK_M_PER_MIN)));
  }
  if (a.land && a.land === b.land) return SAME_LAND_WALK_MIN;
  return DEFAULT_WALK_MIN;
}

// ---------- What can be planned ----------

// Attractions and shows still to place: not skipped, not already on a day, not
// too tall for the smallest child. Restaurants are kept apart for the lunch.
export function parkCandidates(trip) {
  const placed = placementIndex(trip);
  const rides = [];
  const meals = [];
  const tall = [];
  for (const idea of trip.ideas || []) {
    if (idea.priority === "skip" || placed.has(idea.id)) continue;
    const cat = getIdeaCategory(trip, idea.categoryId);
    if (cat.activityType === "repas") {
      meals.push(idea);
      continue;
    }
    if (tooTall(idea, trip)) {
      tall.push(idea);
      continue;
    }
    rides.push({ idea, cat });
  }
  return { rides, meals: sortIdeas(meals), tall };
}

// ---------- Route ----------

function centroid(ideas) {
  const pos = ideas.filter(hasPosition);
  if (!pos.length) return null;
  return { lat: pos.reduce((s, i) => s + i.lat, 0) / pos.length, lng: pos.reduce((s, i) => s + i.lng, 0) / pos.length };
}

// The rides in walking order: the zone with the longest queues first, then the
// closest zone each time (list order when positions are missing).
export function orderRides(rides) {
  const groups = new Map();
  rides.forEach((r) => {
    const key = r.idea.land || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });
  const lands = [...groups.entries()].map(([land, list], order) => ({
    land,
    list,
    order,
    weight: list.reduce((s, r) => s + (TIER_WEIGHT[r.idea.priority] || 1) * waitOf(r.idea), 0),
    at: centroid(list.map((r) => r.idea)),
  }));

  const route = [];
  let current = null;
  const remaining = [...lands];
  while (remaining.length) {
    let next;
    if (!current) {
      next = remaining.reduce((a, b) => (b.weight > a.weight ? b : a));
    } else {
      next = remaining.reduce((a, b) => {
        const da = current.at && a.at ? distanceKm(current.at, a.at) : Infinity;
        const db = current.at && b.at ? distanceKm(current.at, b.at) : Infinity;
        if (da === Infinity && db === Infinity) return b.order < a.order ? b : a;
        return db < da ? b : a;
      });
    }
    remaining.splice(remaining.indexOf(next), 1);
    // inside a zone: nearest neighbour, starting with the longest queue
    const left = [...next.list].sort((a, b) => waitOf(b.idea) - waitOf(a.idea));
    let last = null;
    while (left.length) {
      let pick = left[0];
      if (last && hasPosition(last.idea)) {
        pick = left.reduce((a, b) => {
          const da = hasPosition(a.idea) ? distanceKm(last.idea, a.idea) : Infinity;
          const db = hasPosition(b.idea) ? distanceKm(last.idea, b.idea) : Infinity;
          return db < da ? b : a;
        });
      }
      left.splice(left.indexOf(pick), 1);
      route.push(pick);
      last = pick;
    }
    current = next;
  }
  return route;
}

// ---------- The day ----------

// -> { start, end, items: [{ kind, idea, cat, time, endTime, wait, walk }],
//      unplaced: [{ idea, reason }], rideCount, waitTotal }
// kind: "ride" | "show" | "lunch" | "dinner" (lunch/dinner carry an idea when the
// notebook has a restaurant, else idea is null).
export function generateParkDay(trip, { start = DEFAULT_START, end = DEFAULT_END } = {}) {
  const startMin = toMin(start);
  const endMin = toMin(end);
  const { rides, meals, tall } = parkCandidates(trip);
  const unplaced = tall.map((idea) => ({ idea, reason: "tall" }));
  if (startMin == null || endMin == null || endMin <= startMin) return { start, end, items: [], unplaced: [...unplaced, ...rides.map((r) => ({ idea: r.idea, reason: "time" }))], rideCount: 0, waitTotal: 0 };

  const wantsLunch = startMin <= LUNCH_AT - 30 && endMin >= LUNCH_AT + LUNCH_MIN;
  const wantsDinner = startMin <= DINNER_AT - 30 && endMin >= DINNER_AT + DINNER_MIN + 60;

  // shows at a fixed hour, inside the opening hours
  const shows = [];
  const flexible = [];
  for (const r of rides) {
    const at = r.idea.showTime ? toMin(r.idea.showTime) : null;
    if (at == null) flexible.push(r);
    else if (at - SHOW_EARLY_MIN >= startMin && at + (r.idea.durationMin || 30) <= endMin) shows.push({ ...r, at });
    else unplaced.push({ idea: r.idea, reason: "time" });
  }
  shows.sort((a, b) => a.at - b.at);

  // how much time is left for rides once meals and shows are counted
  let budget = endMin - startMin - (wantsLunch ? LUNCH_MIN : 0) - (wantsDinner ? DINNER_MIN : 0);
  shows.forEach((s) => (budget -= SHOW_EARLY_MIN + (s.idea.durationMin || 30)));

  const ranked = [...flexible].sort((a, b) => {
    const t = (TIER_RANK[a.idea.priority] ?? 1) - (TIER_RANK[b.idea.priority] ?? 1);
    return t !== 0 ? t : waitOf(b.idea) - waitOf(a.idea) || (a.idea.createdAt || 0) - (b.idea.createdAt || 0);
  });
  const chosen = [];
  for (const r of ranked) {
    const cost = DEFAULT_WALK_MIN + waitOf(r.idea) + (r.idea.durationMin || 5);
    if (cost <= budget) {
      chosen.push(r);
      budget -= cost;
    } else {
      unplaced.push({ idea: r.idea, reason: "time" });
    }
  }
  const order = orderRides(chosen);

  // walk through the day
  const items = [];
  let cursor = startMin;
  let prev = null;
  let lunchDone = !wantsLunch;
  let dinnerDone = !wantsDinner;
  const mealIdeas = [...meals];
  const push = (item) => {
    items.push(item);
    prev = item.idea || prev;
  };
  const meal = (kind, at, minutes) => {
    const time = Math.max(cursor, at);
    if (time + minutes > endMin) return; // no room left for it
    const idea = mealIdeas.shift() || null;
    push({ kind, idea, cat: idea ? getIdeaCategory(trip, idea.categoryId) : null, time: toHHMM(time), endTime: toHHMM(time + minutes), wait: 0, walk: 0 });
    cursor = time + minutes;
  };

  let i = 0;
  const mealDue = () => (!lunchDone && cursor >= LUNCH_AT - 15) || (!dinnerDone && cursor >= DINNER_AT - 15);
  while (i < order.length || shows.length || mealDue()) {
    if (!lunchDone && cursor >= LUNCH_AT - 15) {
      meal("lunch", LUNCH_AT - 15, LUNCH_MIN);
      lunchDone = true;
      continue;
    }
    if (!dinnerDone && cursor >= DINNER_AT - 15) {
      meal("dinner", DINNER_AT - 15, DINNER_MIN);
      dinnerDone = true;
      continue;
    }

    const ride = order[i];
    const walk = ride ? walkMinutes(prev, ride.idea) : 0;
    const rideEnd = ride ? cursor + walk + waitOf(ride.idea) + (ride.idea.durationMin || 5) : Infinity;
    const show = shows[0];
    if (show && (!ride || rideEnd > show.at - SHOW_EARLY_MIN)) {
      shows.shift();
      if (cursor > show.at) {
        unplaced.push({ idea: show.idea, reason: "time" });
        continue;
      }
      const dur = show.idea.durationMin || 30;
      push({ kind: "show", idea: show.idea, cat: show.cat, time: toHHMM(show.at), endTime: toHHMM(show.at + dur), wait: 0, walk: walkMinutes(prev, show.idea) });
      cursor = show.at + dur;
      continue;
    }
    if (!ride) break;
    if (rideEnd > endMin) break;
    const wait = waitOf(ride.idea);
    push({ kind: "ride", idea: ride.idea, cat: ride.cat, time: toHHMM(cursor + walk), endTime: toHHMM(rideEnd), wait, walk });
    cursor = rideEnd;
    i += 1;
  }
  // the rides ran out before mealtime: the meal still belongs to the day
  if (!lunchDone) meal("lunch", LUNCH_AT - 15, LUNCH_MIN);
  if (!dinnerDone) meal("dinner", DINNER_AT - 15, DINNER_MIN);
  for (; i < order.length; i++) unplaced.push({ idea: order[i].idea, reason: "time" });
  for (const s of shows) unplaced.push({ idea: s.idea, reason: "time" });

  const rideItems = items.filter((it) => it.kind === "ride");
  return {
    start,
    end,
    items,
    unplaced,
    rideCount: rideItems.length,
    waitTotal: rideItems.reduce((s, it) => s + it.wait, 0),
    endsAt: items.length ? items[items.length - 1].endTime : null,
  };
}

// ---------- Writing ----------

// Adds the plan to the day as ordinary steps (done / time / note all work like
// any other step). Returns the ids of the steps created, for "Annuler".
export async function applyParkDay(tripId, dayId, items) {
  const created = [];
  await updateTrip(tripId, (trip) => {
    const day = trip.days.find((d) => d.id === dayId);
    if (!day) return trip;
    const placed = placementIndex(trip);
    const steps = [];
    for (const it of items) {
      if (it.idea && placed.has(it.idea.id)) continue; // placed by hand meanwhile
      if (it.idea) {
        const cat = it.cat || getIdeaCategory(trip, it.idea.categoryId);
        const step = activityFromIdea(it.idea, cat, it.time);
        if (it.kind === "ride" && it.wait) step.note = `Attente estimée : ${it.wait} min`;
        steps.push(step);
      } else {
        steps.push({ id: uid(), title: it.kind === "dinner" ? "Pause dîner" : "Pause déjeuner", time: it.time, type: "repas", price: null, note: "", address: null, done: false });
      }
    }
    steps.forEach((s) => created.push(s.id));
    return {
      ...trip,
      days: trip.days.map((d) => (d.id === dayId ? { ...d, dayType: d.dayType || "park", activities: [...d.activities, ...steps] } : d)),
    };
  });
  return created;
}
