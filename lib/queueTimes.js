// Live wait times of theme parks, from Queue-Times.com (free API, no key).
//
//   GET /parks.json                  -> [{ id, name, parks: [{ id, name, country, continent, latitude, longitude, timezone }] }]
//   GET /parks/{id}/queue_times.json -> { lands: [{ id, name, rides: [{ id, name, is_open, wait_time, last_updated }] }], rides: [...] }
//
// Their terms: data refreshes every 5 minutes, and "Powered by Queue-Times.com"
// linking to queue-times.com must be shown prominently wherever it is used.
import { stripAccents } from "./planner";

const BASE = "https://queue-times.com";
export const QUEUE_TIMES_CREDIT = { text: "Powered by Queue-Times.com", url: "https://queue-times.com/" };

const PARKS_TTL_MS = 6 * 60 * 60 * 1000; // the list of parks hardly ever changes
const WAITS_TTL_MS = 2 * 60 * 1000; // the data itself only moves every 5 minutes

let parksCache = null; // { at, parks }
const waitsCache = new Map(); // parkId -> { at, data }

export function clearQueueTimesCache() {
  parksCache = null;
  waitsCache.clear();
}

function qtError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

async function getJson(path, fetchImpl) {
  let res;
  try {
    res = await (fetchImpl || fetch)(`${BASE}${path}`, { headers: { Accept: "application/json" } });
  } catch (e) {
    throw qtError("NETWORK", "Pas de connexion : impossible de joindre Queue-Times.");
  }
  if (!res.ok) throw qtError("HTTP", `Queue-Times ne répond pas (${res.status}).`);
  try {
    return await res.json();
  } catch (e) {
    throw qtError("HTTP", "Réponse illisible de Queue-Times.");
  }
}

function num(v) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// ---------- Parks ----------

export function parseParks(json) {
  const out = [];
  (Array.isArray(json) ? json : []).forEach((company) => {
    (company && Array.isArray(company.parks) ? company.parks : []).forEach((p) => {
      if (!p || p.id == null || !p.name) return;
      out.push({
        qtId: Number(p.id),
        name: String(p.name).trim(),
        country: p.country || null,
        company: company.name || null,
        lat: num(p.latitude),
        lng: num(p.longitude),
        timezone: p.timezone || null,
      });
    });
  });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchParks({ fetchImpl, now = Date.now() } = {}) {
  if (parksCache && now - parksCache.at < PARKS_TTL_MS) return parksCache.parks;
  const parks = parseParks(await getJson("/parks.json", fetchImpl));
  parksCache = { at: now, parks };
  return parks;
}

// Accent-insensitive search on the park, country and company names; names that
// start with the query come first.
export function searchParks(parks, query, limit = 30) {
  const q = stripAccents(query || "").trim();
  if (!q) return [];
  const scored = [];
  for (const p of parks) {
    const name = stripAccents(p.name);
    let score = -1;
    if (name.startsWith(q)) score = 0;
    else if (name.includes(q)) score = 1;
    else if (stripAccents(`${p.country || ""} ${p.company || ""}`).includes(q)) score = 2;
    if (score >= 0) scored.push({ p, score });
  }
  return scored.sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name)).slice(0, limit).map((x) => x.p);
}

// ---------- Rides ----------

// "Indiana Jones™ and the Temple of Peril" -> "Indiana Jones and the Temple of Peril"
export function cleanRideName(name) {
  return String(name || "")
    .replace(/[™®©℠]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Queue-Times lists single-rider lines as rides of their own; they are the
// same attraction and would only duplicate it.
export function isSingleRider(name) {
  return /single[\s-]*rider/i.test(String(name || ""));
}

// -> { lands: [{ id, name, rides }], rides: [{ id, name, land, open, wait, updated }] }
// (rides: every ride, in park order, with its land's name; "" when it has none)
export function parseQueueTimes(json) {
  const rides = [];
  const lands = [];
  const readRide = (r, landName) => {
    if (!r || r.id == null || !r.name) return null;
    return {
      id: Number(r.id),
      name: cleanRideName(r.name),
      land: landName,
      open: r.is_open !== false,
      wait: r.is_open === false ? null : num(r.wait_time),
      updated: r.last_updated || null,
    };
  };
  const data = json || {};
  (Array.isArray(data.lands) ? data.lands : []).forEach((land) => {
    const landName = cleanRideName(land && land.name);
    const list = (land && Array.isArray(land.rides) ? land.rides : []).map((r) => readRide(r, landName)).filter(Boolean);
    lands.push({ id: land && land.id != null ? Number(land.id) : null, name: landName, rides: list });
    rides.push(...list);
  });
  (Array.isArray(data.rides) ? data.rides : []).forEach((r) => {
    const ride = readRide(r, "");
    if (ride && !rides.some((x) => x.id === ride.id)) rides.push(ride);
  });
  return { lands, rides };
}

// Cached for 2 minutes: leaving and re-entering a screen does not hit the API again.
export async function fetchQueueTimes(parkId, { fetchImpl, force = false, now = Date.now() } = {}) {
  const hit = waitsCache.get(parkId);
  if (!force && hit && now - hit.at < WAITS_TTL_MS) return hit.data;
  const data = { ...parseQueueTimes(await getJson(`/parks/${parkId}/queue_times.json`, fetchImpl)), fetchedAt: now };
  waitsCache.set(parkId, { at: now, data });
  return data;
}

// Live data indexed by ride id, for quick lookups from an attraction's qtId.
export function liveByRideId(data) {
  const map = new Map();
  if (data) data.rides.forEach((r) => map.set(r.id, r));
  return map;
}

// "il y a 3 min", from an ISO timestamp.
export function ageLabel(iso, now = Date.now()) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return null;
  const min = Math.max(0, Math.round((now - t) / 60000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `il y a ${h} h` : "il y a plus d'un jour";
}

// Open rides out of all rides (single-rider lines are not rides of their own),
// and the average queue of the open ones: { open, total, avgWait }.
export function liveSummary(rides) {
  const list = (rides || []).filter((r) => !isSingleRider(r.name));
  const open = list.filter((r) => r.open);
  const waits = open.map((r) => r.wait).filter((w) => w != null);
  return {
    open: open.length,
    total: list.length,
    avgWait: waits.length ? Math.round(waits.reduce((s, w) => s + w, 0) / waits.length) : null,
  };
}

// The most recent "last_updated" among the rides (ISO), or null.
export function latestUpdate(rides) {
  let best = null;
  let bestT = -Infinity;
  (rides || []).forEach((r) => {
    const t = Date.parse(r.updated || "");
    if (Number.isFinite(t) && t > bestT) {
      best = r.updated;
      bestT = t;
    }
  });
  return best;
}

// Queue colour: short is teal, medium gold, long stamp red.
export function waitTone(wait) {
  return wait <= 20 ? "teal" : wait <= 45 ? "gold" : "stamp";
}
