// Map of the trip on OpenStreetMap tiles.
//
// Everything here is plain maths and data shaping (no React), so it can be
// tested without a device:
//   - Web Mercator projection, the tiles visible in a viewport, fit-to-points
//   - which pins a trip has (ideas + programme steps with a position), the
//     per-day route, and the ideas that still have no position
//   - looking up the missing positions on Nominatim, in one write
//
// Tiles © OpenStreetMap contributors (ODbL). The map component shows the
// attribution. Tile usage policy: an identifying User-Agent, no bulk
// downloading, no pre-fetching — tiles are only requested for what is on screen.
import { getIdeaCategory, ideaAddressLine, hasPosition, placementIndex, priorityMeta } from "./ideas";
import { TYPES } from "./constants";
import { centroidOf, searchPlacesWithFallback } from "./geocode";
import { distanceKm } from "./planner";
import { FAR_FROM_TRIP_KM } from "./importIdeas";
import { updateTrip } from "./trips";
import { resolveDayDate } from "./dates";

export const TILE_SIZE = 256;
export const MIN_ZOOM = 1; // two continents fit on a phone
export const MAX_ZOOM = 19;
const MAX_LAT = 85.05112878;
const MAX_TILES = 64; // safety net: a viewport never needs more than ~20

export const TILE_USER_AGENT = "CompagnonDeVoyage/1.0 (+https://github.com/JeSuisRayhan/CompanionTrip)";

// ---------- Projection ----------

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function clampZoom(z) {
  return clamp(Number.isFinite(z) ? z : MIN_ZOOM, MIN_ZOOM, MAX_ZOOM);
}

function worldSize(zoom) {
  return TILE_SIZE * Math.pow(2, zoom);
}

function normalizeLng(lng) {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

// lat/lng -> pixel in the whole-world image at that zoom (may be fractional).
export function project(lat, lng, zoom) {
  const s = worldSize(zoom);
  const sin = Math.sin((clamp(lat, -MAX_LAT, MAX_LAT) * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * s,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s,
  };
}

export function unproject(x, y, zoom) {
  const s = worldSize(zoom);
  const yy = clamp(y, 0, s);
  const n = Math.PI - (2 * Math.PI * yy) / s;
  return {
    lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))),
    lng: normalizeLng((x / s) * 360 - 180),
  };
}

// A view is { lat, lng, zoom }: the point in the middle of the viewport.
// size is { width, height } in px.
export function toScreen(point, view, size) {
  const c = project(view.lat, view.lng, view.zoom);
  const p = project(point.lat, point.lng, view.zoom);
  return { x: size.width / 2 + (p.x - c.x), y: size.height / 2 + (p.y - c.y) };
}

export function fromScreen(screen, view, size) {
  const c = project(view.lat, view.lng, view.zoom);
  return unproject(c.x + (screen.x - size.width / 2), c.y + (screen.y - size.height / 2), view.zoom);
}

// The view where `geo` sits at `screenPt` on screen, at `zoom`. One function
// for dragging (same zoom, finger moved), pinching (zoom changed) and
// "centre on this pin" (screenPt = middle of the viewport).
export function viewFromAnchor(geo, screenPt, zoom, size) {
  const z = clampZoom(zoom);
  const p = project(geo.lat, geo.lng, z);
  const c = unproject(p.x - (screenPt.x - size.width / 2), p.y - (screenPt.y - size.height / 2), z);
  return { lat: clamp(c.lat, -MAX_LAT, MAX_LAT), lng: c.lng, zoom: z };
}

export function zoomBy(view, size, delta) {
  const target = clampZoom(Math.round(view.zoom) + delta);
  return viewFromAnchor(view, { x: size.width / 2, y: size.height / 2 }, target, size);
}

export function centerOn(view, point, size, zoom) {
  return viewFromAnchor(point, { x: size.width / 2, y: size.height / 2 }, zoom == null ? view.zoom : zoom, size);
}

// The view that shows all the points, with `padding` px around them.
export function fitBounds(points, size, { padding = 56, maxZoom = 16, singleZoom = 15 } = {}) {
  const valid = (points || []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!valid.length || !size || !size.width || !size.height) return null;

  const world = valid.map((p) => project(p.lat, p.lng, 0));
  const minX = Math.min(...world.map((p) => p.x));
  const maxX = Math.max(...world.map((p) => p.x));
  const minY = Math.min(...world.map((p) => p.y));
  const maxY = Math.max(...world.map((p) => p.y));
  const center = unproject((minX + maxX) / 2, (minY + maxY) / 2, 0);

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  if (valid.length === 1 || (spanX < 1e-9 && spanY < 1e-9)) {
    return { lat: center.lat, lng: center.lng, zoom: clampZoom(Math.min(singleZoom, maxZoom)) };
  }

  const availW = Math.max(1, size.width - padding * 2);
  const availH = Math.max(1, size.height - padding * 2);
  const zx = spanX > 1e-9 ? Math.log2(availW / spanX) : Infinity;
  const zy = spanY > 1e-9 ? Math.log2(availH / (spanY * 1)) : Infinity;
  // spans are measured at zoom 0 where the world is TILE_SIZE px wide
  const zoom = Math.min(zx, zy);
  return { lat: center.lat, lng: center.lng, zoom: clamp(Math.floor(zoom * 4) / 4, MIN_ZOOM, maxZoom) };
}

