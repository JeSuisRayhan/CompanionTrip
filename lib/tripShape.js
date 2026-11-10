// What a trip must look like for the screens to draw it without failing.
//
// A trip made by the app always has this shape. A file imported from elsewhere (a backup edited by hand, a file
// from someone else, a damaged file) may not: a missing list, a name that is not text, two steps with the same
// id… One such trip, once saved, would make a screen fail every time it opens. So what comes from a file goes
// through cleanTrip first, and what is on the phone is checked once when the app starts.
//
// The rule: a trip that is already right comes back as the very same object (nothing is rewritten for nothing);
// only what would break a screen is corrected. What the app does not know is kept as it is.
import { uid, isValidISODate } from "./dates";

const STEP_TYPES = ["activite", "repas", "hotel", "transport"];
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);

// The corrected copy when there is something to correct, else the object itself.
function withPatch(obj, patch) {
  const keys = Object.keys(patch);
  if (!keys.length) return obj;
  const next = { ...obj };
  for (const k of keys) {
    if (patch[k] === undefined) delete next[k];
    else next[k] = patch[k];
  }
  return next;
}

// Text shown on screen must be text (or nothing): a number becomes its text, anything else is dropped.
function texts(obj, keys, patch) {
  for (const k of keys) {
    const v = obj[k];
    if (v == null || typeof v === "string") continue;
    patch[k] = typeof v === "number" || typeof v === "boolean" ? String(v) : null;
  }
}

// A date kept as text must be a real day, or nothing.
function dates(obj, keys, patch) {
  for (const k of keys) {
    const v = obj[k];
    if (v == null || v === "") continue;
    if (!isValidISODate(v)) patch[k] = null;
  }
}

// An id every list relies on: text, not empty, and not used twice in the same list.
function freshId(obj, seen, patch, bad = null) {
  const id = obj.id;
  if (typeof id !== "string" || !id || seen.has(id) || (bad && bad.test(id))) patch.id = uid();
  seen.add(patch.id || id);
}

// A list of objects: what is not an object is left out, each entry is cleaned. The same list when nothing changed.
function cleanList(list, cleanOne) {
  if (!Array.isArray(list)) return [];
  let changed = false;
  const out = [];
  for (const item of list) {
    const cleaned = cleanOne(item);
    if (cleaned == null) {
      changed = true;
      continue;
    }
    if (cleaned !== item) changed = true;
    out.push(cleaned);
  }
  return changed ? out : list;
}

// An optional list: untouched when absent, cleaned when present.
function optionalList(obj, key, cleanOne, patch) {
  const v = obj[key];
  if (v === undefined) return;
  const cleaned = cleanList(v, cleanOne);
  if (cleaned !== v) patch[key] = cleaned;
}

// "9:30" -> "09:30"; what is not an hour -> null. null, undefined and "" (no hour) are left alone.
function cleanTime(v, patch) {
  if (v == null || v === "") return;
  const m = typeof v === "string" ? /^(\d{1,2}):(\d{2})$/.exec(v) : null;
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) {
    patch.time = null;
    return;
  }
  if (m[1].length === 1) patch.time = `0${v}`;
}

// A figure used in sums: a number, or nothing. "12,5" typed as text becomes 12.5.
function amount(obj, key, patch) {
  const v = obj[key];
  if (v == null) return;
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return;
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : NaN;
  patch[key] = Number.isFinite(n) && n >= 0 ? n : null;
}

// A position is two numbers, or it is not there at all.
function position(obj, patch) {
  if (obj.lat === undefined && obj.lng === undefined) return;
  if (obj.lat == null && obj.lng == null) return;
  if (typeof obj.lat === "number" && typeof obj.lng === "number" && Number.isFinite(obj.lat) && Number.isFinite(obj.lng) && Math.abs(obj.lat) <= 90 && Math.abs(obj.lng) <= 180) return;
  patch.lat = undefined;
  patch.lng = undefined;
}

function cleanStep(a, seen) {
  if (!isObj(a)) return null;
  const p = {};
  freshId(a, seen, p);
  texts(a, ["title", "note", "address", "localAddress", "confirmationCode", "transportMode", "stayId", "ideaId", "booking"], p);
  const title = p.title !== undefined ? p.title : a.title;
  if (typeof title !== "string" || !title.trim()) p.title = "Étape";
  if (a.type != null && !STEP_TYPES.includes(a.type)) p.type = "activite";
  cleanTime(a.time, p);
  amount(a, "price", p);
  position(a, p);
  dates(a, ["bookBy"], p);
  if (a.leg != null && !isObj(a.leg)) p.leg = undefined;
  return withPatch(a, p);
}

