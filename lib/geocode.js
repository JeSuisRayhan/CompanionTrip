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

  const out = {
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
  // [south, north, west, east]: the extent of a town, an island, a country (to search inside it later).
  const bb = Array.isArray(r.boundingbox) ? r.boundingbox.map(num) : null;
  if (bb && bb.length === 4 && bb.every((v) => v != null)) out.bbox = { south: bb[0], north: bb[1], west: bb[2], east: bb[3] };
  return out;
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

// A search area: { south, north, west, east }.
export function validBox(box) {
  return !!box && [box.south, box.north, box.west, box.east].every(Number.isFinite) && box.south < box.north && box.west < box.east;
}

// The area of `center` +/- `half` degrees (about 110 km per degree), at least `min` wide.
export function boxAround(center, half = 0.35) {
  return { south: center.lat - half, north: center.lat + half, west: center.lng - half, east: center.lng + half };
}

// The extent of a lookup result, a little wider (the edge of a town is not where the visits stop),
// and never narrower than `minHalf` degrees around its centre.
export function boxOfResult(hit, { pad = 0.1, minHalf = 0.15 } = {}) {
  if (!hit) return null;
  const b = hit.bbox;
  const c = { lat: hit.lat, lng: hit.lng };
  const south = Math.min(c.lat - minHalf, b ? b.south - pad : Infinity);
  const north = Math.max(c.lat + minHalf, b ? b.north + pad : -Infinity);
  const west = Math.min(c.lng - minHalf, b ? b.west - pad : Infinity);
  const east = Math.max(c.lng + minHalf, b ? b.east + pad : -Infinity);
  return { south: Math.max(-85, south), north: Math.min(85, north), west: Math.max(-180, west), east: Math.min(180, east) };
}

export function buildSearchUrl(query, { near = null, limit = 5, box = null } = {}) {
  const params = [
    `q=${encodeURIComponent(query)}`,
    "format=jsonv2",
    "addressdetails=1",
    "extratags=1",
    "dedupe=1",
    "accept-language=fr",
    `limit=${limit}`,
  ];
  if (validBox(box)) {
    // Only inside this area: a namesake on the other side of the world is not a candidate.
    params.push(`viewbox=${round6(box.west)},${round6(box.north)},${round6(box.east)},${round6(box.south)}`, "bounded=1");
  } else if (near && Number.isFinite(near.lat) && Number.isFinite(near.lng)) {
    const d = 0.5; // ~50 km: a preference, not a filter (bounded stays 0)
    params.push(`viewbox=${round6(near.lng - d)},${round6(near.lat + d)},${round6(near.lng + d)},${round6(near.lat - d)}`);
  }
  return `${ENDPOINT}?${params.join("&")}`;
}

export async function searchPlaces(query, { near = null, limit = 5, box = null } = {}) {
  const q = (query || "").trim();
  if (q.length < 3) return [];

  const nearKey = near && Number.isFinite(near.lat) && Number.isFinite(near.lng) ? `${near.lat.toFixed(1)},${near.lng.toFixed(1)}` : "";
  const boxKey = validBox(box) ? [box.south, box.north, box.west, box.east].map((v) => v.toFixed(2)).join(",") : "";
  const key = `${q.toLowerCase()}|${nearKey}|${boxKey}|${limit}`;
  if (cache.has(key)) return cache.get(key);

  const url = buildSearchUrl(q, { near, limit, box });
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
    .replace(/\b\d{4,5}\b/g, " ") // postal code (4116, 75008)
    .replace(/(^|,)\s*\d+[a-z]?\s+(?=\D)/gi, "$1 ") // leading house number "12 Rue X"
    .split(",")
    .map((part, i) => { const t = part.replace(/\s+/g, " ").trim(); return i === 0 ? t : t.replace(/^(\p{L}+) City$/iu, "$1"); }) // "Kita City" -> "Kita" (not a first part: "Kansas City")
    .filter((part, i, all) => part && part.toLowerCase() !== (all[i - 1] || "").toLowerCase())
    .join(", ");
}

// The proper noun at the end of a name ("Marché de Houmt Souk" -> "Houmt Souk"), or "".
export function properNameTail(name) {
  const words = String(name || "").trim().split(/\s+/);
  let i = words.length;
  while (i > 0 && /^\p{Lu}/u.test(words[i - 1])) i -= 1;
  const tail = words.slice(i).join(" ");
  return i > 0 && tail.length >= 4 ? tail : "";
}

// The queries to try, most specific first: { q, loose }. A place is rarely
// found by the most specific one ("Chez Moktar, 12 Rue X, Midoun" often
// matches nothing while "Chez Moktar, Midoun" does). Each attempt goes through
// the 1 req/s queue and the first one that returns something wins.
//   loose:   also tries the address stripped of its numbers, then one level
//            coarser (the first part dropped: the street, then the town). Their
//            hits are approximate: the district, not the door.
//   bounded: the search is already restricted to an area, so the city is left out
//            of the queries, and the bare name is only tried last when there is an address.
function queryPlan({ name, address, city, fallbackCity }, { loose = false, bounded = false } = {}) {
  const clean = (v) => (v == null ? "" : String(v).trim());
  const n = clean(name);
  const a = clean(address);
  const c = bounded ? "" : clean(city) || clean(fallbackCity);
  const plan = [];
  const push = (isLoose, ...parts) => {
    const q = parts.filter(Boolean).join(", ");
    if (q.length >= 3 && !plan.some((p) => p.q === q)) plan.push({ q, loose: isLoose });
  };
  if (bounded && !a) {
    push(false, n);
    // "sanctuaire Meiji Jingu" -> "Meiji Jingu": the capitalised end is the name OpenStreetMap knows.
    const tail = properNameTail(n);
    if (tail) push(true, tail);
    return plan;
  }
  if (!bounded && n) push(false, n, c);
  if (n && a) push(false, n, a);
  if (a) push(false, a, c && !a.toLowerCase().includes(c.toLowerCase()) ? c : null);
  if (loose) {
    const l = looseAddress(a);
    const parts = l ? l.split(", ") : [];
    // Three parts or more already say where it is ("Akabane, Kita, Tokyo"): the city adds nothing.
    if (l) push(true, l, parts.length < 3 && c && !l.toLowerCase().includes(c.toLowerCase()) ? c : null);
    if (parts.length >= 3) push(true, parts.slice(1).join(", "));
    // The bare name comes last: it may find a namesake.
    if (n) push(false, n);
    return plan.slice(0, 6);
  }
  if (n) push(false, n);
  return plan.slice(0, 3);
}

export function buildQueryVariants(parts, options) { // options: { loose, bounded }
  return queryPlan(parts, options).map((p) => p.q);
}

// { results, query, approximate }: approximate = the hits come from the
// stripped address (district level), so the caller should keep the address
// the person typed and only take the position.
export async function searchPlacesWithFallback(parts, { near = null, limit = 5, loose = false, box = null } = {}) {
  for (const { q, loose: approximate } of queryPlan(parts, { loose, bounded: validBox(box) })) {
    const results = await searchPlaces(q, { near, limit, box });
    if (results.length) return { results, query: q, approximate };
  }
  return { results: [], query: null, approximate: false };
}
