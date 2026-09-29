// Amusement-park mode: the park of a trip and its attractions.
//
// A park trip reuses the idea notebook: an attraction IS an idea (name, zone
// in `land`, priority, position, usual wait…), so the map, the placing on a
// day and the editing all work the same way. What is specific lives here:
//   - trip.park = { qtId, name, country, lat, lng, timezone, minHeightCm }
//   - loading the attractions of a park from Queue-Times
//   - finding their positions on OpenStreetMap (Overpass, one request)
import { makeIdea, hasPosition } from "./ideas";
import { updateTrip } from "./trips";
import { stripAccents } from "./planner";
import { cleanRideName, isSingleRider } from "./queueTimes";
import { USER_AGENT } from "./geocode";

export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
export const PARK_RADIUS_M = 1500;

export function isParkTrip(trip) {
  return !!trip && trip.tripType === "park";
}

export function hasParkPosition(park) {
  return !!park && Number.isFinite(park.lat) && Number.isFinite(park.lng);
}

// ---------- The park of a trip ----------

// Keeps the traveller's own setting (height of the smallest child) when the
// park changes: it is about them, not about the park.
export async function setPark(tripId, park) {
  return updateTrip(tripId, (trip) => ({
    ...trip,
    park: {
      qtId: park.qtId,
      name: park.name,
      country: park.country || null,
      lat: Number.isFinite(park.lat) ? park.lat : null,
      lng: Number.isFinite(park.lng) ? park.lng : null,
      timezone: park.timezone || null,
      minHeightCm: trip.park && trip.park.minHeightCm != null ? trip.park.minHeightCm : null,
    },
  }));
}

export async function setMinHeight(tripId, cm) {
  const n = Number(cm);
  const value = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  return updateTrip(tripId, (trip) => ({ ...trip, park: { ...(trip.park || {}), minHeightCm: value } }));
}

// The smallest person of the group can not go on a ride with a higher minimum.
export function tooTall(idea, trip) {
  const limit = trip.park && trip.park.minHeightCm;
  return !!limit && !!idea.minHeightCm && idea.minHeightCm > limit;
}

// ---------- Names ----------

const STOP_WORDS = new Set(["the", "le", "la", "les", "l", "de", "du", "des", "d", "of", "and", "et", "au", "aux", "en", "un", "une", "at", "in"]);

// Lower case, no accents, no punctuation: "Peter Pan's Flight" -> "peter pan s flight"
export function normName(s) {
  return stripAccents(cleanRideName(s)).replace(/[^a-z0-9]+/g, " ").trim();
}

export function nameTokens(s) {
  return normName(s)
    .split(" ")
    .filter((t) => t && !STOP_WORDS.has(t) && (t.length > 1 || /\d/.test(t)));
}

// ---------- Loading the attractions ----------

const SHOW_WORDS = /\b(show|spectacle|parade|cavalcade|concert|theatre|theater|cinema|cin[eé]ma|live)\b/i;

// The attractions to add for a list of Queue-Times rides: single-rider lines
// and the ones already in the notebook (same ride id or same name) are left out.
export function attractionInputs(rides, trip) {
  const known = trip.ideas || [];
  const ids = new Set(known.filter((i) => i.qtId != null).map((i) => i.qtId));
  const names = new Set(known.map((i) => normName(i.name)));
  const out = [];
  let skipped = 0;
  for (const ride of rides || []) {
    if (isSingleRider(ride.name)) continue;
    const key = normName(ride.name);
    if (ids.has(ride.id) || names.has(key)) {
      skipped += 1;
      continue;
    }
    ids.add(ride.id);
    names.add(key);
    out.push({
      name: ride.name,
      categoryId: SHOW_WORDS.test(ride.name) ? "spectacle" : "activite",
      land: ride.land || null,
      qtId: ride.id,
      priority: "maybe", // the traveller promotes the ones that matter
    });
  }
  return { inputs: out, skipped };
}

// One write for the whole list. Returns { added, skipped }.
export async function importParkAttractions(tripId, rides) {
  let result = { added: 0, skipped: 0 };
  await updateTrip(tripId, (trip) => {
    const { inputs, skipped } = attractionInputs(rides, trip);
    result = { added: inputs.length, skipped };
    if (!inputs.length) return trip;
    return { ...trip, ideas: [...(trip.ideas || []), ...inputs.map((i) => makeIdea(i, trip))] };
  });
  return result;
}