function cleanDay(day, index, seenDays, seenSteps) {
  if (!isObj(day)) return null;
  const p = {};
  freshId(day, seenDays, p);
  texts(day, ["title", "notes", "location", "journal"], p);
  const title = p.title !== undefined ? p.title : day.title;
  if (typeof title !== "string" || !title.trim()) p.title = `Jour ${index + 1}`;
  dates(day, ["date"], p);
  const steps = cleanList(day.activities, (a) => cleanStep(a, seenSteps));
  if (steps !== day.activities) p.activities = steps;
  if (day.dayType != null && day.dayType !== "flight" && day.dayType !== "park") p.dayType = null;
  if (day.flightInfo != null) {
    if (!isObj(day.flightInfo)) p.flightInfo = null;
    else {
      const fp = {};
      texts(day.flightInfo, ["origin", "destination", "flightNumber", "seat"], fp);
      const info = withPatch(day.flightInfo, fp);
      if (info !== day.flightInfo) p.flightInfo = info;
    }
  }
  if (day.park != null && !(isObj(day.park) && typeof day.park.name === "string")) p.park = undefined;
  return withPatch(day, p);
}

function cleanIdea(idea, seen) {
  if (!isObj(idea)) return null;
  const p = {};
  freshId(idea, seen, p);
  texts(idea, ["name", "address", "city", "note", "openingHours", "sourceUrl", "land", "categoryId", "priority", "mealSlot", "showTime"], p);
  const name = p.name !== undefined ? p.name : idea.name;
  if (typeof name !== "string" || !name.trim()) p.name = "Idée";
  amount(idea, "price", p);
  amount(idea, "durationMin", p);
  position(idea, p);
  return withPatch(idea, p);
}

function cleanExpense(e, seen) {
  if (!isObj(e)) return null;
  const p = {};
  freshId(e, seen, p);
  texts(e, ["label", "category", "stepId"], p);
  const label = p.label !== undefined ? p.label : e.label;
  if (typeof label !== "string" || !label.trim()) p.label = "Dépense";
  if (!(typeof e.amount === "number" && Number.isFinite(e.amount))) {
    const n = typeof e.amount === "string" ? parseFloat(e.amount.replace(",", ".")) : NaN;
    p.amount = Number.isFinite(n) ? n : 0;
  }
  dates(e, ["date"], p);
  return withPatch(e, p);
}

function cleanChecklistItem(item, seen) {
  if (!isObj(item)) return null;
  const p = {};
  freshId(item, seen, p);
  texts(item, ["label"], p);
  const label = p.label !== undefined ? p.label : item.label;
  if (typeof label !== "string" || !label.trim()) return null; // a line with nothing written on it
  return withPatch(item, p);
}

function cleanPhrase(ph, seen) {
  if (!isObj(ph)) return null;
  const p = {};
  freshId(ph, seen, p);
  texts(ph, ["phrase", "translation", "reading"], p);
  const phrase = p.phrase !== undefined ? p.phrase : ph.phrase;
  const translation = p.translation !== undefined ? p.translation : ph.translation;
  if (typeof phrase !== "string" || !phrase.trim() || typeof translation !== "string" || !translation.trim()) return null;
  return withPatch(ph, p);
}

// A document or a souvenir photo: its file (`uri`), or in a backup file its content (`base64`).
function cleanFile(doc, seen, withTitle) {
  if (!isObj(doc)) return null;
  const p = {};
  freshId(doc, seen, p);
  texts(doc, ["title", "category", "kind", "scannedCode", "dayId", "ext"], p);
  if (withTitle) {
    const title = p.title !== undefined ? p.title : doc.title;
    if (typeof title !== "string" || !title.trim()) p.title = "Document";
  }
  if (doc.uri != null && typeof doc.uri !== "string") p.uri = undefined;
  if (doc.base64 != null && typeof doc.base64 !== "string") p.base64 = null;
  return withPatch(doc, p);
}

function cleanCategory(c, seen) {
  if (!isObj(c)) return null;
  const p = {};
  freshId(c, seen, p);
  texts(c, ["label", "icon", "tone", "color", "dim", "activityType"], p);
  const label = p.label !== undefined ? p.label : c.label;
  if (typeof label !== "string" || !label.trim()) return null;
  return withPatch(c, p);
}

