// "Construire mon voyage", phase 2: turns the loose ideas into a proposed programme.
//
// Everything here is a pure function of the trip (plus two small writers at the
// end), so the preview can be recomputed on every tap.
//
// How it works, in plain words:
//  - Only ideas that are not on a day yet are planned (hotels are stays: not planned here).
//  - Days are filled one after the other. A day starts from the most important idea
//    left ("Indispensable" first), close to where the traveller sleeps that night
//    (the booked hotel) or where the previous day ended.
//  - Then it is topped up with the closest ideas, until the day's visit time is used.
//    Places too far apart never share a day. A day takes at most one lunch and one dinner.
//  - Times: day starts 09:30, lunch 12:30, dinner 19:30, 20 min between two places.
//    Steps already on the day keep their time; new ones are scheduled around them.
//  - What does not fit is simply left unplaced, and shown as such. Nothing is dropped.
import { hasPosition, getIdeaCategory, placementIndex, activityFromIdea } from "./ideas";
import { resolveDayDate, pad2 } from "./dates";
import { updateTrip } from "./trips";

// Visit time per day. Meals are extra: they have their own slots.
export const RHYTHMS = [
  { key: "relax", label: "Tranquille", hint: "4 h de visites par jour", visitMin: 240 },
  { key: "normal", label: "Équilibré", hint: "6 h de visites par jour", visitMin: 360 },
  { key: "intense", label: "Intense", hint: "8 h de visites par jour", visitMin: 480 },
];

const RADIUS_KM = 8; // farther apart than this: not the same day
const NEAR_BASE_KM = 50; // a day prefers ideas within this distance of the hotel
const SAME_CITY_KM = 2; // no coordinates, same city name
const UNKNOWN_KM = 4; // a position or city is missing: assume "nearby-ish"
const TRAVEL_MIN = 20;
const MIN_DAY_CAPACITY = 45;
const FLIGHT_CAPACITY = 120;
const DAY_START = 9 * 60 + 30;
const FLIGHT_START = 14 * 60;
const LUNCH_AT = 12 * 60 + 30;
const DINNER_AT = 19 * 60 + 30;
const DEFAULT_VISIT_MIN = 60;
const DEFAULT_MEAL_MIN = 75;
const OTHER_STEP_MIN = 60; // length assumed for a step already on the day
const PRIORITY_RANK = { must: 0, want: 1, maybe: 2 };
// Distance-equivalent cost of a less important idea: a "maybe" 2 km away
// loses against a "must" 9 km away.
const PRIORITY_BIAS_KM = { must: 0, want: 3, maybe: 8 };

// ---------- Geometry ----------

export function distanceKm(a, b) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const positioned = (p) => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng);

