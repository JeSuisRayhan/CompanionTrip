// A real photo of the place a step goes to (a museum, a temple, a famous restaurant), from Wikipedia: free, no key.
// Only a page that is a place is taken: it must have map coordinates, a title that matches the step's name and, when
// the step's position is known, sit close to it. Anything else (a film, a person, a namesake far away) gives no photo,
// and the step keeps its plain look. Answers are kept on the phone (a photo found, or none) so a day opens at once
// the next time, even offline.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

const CACHE = "placePhoto:v1:";
const NONE_DAYS = 14; // "no photo" is asked again after this, a page may have been added
const NEAR_KM = 3; // a page farther than this from the step's position is a namesake
const TIMEOUT_MS = 8000;
const LANGS = ["fr", "en"];
const SIZE = 320; // px of the thumbnail asked for (shown at 64 dp: sharp up to 5x)
const HEADERS = { "Api-User-Agent": "CompagnonDeVoyage/1.1 (application de voyage personnelle)" };

const memory = new Map(); // key -> { uri, title } | null
const pending = new Map(); // key -> Promise

const SMALL = new Set(["le", "la", "les", "l", "de", "du", "des", "d", "un", "une", "et", "a", "au", "aux", "en", "the", "of", "and", "y", "el", "los", "las", "di", "del", "della", "der", "die", "das", "von"]);

export function norm(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const tokens = (text) => norm(text).split(" ").filter((w) => w && !SMALL.has(w));

// "Fushimi Inari" and "Fushimi Inari-taisha", "Musée d'Orsay" and "Musée d'Orsay": the same place. "Le Pirate" and
// "Pirate (film)": the words of the shorter one must all be in the longer one (the "(…)" of a page title is dropped).
export function sameName(stepName, pageTitle) {
  const a = tokens(stepName);
  const b = tokens(String(pageTitle || "").replace(/\s*\([^)]*\)\s*$/, ""));
  if (!a.length || !b.length) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length === 1 && short[0].length < 4) return false; // "Bo", "Ion": too short to be sure
  const set = new Set(long);
  return short.every((w) => set.has(w));
}

function km(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const hasPos = (p) => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng);

export function photoKey({ name, lat, lng }) {
  const pos = Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(3)},${lng.toFixed(3)}` : "";
  return `${norm(name)}|${pos}`;
}

async function getJson(url, fetchImpl) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
  try {
    const res = await fetchImpl(url, { headers: HEADERS, ...(controller ? { signal: controller.signal } : {}) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const api = (lang, params) =>
  `https://${lang}.wikipedia.org/w/api.php?` +
  Object.entries({ action: "query", format: "json", formatversion: "2", origin: "*", prop: "pageimages|coordinates", piprop: "thumbnail", pithumbsize: String(SIZE), pilimit: "20", colimit: "20", ...params })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

// The best page among those found: a place (coordinates), with a photo, the same name, near the step when its position is known.
export function pickPage(pages, { name, lat, lng }) {
  const at = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  const good = (pages || [])
    .filter((p) => p && p.thumbnail && p.thumbnail.source && Array.isArray(p.coordinates) && p.coordinates.length)
    .filter((p) => !/\.svg(\.png)?$/i.test(p.thumbnail.source) && !/(logo|flag|drapeau|blason|coat_of_arms|map|carte|locator)/i.test(p.thumbnail.source)) // a logo, a flag, a map is not a photo of the place
    .map((p) => ({ p, d: at ? km(at, { lat: p.coordinates[0].lat, lng: p.coordinates[0].lon }) : null }))
    .filter(({ p, d }) => sameName(name, p.title) && (d == null || d <= NEAR_KM));
  if (!good.length) return null;
  good.sort((x, y) => (x.d == null || y.d == null ? 0 : x.d - y.d));
  const { p } = good[0];
  return { uri: p.thumbnail.source, title: p.title };
}

// Looks for the photo: around the position first (the surest), then by name (with the city, to stay in the right place).
export async function findPlacePhoto(query, { fetchImpl = fetch } = {}) {
  const { name, city } = query;
  if (!name) return null;
  let failures = 0;
  let asked = 0;
  for (const lang of LANGS) {
    const requests = [];
    if (hasPos(query)) requests.push(api(lang, { generator: "geosearch", ggscoord: `${query.lat}|${query.lng}`, ggsradius: "1500", ggslimit: "20" }));
    requests.push(api(lang, { generator: "search", gsrsearch: city && !norm(name).includes(norm(city)) ? `${name} ${city}` : name, gsrlimit: "5" }));
    if (city) requests.push(api(lang, { generator: "search", gsrsearch: name, gsrlimit: "5" }));
    for (const url of requests) {
      asked++;
      try {
        const data = await getJson(url, fetchImpl);
        const found = pickPage(data && data.query && data.query.pages, query);
        if (found) return found;
      } catch {
        failures++;
      }
    }
  }
  if (failures === asked) throw new Error("NETWORK"); // nothing could be asked: try again another time, say nothing for now
  return null;
}

async function readCache(key) {
  try {
    const raw = await AsyncStorage.getItem(CACHE + key);
    if (!raw) return undefined;
    const v = JSON.parse(raw);
    if (v && v.uri) return { uri: v.uri, title: v.title || "" };
    if (v && v.none && Date.now() - v.at < NONE_DAYS * 86400000) return null;
    return undefined;
  } catch {
    return undefined;
  }
}

function writeCache(key, value) {
  AsyncStorage.setItem(CACHE + key, JSON.stringify(value ? value : { none: true, at: Date.now() })).catch(() => {});
}

// Two lookups at a time: a day of ten steps does not send twenty requests at once.
let running = 0;
const queue = [];
function limited(job) {
  return new Promise((resolve, reject) => {
    const run = () => {
      running++;
      job().then(resolve, reject).finally(() => {
        running--;
        const next = queue.shift();
        if (next) next();
      });
    };
    if (running < 2) run();
    else queue.push(run);
  });
}

// The photo of a place: { uri, title }, or null. Never throws.
export function placePhoto(query) {
  if (!query || !query.name) return Promise.resolve(null);
  const key = photoKey(query);
  if (memory.has(key)) return Promise.resolve(memory.get(key));
  if (pending.has(key)) return pending.get(key);
  const job = (async () => {
    const cached = await readCache(key);
    if (cached !== undefined) {
      memory.set(key, cached);
      return cached;
    }
    try {
      const found = await limited(() => findPlacePhoto(query));
      memory.set(key, found);
      writeCache(key, found);
      return found;
    } catch {
      return null; // offline: nothing kept, it is tried again next time
    }
  })().finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}

// For a screen: the photo of the place, null while there is none (yet).
export function usePlacePhoto(query) {
  const key = query && query.name ? photoKey(query) : null;
  const [photo, setPhoto] = useState(() => (key && memory.has(key) ? memory.get(key) : null));
  useEffect(() => {
    if (!key) {
      setPhoto(null);
      return undefined;
    }
    let alive = true;
    setPhoto(memory.has(key) ? memory.get(key) : null);
    placePhoto(query).then((p) => alive && setPhoto(p));
    return () => {
      alive = false;
    };
  }, [key]); // the key says everything the query does
  return photo;
}