// An object used as a table (id -> value): anything else becomes an empty table.
function table(obj, key, patch, keepValue = () => true) {
  const v = obj[key];
  if (v == null) return;
  if (!isObj(v)) {
    patch[key] = {};
    return;
  }
  const bad = Object.keys(v).filter((k) => !keepValue(v[k]));
  if (!bad.length) return;
  const next = { ...v };
  bad.forEach((k) => delete next[k]);
  patch[key] = next;
}

// The trip as the screens need it, or null for something that is not a trip at all.
export function cleanTrip(raw) {
  if (!isObj(raw)) return null;
  const p = {};
  // "#" joins a trip id and a day id for a park day (see parkDay.js): a trip id cannot have one
  freshId(raw, new Set(), p, /#/);
  texts(raw, ["name", "defaultLocation", "country", "ink", "tripType", "planMode", "currency", "homeCurrency", "budgetIn"], p);
  const name = p.name !== undefined ? p.name : raw.name;
  if (typeof name !== "string" || !name.trim()) p.name = "Voyage";
  dates(raw, ["startDate"], p);
  for (const key of ["currency", "homeCurrency"]) {
    const v = p[key] !== undefined ? p[key] : raw[key];
    if (v != null && !/^[A-Za-z]{3}$/.test(v)) p[key] = "EUR";
  }
  if (raw.rate != null && !(typeof raw.rate === "number" && Number.isFinite(raw.rate) && raw.rate > 0)) p.rate = 1;
  if (raw.budgetTotal != null && !(typeof raw.budgetTotal === "number" && Number.isFinite(raw.budgetTotal) && raw.budgetTotal > 0)) p.budgetTotal = undefined;

  const seenDays = new Set();
  const seenSteps = new Set();
  let index = 0;
  const days = cleanList(raw.days, (d) => cleanDay(d, index++, seenDays, seenSteps));
  if (days !== raw.days) p.days = days;

  const ideaIds = new Set();
  optionalList(raw, "ideas", (i) => cleanIdea(i, ideaIds), p);
  const catIds = new Set();
  optionalList(raw, "customIdeaCategories", (c) => cleanCategory(c, catIds), p);
  const expenseIds = new Set();
  optionalList(raw, "expenses", (e) => cleanExpense(e, expenseIds), p);
  optionalList(raw, "otherExpenses", (e) => (isObj(e) ? e : null), p);
  const docIds = new Set();
  optionalList(raw, "documents", (d) => cleanFile(d, docIds, true), p);
  const photoIds = new Set();
  optionalList(raw, "souvenirs", (d) => cleanFile(d, photoIds, false), p);
  const phraseIds = new Set();
  optionalList(raw, "phrases", (ph) => cleanPhrase(ph, phraseIds), p);
  for (const key of ["packingList", "departureChecklist"]) {
    const ids = new Set();
    optionalList(raw, key, (item) => cleanChecklistItem(item, ids), p);
  }

  table(raw, "stayNights", p, (n) => typeof n === "number" && Number.isFinite(n) && n >= 1);
  table(raw, "budgetTargets", p, (n) => n == null || (typeof n === "number" && Number.isFinite(n)));
  table(raw, "emergencyInfo", p, (v) => v == null || typeof v === "string");
  table(raw, "parkLists", p, (v) => Array.isArray(v));
  if (raw.park != null && !(isObj(raw.park) && typeof raw.park.name === "string")) p.park = undefined;
  if (raw.stepReminders != null && !isObj(raw.stepReminders)) p.stepReminders = undefined;

  // A cover is a picture fetched over a safe link (Unsplash): anything else is not shown.
  if (raw.coverImage != null) {
    const c = raw.coverImage;
    if (!isObj(c) || typeof c.url !== "string" || !/^https:\/\//i.test(c.url)) p.coverImage = undefined;
    else {
      const cp = {};
      texts(c, ["photographerName", "photographerUrl"], cp);
      const cover = withPatch(c, cp);
      if (cover !== c) p.coverImage = cover;
    }
  }
  return withPatch(raw, p);
}

// A list of trips as the screens need it: { trips, changed }. `changed` is false when everything was right
// already (then `trips` is the list given).
export function cleanTrips(list) {
  if (!Array.isArray(list)) return { trips: [], changed: true };
  const seen = new Set();
  let changed = false;
  const trips = [];
  for (const raw of list) {
    let trip = cleanTrip(raw);
    if (!trip) {
      changed = true;
      continue;
    }
    if (seen.has(trip.id)) trip = { ...trip, id: uid() }; // two trips with one id: every change would hit both
    seen.add(trip.id);
    if (trip !== raw) changed = true;
    trips.push(trip);
  }
  return { trips: changed ? trips : list, changed };
}