// ---------- Tiles ----------

export function tileUrl(z, x, y) {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

// The tiles covering the viewport. Tiles come in whole zoom levels; between
// two levels they are scaled (0.71x to 1.41x). Neighbouring tiles overlap by
// a pixel so no seam shows through when the scale is fractional.
export function visibleTiles(view, size) {
  if (!size || !size.width || !size.height) return [];
  const tz = clamp(Math.round(view.zoom), 0, MAX_ZOOM);
  const scale = Math.pow(2, view.zoom - tz);
  const n = Math.pow(2, tz);
  const c = project(view.lat, view.lng, tz);
  const halfW = size.width / 2 / scale;
  const halfH = size.height / 2 / scale;

  const minTx = Math.floor((c.x - halfW) / TILE_SIZE);
  const maxTx = Math.floor((c.x + halfW) / TILE_SIZE);
  const minTy = Math.max(0, Math.floor((c.y - halfH) / TILE_SIZE));
  const maxTy = Math.min(n - 1, Math.floor((c.y + halfH) / TILE_SIZE));
  if ((maxTx - minTx + 1) * (maxTy - minTy + 1) > MAX_TILES) return [];

  const px = TILE_SIZE * scale;
  const tiles = [];
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const wx = ((tx % n) + n) % n;
      tiles.push({
        key: `${tz}/${wx}/${ty}@${tx}`,
        url: tileUrl(tz, wx, ty),
        left: Math.floor(size.width / 2 + (tx * TILE_SIZE - c.x) * scale),
        top: Math.floor(size.height / 2 + (ty * TILE_SIZE - c.y) * scale),
        size: Math.ceil(px) + 1,
      });
    }
  }
  return tiles;
}

// ---------- Pins ----------

function isFinitePos(o) {
  return !!o && Number.isFinite(o.lat) && Number.isFinite(o.lng);
}

function timeRank(time) {
  return time ? time : "99:99"; // untimed steps go last, like on the day screen
}

// Everything the map can show for a trip.
//   pins:      ideas with a position + programme steps with a position that
//              are not linked to an idea (a booked hotel, a scanned ticket…)
//   unlocated: ideas that have no position yet
//   days:      one entry per day: its pins in time order (order = 1, 2, 3…),
//              and how many of its steps have no position
export function buildMapModel(trip) {
  const ideas = trip.ideas || [];
  const placed = placementIndex(trip);
  const pins = [];
  const unlocated = [];

  ideas.forEach((idea) => {
    if (!hasPosition(idea)) {
      unlocated.push(idea);
      return;
    }
    const cat = getIdeaCategory(trip, idea.categoryId);
    const place = placed.get(idea.id);
    pins.push({
      id: `i:${idea.id}`,
      kind: "idea",
      ideaId: idea.id,
      name: idea.name,
      address: ideaAddressLine(idea),
      lat: idea.lat,
      lng: idea.lng,
      categoryId: cat.id,
      categoryLabel: cat.label,
      icon: cat.icon,
      color: cat.color,
      isHotel: cat.activityType === "hotel",
      priority: idea.priority,
      priorityLabel: priorityMeta(idea.priority).label,
      durationMin: idea.durationMin || 0,
      dayId: place ? place.day.id : null,
      dayIndex: place ? place.dayIndex : null,
      activityId: place ? place.activity.id : null,
      time: place ? place.activity.time || null : null,
    });
  });

  (trip.days || []).forEach((day, dayIndex) => {
    (day.activities || []).forEach((a) => {
      if (a.ideaId && ideas.some((i) => i.id === a.ideaId)) return; // shown as its idea
      if (!isFinitePos(a)) return;
      const t = TYPES[a.type] || TYPES.activite;
      pins.push({
        id: `a:${a.id}`,
        kind: "step",
        ideaId: null,
        name: a.title || t.label,
        address: a.address || "",
        lat: a.lat,
        lng: a.lng,
        categoryId: a.type || "activite",
        categoryLabel: t.label,
        icon: t.icon,
        color: t.color,
        isHotel: a.type === "hotel",
        priority: null,
        priorityLabel: null,
        durationMin: 0,
        dayId: day.id,
        dayIndex,
        activityId: a.id,
        time: a.time || null,
      });
    });
  });

  const days = (trip.days || []).map((day, dayIndex) => {
    const own = pins
      .map((pin, i) => ({ pin, i }))
      .filter(({ pin }) => pin.dayId === day.id)
      .sort((a, b) => {
        const t = timeRank(a.pin.time).localeCompare(timeRank(b.pin.time));
        return t !== 0 ? t : a.i - b.i;
      })
      .map(({ pin }, k) => ({ ...pin, order: k + 1 }));
    const withPosition = (day.activities || []).filter((a) => {
      if (isFinitePos(a)) return true;
      const idea = a.ideaId ? ideas.find((i) => i.id === a.ideaId) : null;
      return !!idea && hasPosition(idea);
    }).length;
    return {
      dayId: day.id,
      dayIndex,
      title: day.title || `Jour ${dayIndex + 1}`,
      date: resolveDayDate(trip, day, dayIndex),
      pins: own,
      missing: (day.activities || []).length - withPosition,
    };
  });

  const toPlace = pins.filter((p) => p.kind === "idea" && !p.dayId && !p.isHotel);
  return { pins, unlocated, days, toPlace };
}