// Zones in the order the attractions were loaded, each with its attractions.
export function groupByLand(ideas) {
  const groups = [];
  const index = new Map();
  ideas.forEach((idea) => {
    const key = idea.land || "";
    if (!index.has(key)) {
      const g = { land: key, name: key || "Autres", ideas: [] };
      index.set(key, g);
      groups.push(g);
    }
    index.get(key).ideas.push(idea);
  });
  // "Autres" (no zone) always last
  return groups.sort((a, b) => (a.land === "" ? 1 : 0) - (b.land === "" ? 1 : 0));
}

// ---------- Positions from OpenStreetMap ----------

export function overpassQuery(lat, lng, radiusM = PARK_RADIUS_M) {
  const around = `(around:${Math.round(radiusM)},${lat},${lng})`;
  return `[out:json][timeout:25];(nwr["name"]["tourism"="attraction"]${around};nwr["name"]["attraction"]${around};nwr["name"]["amenity"="theatre"]${around};);out center tags;`;
}

// Overpass elements -> [{ names: [...], lat, lng }] (ways and relations give their centre).
export function parseOverpass(json) {
  const out = [];
  (json && Array.isArray(json.elements) ? json.elements : []).forEach((el) => {
    const tags = el.tags || {};
    const lat = Number.isFinite(el.lat) ? el.lat : el.center && el.center.lat;
    const lng = Number.isFinite(el.lon) ? el.lon : el.center && el.center.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const names = [tags.name, tags["name:en"], tags["name:fr"], tags.alt_name, tags.official_name, tags.short_name].filter(Boolean);
    if (names.length) out.push({ names, lat, lng });
  });
  return out;
}

// How well two names describe the same place, 0..1: the share of the shorter
// name's words found in the other (so "Space Mountain" matches "Space Mountain:
// Mission 2"). One-word names must be equal and long enough to mean something.
export function nameScore(a, b) {
  const A = nameTokens(a);
  const B = nameTokens(b);
  if (!A.length || !B.length) return 0;
  const setB = new Set(B);
  const common = A.filter((t) => setB.has(t)).length;
  const shorter = Math.min(A.length, B.length);
  if (shorter === 1) return common === 1 && A.length === B.length && A[0].length >= 4 ? 1 : 0;
  return common / shorter;
}

const MATCH_MIN = 0.8; // "Railroad Discoveryland Station" must not land on "Railroad Main Street Station"

// Best feature for every idea that has no position yet -> { ideaId: { lat, lng } }.
// A name that matches two different places equally well is not guessed.
export function matchPositions(ideas, features) {
  const found = {};
  for (const idea of ideas) {
    if (hasPosition(idea)) continue;
    let best = null;
    let tie = false;
    for (const f of features) {
      const score = Math.max(...f.names.map((n) => nameScore(idea.name, n)));
      if (score < MATCH_MIN) continue;
      if (!best || score > best.score) {
        best = { f, score };
        tie = false;
      } else if (score === best.score && (Math.abs(f.lat - best.f.lat) > 1e-4 || Math.abs(f.lng - best.f.lng) > 1e-4)) {
        tie = true;
      }
    }
    if (best && !tie) found[idea.id] = { lat: best.f.lat, lng: best.f.lng };
  }
  return found;
}

export async function fetchParkFeatures(park, { fetchImpl, radiusM = PARK_RADIUS_M } = {}) {
  let res;
  try {
    res = await (fetchImpl || fetch)(OVERPASS_URL, {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: `data=${encodeURIComponent(overpassQuery(park.lat, park.lng, radiusM))}`,
    });
  } catch (e) {
    const err = new Error("Pas de connexion : impossible de chercher les positions.");
    err.code = "NETWORK";
    throw err;
  }
  if (res.status === 429 || res.status === 504) {
    const err = new Error("Le service de cartes est occupé : réessayez dans une minute.");
    err.code = "RATE_LIMIT";
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`Service de cartes indisponible (${res.status}).`);
    err.code = "HTTP";
    throw err;
  }
  let json;
  try {
    json = await res.json();
  } catch (e) {
    const err = new Error("Réponse illisible du service de cartes.");
    err.code = "HTTP";
    throw err;
  }
  return parseOverpass(json);
}

// Positions of the park's attractions in a single request, matched by name.
// Returns the same shape as locateIdeas().found so both can be saved alike.
export async function locateParkAttractions(trip, { fetchImpl } = {}) {
  const todo = (trip.ideas || []).filter((i) => !hasPosition(i));
  if (!hasParkPosition(trip.park) || !todo.length) return { found: {}, foundCount: 0, total: todo.length, error: null };
  try {
    const features = await fetchParkFeatures(trip.park, { fetchImpl });
    const found = matchPositions(todo, features);
    return { found, foundCount: Object.keys(found).length, total: todo.length, error: null };
  } catch (e) {
    return { found: {}, foundCount: 0, total: todo.length, error: e };
  }
}