function normCity(c) {
  return (c || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

// Distance between two "spots" ({ lat, lng, city }). Coordinates win; without
// them the city name decides; with neither, assume a middling distance.
function spotDistance(a, b) {
  if (positioned(a) && positioned(b)) return distanceKm(a, b);
  const ca = normCity(a.city);
  const cb = normCity(b.city);
  if (ca && cb) return ca === cb ? SAME_CITY_KM : Infinity;
  return UNKNOWN_KM;
}

function spotOfIdea(idea) {
  return { lat: hasPosition(idea) ? idea.lat : null, lng: hasPosition(idea) ? idea.lng : null, city: idea.city || null };
}

// ---------- Candidates ----------

function durationOf(idea, cat, isMeal) {
  if (Number.isFinite(idea.durationMin) && idea.durationMin > 0) return idea.durationMin;
  return cat.durationMin > 0 ? cat.durationMin : isMeal ? DEFAULT_MEAL_MIN : DEFAULT_VISIT_MIN;
}

// Ideas that can still be planned: not on a day, and not a hotel.
export function planCandidates(trip) {
  const placed = placementIndex(trip);
  const list = [];
  (trip.ideas || []).forEach((idea, order) => {
    if (placed.has(idea.id)) return;
    const cat = getIdeaCategory(trip, idea.categoryId);
    if (cat.activityType === "hotel") return;
    const isMeal = cat.activityType === "repas";
    list.push({
      idea,
      cat,
      isMeal,
      dur: durationOf(idea, cat, isMeal),
      rank: PRIORITY_RANK[idea.priority] ?? 1,
      bias: PRIORITY_BIAS_KM[idea.priority] ?? PRIORITY_BIAS_KM.want,
      order,
    });
  });
  return list.sort((a, b) => a.rank - b.rank || (a.idea.createdAt || 0) - (b.idea.createdAt || 0) || a.order - b.order);
}

// ---------- Days ----------

const toMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
};

function fmt(min) {
  const m = Math.max(0, Math.min(1439, Math.round(min)));
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

// Where the traveller sleeps on a given day: the latest booked stay (with a
// position) that covers it.
function baseOfDay(trip, dayIndex) {
  let base = null;
  trip.days.forEach((day, i) => {
    (day.activities || []).forEach((a) => {
      if (a.type !== "hotel" || !a.stayId || !positioned(a)) return;
      const nights = (trip.stayNights && trip.stayNights[a.id]) || 1;
      if (i <= dayIndex && dayIndex < i + nights) base = { lat: a.lat, lng: a.lng, city: null };
    });
  });
  return base;
}

// Steps already on the day: their time is taken, and the day has less room.
function existingLoad(trip, day) {
  const ideaById = new Map((trip.ideas || []).map((i) => [i.id, i]));
  const busy = [];
  let used = 0;
  let lunchTaken = false;
  let dinnerTaken = false;
  (day.activities || []).forEach((a) => {
    if (a.type === "hotel") return;
    const idea = a.ideaId ? ideaById.get(a.ideaId) : null;
    const dur = idea && idea.durationMin > 0 ? idea.durationMin : OTHER_STEP_MIN;
    used += dur;
    const start = toMin(a.time);
    if (start != null) busy.push({ s: start, e: start + dur });
    if (a.type === "repas") {
      if (start != null && start >= 11 * 60 && start < 15 * 60) lunchTaken = true;
      else if (start != null && start >= 18 * 60) dinnerTaken = true;
    }
  });
  return { busy: busy.sort((x, y) => x.s - y.s), used, lunchTaken, dinnerTaken };
}

function dayInfos(trip, visitMin) {
  return trip.days.map((day, index) => {
    const flight = day.dayType === "flight";
    const load = existingLoad(trip, day);
    const cap = (flight ? Math.min(FLIGHT_CAPACITY, visitMin) : visitMin) - load.used;
    return {
      day,
      index,
      flight,
      busy: load.busy,
      cap,
      lunchOpen: !load.lunchTaken && !flight, // a flight day starts in the afternoon: no lunch to plan
      dinnerOpen: !load.dinnerTaken,
      base: baseOfDay(trip, index),
      usable: day.dayType !== "park" && cap >= MIN_DAY_CAPACITY,
    };
  });
}

// ---------- Grouping: which ideas share a day ----------

function spotOfGroup(group) {
  const pts = group.items.map((c) => spotOfIdea(c.idea)).filter(positioned);
  const city = (group.items.find((c) => c.idea.city) || { idea: {} }).idea.city || null;
  if (!pts.length) return { lat: null, lng: null, city };
  return { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length, city };
}

// Which meal slot a meal would take in this group, or null if none is free.
function mealSlotFor(c, group) {
  const slot = c.idea.mealSlot;
  if (slot === "lunch") return group.lunch ? "lunch" : null;
  if (slot === "dinner") return group.dinner ? "dinner" : null;
  if (group.lunch) return "lunch";
  return group.dinner ? "dinner" : null;
}

function fits(group, c, cap) {
  if (c.isMeal) return mealSlotFor(c, group) !== null;
  if (group.visits === 0) return true; // a day always takes its first place, however long
  return group.load + TRAVEL_MIN + c.dur <= cap;
}

function addToGroup(group, c) {
  if (c.isMeal) {
    const slot = mealSlotFor(c, group);
    if (slot) group[slot] = false;
  } else {
    group.load += (group.visits > 0 ? TRAVEL_MIN : 0) + c.dur;
    group.visits += 1;
  }
  group.items.push(c);
}

function buildGroup(pool, info, ref) {
  const group = { items: [], load: 0, visits: 0, lunch: info.lunchOpen, dinner: info.dinnerOpen };
  let eligible = pool.filter((c) => fits(group, c, info.cap));
  if (!eligible.length) return null;
  // From the hotel: prefer what is around it, whatever the priority.
  if (info.base) {
    const near = eligible.filter((c) => spotDistance(spotOfIdea(c.idea), info.base) <= NEAR_BASE_KM);
    if (near.length) eligible = near;
  }
  const topRank = Math.min(...eligible.map((c) => c.rank));
  const tier = eligible.filter((c) => c.rank === topRank);
  let anchor = tier[0];
  if (ref) {
    let best = Infinity;
    for (const c of tier) {
      const d = spotDistance(spotOfIdea(c.idea), ref);
      if (d < best) {
        best = d;
        anchor = c;
      }
    }
  }
  addToGroup(group, anchor);

  for (;;) {
    const here = spotOfGroup(group);
    let pick = null;
    let pickScore = Infinity;
    for (const c of pool) {
      if (group.items.includes(c) || !fits(group, c, info.cap)) continue;
      const d = spotDistance(spotOfIdea(c.idea), here);
      if (d > RADIUS_KM) continue;
      const score = d + c.bias;
      if (score < pickScore) {
        pick = c;
        pickScore = score;
      }
    }
    if (!pick) break;
    addToGroup(group, pick);
  }
  return group;
}

// The proposal: { rhythm, assign: { [ideaId]: dayId }, order: [ideaId] }.
// `order` is the planning order (used to keep the display stable).
export function generatePlan(trip, { rhythm = "normal" } = {}) {
  const r = RHYTHMS.find((x) => x.key === rhythm) || RHYTHMS[1];
  let pool = planCandidates(trip);
  const assign = {};
  const order = [];
  let previous = null;

  for (const info of dayInfos(trip, r.visitMin)) {
    if (!info.usable || pool.length === 0) continue;
    const group = buildGroup(pool, info, info.base || previous);
    if (!group) continue;
    group.items.forEach((c) => {
      assign[c.idea.id] = info.day.id;
      order.push(c.idea.id);
    });
    const spot = spotOfGroup(group);
    if (positioned(spot) || spot.city) previous = spot;
    pool = pool.filter((c) => !group.items.includes(c));
  }
  pool.forEach((c) => order.push(c.idea.id));
  return { rhythm: r.key, assign, order };
}

// ---------- Scheduling: what time on the day ----------

function orderVisits(visits, base) {
  const withPos = visits.filter((v) => hasPosition(v.idea));
  const rest = visits.filter((v) => !hasPosition(v.idea));
  if (withPos.length <= 1) return [...withPos, ...rest];
  let start;
  if (base) {
    start = withPos.reduce((a, b) => (distanceKm(b.idea, base) < distanceKm(a.idea, base) ? b : a));
  } else {
    const cx = { lat: withPos.reduce((s, v) => s + v.idea.lat, 0) / withPos.length, lng: withPos.reduce((s, v) => s + v.idea.lng, 0) / withPos.length };
    start = withPos.reduce((a, b) => (distanceKm(b.idea, cx) > distanceKm(a.idea, cx) ? b : a));
  }
  const chain = [start];
  const left = withPos.filter((v) => v !== start);
  while (left.length) {
    const last = chain[chain.length - 1];
    let k = 0;
    for (let i = 1; i < left.length; i++) if (distanceKm(last.idea, left[i].idea) < distanceKm(last.idea, left[k].idea)) k = i;
    chain.push(left.splice(k, 1)[0]);
  }
  return [...chain, ...rest];
}

function bump(start, dur, busy) {
  let s = start;
  for (let guard = 0; guard < 50; guard++) {
    const clash = busy.find((b) => s < b.e && s + dur > b.s);
    if (!clash) break;
    s = clash.e;
  }
  return s;
}

// Lays out the entries ({ idea, cat, isMeal, dur }) of one day.
function scheduleDay(trip, info, entries) {
  const meals = entries.filter((e) => e.isMeal);
  const visits = entries.filter((e) => !e.isMeal);
  const lunch = meals.find((m) => m.idea.mealSlot === "lunch") || meals.find((m) => m.idea.mealSlot !== "dinner");
  const dinner = meals.find((m) => m !== lunch && m.idea.mealSlot === "dinner") || meals.find((m) => m !== lunch && m.idea.mealSlot !== "lunch");
  const extras = meals.filter((m) => m !== lunch && m !== dinner);
  const sequence = [...orderVisits(visits, info.base), ...extras];

  const out = [];
  let cursor = info.flight ? FLIGHT_START : DAY_START;
  const put = (entry, slot, notBefore) => {
    const s = bump(Math.max(cursor, notBefore || 0), entry.dur, info.busy);
    out.push({ ...entry, slot, start: s, end: s + entry.dur, time: fmt(s), endTime: fmt(s + entry.dur) });
    cursor = Math.ceil((s + entry.dur + TRAVEL_MIN) / 15) * 15;
  };
  let lunchDone = !lunch;
  let dinnerDone = !dinner;
  for (const v of sequence) {
    if (!lunchDone && cursor >= LUNCH_AT - 30) {
      put(lunch, "lunch", LUNCH_AT);
      lunchDone = true;
    }
    if (!dinnerDone && cursor >= DINNER_AT - 30) {
      put(dinner, "dinner", DINNER_AT);
      dinnerDone = true;
    }
    put(v, "visit");
  }
  if (!lunchDone) put(lunch, "lunch", LUNCH_AT);
  if (!dinnerDone) put(dinner, "dinner", DINNER_AT);
  return out;
}

// What the screen shows, for a given assignment (the proposal, possibly edited by hand):
// { days: [{ dayId, dayIndex, title, date, flight, items: [{ idea, cat, time, endTime, slot }] }],
//   unplaced: [candidate], placedCount }
// Ideas that disappeared, were placed by hand meanwhile, or point to a day that no
// longer exists are treated as unplaced, so a stale proposal can never write garbage.
export function buildPreview(trip, assign, order = []) {
  const candidates = planCandidates(trip);
  const rank = new Map(order.map((id, i) => [id, i]));
  const byRank = (a, b) => (rank.has(a.idea.id) ? rank.get(a.idea.id) : 1e9) - (rank.has(b.idea.id) ? rank.get(b.idea.id) : 1e9);
  const infos = dayInfos(trip, Infinity);
  const perDay = new Map();
  const unplaced = [];
  for (const c of candidates) {
    const dayId = assign[c.idea.id];
    const info = dayId ? infos.find((d) => d.day.id === dayId) : null;
    if (!info) {
      unplaced.push(c);
      continue;
    }
    if (!perDay.has(info.index)) perDay.set(info.index, []);
    perDay.get(info.index).push(c);
  }
  const days = [...perDay.keys()]
    .sort((a, b) => a - b)
    .map((index) => {
      const info = infos[index];
      const entries = perDay.get(index).sort(byRank);
      return {
        dayId: info.day.id,
        dayIndex: index,
        title: info.day.title,
        date: resolveDayDate(trip, info.day, index),
        flight: info.flight,
        items: scheduleDay(trip, info, entries).map(({ idea, cat, time, endTime, slot }) => ({ idea, cat, time, endTime, slot })),
      };
    });
  return { days, unplaced: unplaced.sort(byRank), placedCount: days.reduce((n, d) => n + d.items.length, 0) };
}

// ---------- Editing the proposal ----------

export function moveInPlan(assign, ideaId, dayId) {
  const next = { ...assign };
  if (dayId) next[ideaId] = dayId;
  else delete next[ideaId];
  return next;
}

// ---------- Writing to the trip ----------

// Turns the proposal into real programme steps. The schedule is recomputed
// from the trip as it is *now*. Returns the ids of the steps created (for undo).
export async function applyPlan(tripId, assign, order) {
  const created = [];
  await updateTrip(tripId, (trip) => {
    const preview = buildPreview(trip, assign, order);
    const byDay = new Map(preview.days.map((d) => [d.dayId, d.items]));
    const days = trip.days.map((day) => {
      const items = byDay.get(day.id);
      if (!items) return day;
      const added = items.map((it) => {
        const activity = activityFromIdea(it.idea, it.cat, it.time);
        created.push(activity.id);
        return activity;
      });
      return { ...day, activities: [...day.activities, ...added] };
    });
    return { ...trip, days };
  });
  return created;
}

export async function undoPlan(tripId, activityIds) {
  const ids = new Set(activityIds);
  return updateTrip(tripId, (trip) => ({
    ...trip,
    days: trip.days.map((day) => ({ ...day, activities: day.activities.filter((a) => !ids.has(a.id)) })),
  }));
}