// The filter ids are "all", "todo" (ideas not on a day yet) or a day id.
export function pinsForFilter(model, filter) {
  if (filter === "all") return { pins: model.pins, route: [], day: null };
  if (filter === "todo") return { pins: model.toPlace, route: [], day: null };
  const day = model.days.find((d) => d.dayId === filter);
  if (!day) return { pins: [], route: [], day: null };
  return { pins: day.pins, route: day.pins, day };
}

// Chips of the screen: the filters that have something to show.
export function filterOptions(model) {
  const options = [{ id: "all", label: "Tout", count: model.pins.length }];
  if (model.toPlace.length) options.push({ id: "todo", label: "À placer", count: model.toPlace.length });
  model.days.forEach((d) => {
    if (d.pins.length) options.push({ id: d.dayId, label: `Jour ${d.dayIndex + 1}`, count: d.pins.length });
  });
  return options;
}

// Opens the place in the phone's map app (any app on Android through geo:).
export function externalMapUrl(pin, os) {
  const ll = `${pin.lat},${pin.lng}`;
  const label = encodeURIComponent(pin.name || "Lieu");
  if (os === "android") return `geo:${ll}?q=${ll}(${label})`;
  if (os === "ios") return `https://maps.apple.com/?daddr=${ll}&q=${label}`;
  return `https://www.openstreetmap.org/?mlat=${pin.lat}&mlon=${pin.lng}#map=17/${pin.lat}/${pin.lng}`;
}

// ---------- Finding positions for ideas that have none ----------

// Looks the ideas up one after the other (Nominatim allows 1 request/s, the
// geocode queue enforces it). Results far from the rest of the notebook are
// namesakes and are ignored. Returns what was found, keyed by idea id.
// `near` seeds the "close to what is already known" check when nothing is placed
// yet (a park's centre), `maxKm` tightens it, `fallbackCity` replaces the trip's
// default location as the search area (a park's name).
export async function locateIdeas(trip, { onProgress, shouldStop, search = searchPlacesWithFallback, near: seed = null, maxKm = FAR_FROM_TRIP_KM, fallbackCity } = {}) {
  const todo = (trip.ideas || []).filter((i) => !hasPosition(i));
  const known = (trip.ideas || []).filter(hasPosition);
  const found = {};
  const foundPoints = [];
  let searched = 0;
  let stopped = false;
  let error = null;

  for (let i = 0; i < todo.length; i++) {
    const idea = todo[i];
    if (onProgress) onProgress(i, todo.length);
    if (shouldStop && shouldStop()) {
      stopped = true;
      break;
    }
    try {
      const near = centroidOf([...known, ...foundPoints]) || seed;
      const { results } = await search({ name: idea.name, address: idea.address, city: idea.city, fallbackCity: fallbackCity || trip.defaultLocation }, { near, limit: 3 });
      searched += 1;
      const hit = results && results[0];
      if (hit && !(near && distanceKm(near, hit) > maxKm)) {
        found[idea.id] = hit;
        foundPoints.push(hit);
      }
    } catch (e) {
      stopped = true;
      error = e;
      break;
    }
  }
  if (onProgress) onProgress(todo.length, todo.length);
  const foundCount = Object.keys(found).length;
  // "missing" = searched and not found; ideas after a stop were never searched
  return { found, foundCount, missing: searched - foundCount, total: todo.length, stopped, error };
}

// One write for all the positions found. The address / city are only filled
// when the idea had none, and the placed step follows (so the day screen and
// the map agree).
export async function saveIdeaPositions(tripId, found) {
  const ids = Object.keys(found || {});
  if (!ids.length) return;
  await updateTrip(tripId, (trip) => {
    const ideas = (trip.ideas || []).map((idea) => {
      const hit = found[idea.id];
      if (!hit || hasPosition(idea)) return idea;
      return {
        ...idea,
        lat: hit.lat,
        lng: hit.lng,
        address: idea.address || hit.address || "",
        city: idea.city || hit.city || null,
        openingHours: idea.openingHours || hit.openingHours || null,
      };
    });
    const byId = new Map(ideas.map((i) => [i.id, i]));
    const days = (trip.days || []).map((day) => ({
      ...day,
      activities: (day.activities || []).map((a) => {
        const hit = a.ideaId && found[a.ideaId] ? byId.get(a.ideaId) : null;
        if (!hit || isFinitePos(a) || !hasPosition(hit)) return a;
        return { ...a, lat: hit.lat, lng: hit.lng, address: a.address || ideaAddressLine(hit) || null };
      }),
    }));
    return { ...trip, ideas, days };
  });
}
