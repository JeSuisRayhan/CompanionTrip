// Address / place lookup through Nominatim (OpenStreetMap) — free, no key.
//
// Nominatim's usage policy, which this file respects:
//   - at most 1 request per second  -> every call goes through one queue
//   - an identifying User-Agent     -> app name + public repo URL
//   - no search-as-you-type         -> callers must trigger it from a button
//   - cache results                 -> same query is never sent twice
// Data © OpenStreetMap contributors (ODbL) — the UI shows the attribution.

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
export const USER_AGENT = "CompagnonDeVoyage/1.0 (+https://github.com/JeSuisRayhan/CompanionTrip)";
export const MIN_GAP_MS = 1100; // a little over the 1 req/s limit, for safety

let lastCallAt = 0;
let queue = Promise.resolve();
const cache = new Map();

export function clearGeocodeCache() {
  cache.clear();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Runs tasks strictly one after another, never closer than MIN_GAP_MS apart.
// A failed task does not break the queue for the next one.
function schedule(task) {
  const run = queue.then(async () => {
    const wait = lastCallAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    return task();
  });
  queue = run.catch(() => {});
  return run;
}

function geocodeError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function num(v) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

// One raw Nominatim hit -> the small shape the app stores on an idea.
export function normalizeResult(r) {
  if (!r) return null;
  const lat = num(r.lat);
  const lng = num(r.lon);
  if (lat == null || lng == null) return null;

  const a = r.address || {};
  const city = a.city || a.town || a.village || a.municipality || a.hamlet || a.suburb || a.county || null;
  const street = [a.house_number, a.road || a.pedestrian || a.footway].filter(Boolean).join(" ").trim();
  const localityLine = [a.postcode, city].filter(Boolean).join(" ").trim();
  const composed = [street, localityLine, a.country].filter(Boolean).join(", ");

  const displayName = r.display_name || "";
  const firstSegment = displayName.split(",")[0].trim();
  const name = (r.name && r.name.trim()) || (r.namedetails && r.namedetails.name) || firstSegment || "";

  return {
    name,
    address: composed || displayName,
    city,
    country: a.country || null,
    lat: round6(lat),
    lng: round6(lng),
    kind: r.type || r.category || null,
    openingHours: (r.extratags && r.extratags.opening_hours) || null,
    osmRef: r.osm_type && r.osm_id ? `${String(r.osm_type)[0]}${r.osm_id}` : null,
  };
}

// Average position of points that have coordinates, or null. Used to bias
// the search toward where the trip already is (a "Marché" query then finds
// the one on the same island, not one on the other side of the world).
export function centroidOf(points) {
  const valid = (points || []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!valid.length) return null;
  const lat = valid.reduce((s, p) => s + p.lat, 0) / valid.length;
  const lng = valid.reduce((s, p) => s + p.lng, 0) / valid.length;
  return { lat, lng };
}

export function buildSearchUrl(query, { near = null, limit = 5 } = {}) {
  const params = [
    `q=${encodeURIComponent(query)}`,
    "format=jsonv2",
    "addressdetails=1",
    "extratags=1",
    "dedupe=1",
    "accept-language=fr",
    `limit=${limit}`,
  ];
  if (near && Number.isFinite(near.lat) && Number.isFinite(near.lng)) {
    const d = 0.5; // ~50 km: a preference, not a filter (bounded stays 0)
    params.push(`viewbox=${round6(near.lng - d)},${round6(near.lat + d)},${round6(near.lng + d)},${round6(near.lat - d)}`);
  }
  return `${ENDPOINT}?${params.join("&")}`;
}

export async function searchPlaces(query, { near = null, limit = 5 } = {}) {
  const q = (query || "").trim();
  if (q.length < 3) return [];

  const nearKey = near && Number.isFinite(near.lat) && Number.isFinite(near.lng) ? `${near.lat.toFixed(1)},${near.lng.toFixed(1)}` : "";
  const key = `${q.toLowerCase()}|${nearKey}|${limit}`;
  if (cache.has(key)) return cache.get(key);

  const url = buildSearchUrl(q, { near, limit });
  const results = await schedule(async () => {
    let res;
    try {
      res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json", "Accept-Language": "fr" } });
    } catch (e) {
      throw geocodeError("NETWORK", "Pas de connexion — réessayez, ou saisissez l'adresse à la main.");
    }
    if (res.status === 429) throw geocodeError("RATE_LIMIT", "Trop de recherches d'affilée — patientez quelques secondes.");
    if (!res.ok) throw geocodeError("HTTP", `Service de recherche indisponible (${res.status}).`);
    let json;
    try {
      json = await res.json();
    } catch (e) {
      throw geocodeError("HTTP", "Réponse illisible du service de recherche.");
    }
    return Array.isArray(json) ? json.map(normalizeResult).filter(Boolean) : [];
  });

  cache.set(key, results);
  return results;
}

// The address without what OpenStreetMap rarely knows: postal code, house or
// block number ("12 ", "1 Chome-4-4", "1-4-4"), the "City" after a ward
// ("Kita City"). What is left is the street / district, which is enough to
// put the pin in the right place when the exact address matches nothing.
export function looseAddress(address) {
  return String(address == null ? "" : address)
    .replace(/〒/g, " ")
    .replace(/\b\d{3}-\d{4}\b/g, " ") // Japanese postal code
    .replace(/\b\d+\s*-?\s*chome(?:\s*-\s*\d+){0,2}\b/gi, " ") // "1 Chome-4-4"
    .replace(/(^|,)\s*\d+(?:\s*-\s*\d+)+(?=\s|,|$)/g, "$1 ") // "1-4-4"
    .replace(/(^|,)\s*\d+[a-z]?\s+(?=\D)/gi, "$1 ") // leading house number "12 Rue X"
    .split(",")
    .map((part, i) => { const t = part.replace(/\s+/g, " ").trim(); return i === 0 ? t : t.replace(/^(\p{L}+) City$/iu, "$1"); }) // "Kita City" -> "Kita" (not a first part: "Kansas City")
    .filter((part, i, all) => part && part.toLowerCase() !== (all[i - 1] || "").toLowerCase())
    .join(", ");
}

// The queries to try, most specific first: { q, loose }. A place is rarely
// found by the most specific one ("Chez Moktar, 12 Rue X, Midoun" often
// matches nothing while "Chez Moktar, Midoun" does). Each attempt goes through
// the 1 req/s queue and the first one that returns something wins. `loose` queries (the
// address stripped of its numbers) only run when asked for, and their hits are
// approximate: the district, not the door.
function queryPlan({ name, address, city, fallbackCity }, { loose = false } = {}) {
  const clean = (v) => (v == null ? "" : String(v).trim());
  const n = clean(name);
  const a = clean(address);
  const c = clean(city) || clean(fallbackCity);
  const plan = [];
  const push = (isLoose, ...parts) => {
    const q = parts.filter(Boolean).join(", ");
    if (q.length >= 3 && !plan.some((p) => p.q === q)) plan.push({ q, loose: isLoose });
  };
  if (n) push(false, n, c);
  if (n && a) push(false, n, a);
  if (a) push(false, a, c && !a.toLowerCase().includes(c.toLowerCase()) ? c : null);
  if (loose) {
    const l = looseAddress(a);
    // Three parts or more already say where it is ("Akabane, Kita, Tokyo"): the city adds nothing.
    if (l && l !== a) push(true, l, l.split(",").length < 3 && c && !l.toLowerCase().includes(c.toLowerCase()) ? c : null);
    // The name alone comes last: with no place to anchor it, it may find a namesake far away.
    if (n) push(false, n);
    return plan.slice(0, 5);
  }
  if (n) push(false, n);
  return plan.slice(0, 3);
}

export function buildQueryVariants(parts, options) {
  return queryPlan(parts, options).map((p) => p.q);
}

// { results, query, approximate }: approximate = the hits come from the
// stripped address (district level), so the caller should keep the address
// the person typed and only take the position.
export async function searchPlacesWithFallback(parts, { near = null, limit = 5, loose = false } = {}) {
  for (const { q, loose: approximate } of queryPlan(parts, { loose })) {
    const results = await searchPlaces(q, { near, limit });
    if (results.length) return { results, query: q, approximate };
  }
  return { results: [], query: null, approximate: false };
}
