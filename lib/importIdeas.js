// "Construire mon voyage", phase 3: fill the idea notebook from something the
// traveller already has — a TikTok / YouTube link, a caption, a pasted list.
//
// In plain words:
//  - Links: TikTok and YouTube give the caption / title of a public video through
//    their oEmbed address (no key, no account). Instagram does not: the user pastes
//    the caption instead.
//  - Places are read from the text without any AI when it looks like a list
//    (numbered, bullets, 📍 pins, one per line, comma separated).
//  - Free prose ("on a adoré Fushimi Inari puis...") needs the AI, only when the user
//    saved an Anthropic key in Settings. Without a key the list can still be typed.
//  - Nothing is added before the traveller has ticked what is right. Positions are
//    then looked up on OpenStreetMap, and a wrong or missing position is never fatal.
import { centroidOf, searchPlacesWithFallback } from "./geocode";
import { makeIdea, DEFAULT_IDEA_CATEGORIES } from "./ideas";
import { distanceKm, stripAccents } from "./planner";
import { updateTrip } from "./trips";
import { AI_MODEL } from "./script";

const MAX_LINKS = 5;
const MAX_PLACES = 40;
const MAX_NAME_CHARS = 60;
const MAX_NAME_WORDS = 8;
export const FAR_FROM_TRIP_KM = 300; // a lookup result this far from the notebook is a namesake, not the place

// ---------- Text helpers ----------

const norm = (s) => stripAccents(s).replace(/[^a-z0-9]+/g, " ").trim();

const NAME_START = /[A-Za-zÀ-ÖØ-öø-ÿ0-9"'«(]/;
const NAME_END = /[A-Za-zÀ-ÖØ-öø-ÿ0-9)"'»]/;
// Emoji (surrogate pairs), dingbats, bullets: they separate items inside one line.
const EMOJI_SEP = /[\uD800-\uDFFF☀-➿⬀-⯿•■-◿]+/;
const PROPER_NOUN = /^[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]*(\s+[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]*){0,2}$/;
// Headers and chatter that are not places.
const NOISE =
  /(^|\b)(abonne|abonnez|follow|like|partage|commente|comment|lien en bio|link in bio|fyp|foryou|pourtoi|vlog|voyage|travel|itineraire|programme|budget|conseils?|astuces?|bons? plans?|guide|que faire|ou manger|a voir|endroits?|lieux|choses|spots|adresses|jours? a|merci|bonjour|salut|hello)(\b|$)/;

export function extractUrls(text) {
  const found = (text || "").match(/https?:\/\/[^\s<>"'`]+/gi) || [];
  return [...new Set(found.map((u) => u.replace(/[),.;:!?]+$/, "")))];
}

function removeUrls(text) {
  return (text || "").replace(/https?:\/\/[^\s<>"'`]+/gi, " ");
}

function trimEdges(s) {
  let a = 0;
  let b = s.length;
  while (a < b && !NAME_START.test(s[a])) a++;
  while (b > a && !NAME_END.test(s[b - 1])) b--;
  return s.slice(a, b).trim();
}

// "1. Fushimi Inari", "✅ Fushimi Inari", "3️⃣ Fushimi Inari" -> "Fushimi Inari".
// "7-Eleven" and "21_21 Design Sight" keep their digits.
function cleanPiece(piece) {
  let s = piece.replace(/[#@][^\s#@]+/g, " ").replace(/\s+/g, " ");
  for (let i = 0; i < 4; i++) {
    const before = s;
    s = trimEdges(s)
      .replace(/^\d{1,2}[️⃣]+\s*/, "")
      .replace(/^\d{1,2}\s*[.):]\s*/, "")
      .replace(/^\d{1,2}\s+[-–—]\s+/, "");
    if (s === before) break;
  }
  return trimEdges(s);
}

// "Fushimi Inari, Kyoto" / "Fushimi Inari - Kyoto" / "Fushimi Inari (Kyoto)" -> name + city hint.
// A tail that is not a proper noun ("incroyable de nuit") is a comment, dropped.
function splitNameCity(piece) {
  const m = /^(.+?)(?:\s*,\s*|\s+[-–—|:]\s+|\s*\(\s*)(.+?)\)?$/.exec(piece);
  if (!m) return { name: piece, city: null };
  const tail = m[2].split(",")[0].trim();
  return { name: trimEdges(m[1]), city: PROPER_NOUN.test(tail) && tail.length <= 30 ? tail : null };
}

// ---------- Category guess ----------

const CATEGORY_WORDS = [
  ["hotel", ["hotel", "ryokan", "auberge", "hostel", "airbnb", "resort", "guesthouse", "guest house", "capsule", "riad", "gite"]],
  [
    "repas",
    ["restaurant", "resto", "ramen", "sushi", "izakaya", "cafe", "coffee", "bar", "brasserie", "bistro", "boulangerie", "patisserie", "pizzeria", "pizza", "tacos", "burger", "brunch", "street food", "takoyaki", "udon", "yakitori", "tempura", "okonomiyaki", "gyoza", "creperie", "glacier", "bakery", "trattoria", "osteria", "kebab", "snack", "food court", "chez", "sobas?", "tonkatsu", "kaiseki", "dimsum", "dim sum"],
  ],
  ["shopping", ["marche", "market", "boutique", "shop", "store", "mall", "centre commercial", "outlet", "shopping", "souk", "galerie", "bazar", "bazaar", "depachika", "donki"]],
  ["nature", ["parc", "park", "jardin", "garden", "plage", "beach", "lac", "lake", "mont", "mount", "montagne", "cascade", "waterfall", "sentier", "foret", "forest", "bambou", "volcan", "ile", "gorge", "canyon", "randonnee", "hike", "sommet", "falaise", "grotte"]],
];
const CATEGORY_REGEX = CATEGORY_WORDS.map(([id, words]) => [id, new RegExp(`(^| )(${words.join("|")})( |$)`)]);

export function guessCategory(name) {
  const n = norm(name);
  for (const [id, re] of CATEGORY_REGEX) if (re.test(n)) return id;
  return "activite";
}

const CATEGORY_IDS = DEFAULT_IDEA_CATEGORIES.map((c) => c.id);

// ---------- Reading places from text (no AI) ----------

// Returns [{ name, city, categoryId }] — possibly with a few wrong lines: the
// traveller ticks what is right before anything is added.
export function parsePlaceList(raw) {
  const text = removeUrls(raw).replace(/\r/g, "").trim();
  if (!text) return [];
  let pieces = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const pinned = lines.filter((l) => l.includes("📍"));

  if (pinned.length) {
    // 📍 is the strongest signal: only what follows a pin counts.
    pinned.forEach((l) => l.split("📍").slice(1).forEach((seg) => pieces.push(seg.split(EMOJI_SEP)[0])));
  } else if (lines.length === 1 && (lines[0].match(/[,;]/g) || []).length >= 2 && !EMOJI_SEP.test(lines[0])) {
    // "Fushimi Inari, Kiyomizu-dera, Arashiyama": a list on one line.
    const parts = lines[0].split(/[;,]/).map((p) => p.trim()).filter(Boolean);
    if (parts.every((p) => p.split(/\s+/).length <= 5)) pieces = parts;
    else pieces = [lines[0]];
  } else {
    lines.forEach((line) => {
      // "Top 3 : 1) Fushimi Inari 2) Kiyomizu 3) Gion" — several numbered items in one line.
      const numbered = line.match(/(^|\s)\d{1,2}[.)]\s+\S/g) || [];
      const chunks = numbered.length >= 2 ? line.split(/(?:^|\s)\d{1,2}[.)]\s+/).slice(1) : [line];
      chunks.forEach((c) => c.split(EMOJI_SEP).forEach((p) => pieces.push(p)));
    });
  }

  const seen = new Set();
  const out = [];
  for (const piece of pieces) {
    const cleaned = cleanPiece(piece);
    if (!cleaned) continue;
    const { name, city } = splitNameCity(cleaned);
    const words = name.split(/\s+/).length;
    if (name.length < 3 || name.length > MAX_NAME_CHARS || words > MAX_NAME_WORDS) continue;
    if (/\d{1,2}\s*[:h]\s*\d{2}/.test(name)) continue; // a time, not a place
    if (NOISE.test(norm(name))) continue;
    const key = norm(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ name, city, categoryId: guessCategory(name) });
    if (out.length >= MAX_PLACES) break;
  }
  return out;
}

// ---------- Reading places from prose (AI, optional) ----------

const AI_SYSTEM = `Tu lis la légende d'une vidéo de voyage ou un texte libre et tu en extrais les LIEUX que l'on peut visiter, manger ou réserver.

Règles :
- Uniquement des lieux précis et nommés dans le texte (un temple, un restaurant, un quartier, un hôtel). Jamais un pays ni une ville seule, jamais une idée générale.
- N'invente rien, ne complète pas avec tes connaissances : si le texte ne nomme aucun lieu, réponds [].
- "city" = la ville ou le quartier si le texte l'indique, sinon null.
- "category" = une seule valeur parmi : hotel, activite, repas, shopping, nature.
- Maximum 30 lieux.

Réponds UNIQUEMENT avec un tableau JSON, sans texte autour, par exemple :
[{"name":"Fushimi Inari","city":"Kyoto","category":"activite"}]`;

export async function extractPlacesWithAI(text, apiKey, { fetchImpl = fetch } = {}) {
  if (!apiKey) {
    const err = new Error("NO_API_KEY");
    err.code = "NO_API_KEY";
    throw err;
  }
  const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model: AI_MODEL, max_tokens: 1500, system: AI_SYSTEM, messages: [{ role: "user", content: text.slice(0, 6000) }] }),
  });
  if (!response.ok) throw new Error(`L'analyse par l'IA a échoué (${response.status}).`);
  const data = await response.json();
  const reply = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const start = reply.indexOf("[");
  const end = reply.lastIndexOf("]");
  let list;
  try {
    list = JSON.parse(reply.slice(start, end + 1));
  } catch (e) {
    throw new Error("Réponse illisible de l'IA.");
  }
  if (!Array.isArray(list)) throw new Error("Réponse illisible de l'IA.");
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const name = item && typeof item.name === "string" ? item.name.trim() : "";
    const key = norm(name);
    if (name.length < 2 || name.length > MAX_NAME_CHARS || !key || seen.has(key)) continue;
    seen.add(key);
    const city = item.city && typeof item.city === "string" && item.city.trim() ? item.city.trim() : null;
    out.push({ name, city, categoryId: CATEGORY_IDS.includes(item.category) ? item.category : guessCategory(name) });
    if (out.length >= MAX_PLACES) break;
  }
  return out;
}

// Lists are read without AI. Prose goes to the AI when there is a key.
// `preferAI` is set for video captions, which are mostly prose.
export async function extractPlaces(text, { apiKey = null, preferAI = false, fetchImpl } = {}) {
  const listed = parsePlaceList(text);
  if (!apiKey || (listed.length >= 2 && !preferAI)) return { places: listed, usedAI: false, aiError: null };
  try {
    const places = await extractPlacesWithAI(text, apiKey, { fetchImpl });
    return { places, usedAI: true, aiError: null };
  } catch (e) {
    return { places: listed, usedAI: false, aiError: e.message || "L'analyse par l'IA a échoué." };
  }
}

// ---------- Links ----------

export function sourceOf(url) {
  // Regex, not `new URL()`: React Native's URL has no working `hostname`.
  const m = /^https?:\/\/([^/?#:]+)/i.exec(url || "");
  const host = m ? m[1].toLowerCase() : "";
  if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
  if (/(^|\.)youtube\.com$/.test(host) || host === "youtu.be") return "youtube";
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  return "other";
}

export const SOURCE_LABELS = { tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram", other: "Lien" };

function linkError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// Caption (TikTok) or title (YouTube) of a public video, from its oEmbed address.
// Short TikTok links (vm.tiktok.com/...) are first followed to the real address.
export async function fetchLinkInfo(url, { fetchImpl = fetch } = {}) {
  const source = sourceOf(url);
  if (source === "instagram") throw linkError("UNSUPPORTED", "Instagram ne permet pas de lire ce lien : collez la description.");
  if (source === "other") throw linkError("UNSUPPORTED", "Seuls les liens TikTok et YouTube sont lus. Collez plutôt le texte.");

  let target = url;
  try {
    if (source === "tiktok" && /^https?:\/\/(vm|vt)\.tiktok\.com\/|tiktok\.com\/t\//i.test(url)) {
      const res = await fetchImpl(url);
      if (res && res.url) target = res.url;
    }
    const endpoint =
      source === "tiktok"
        ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(target)}`
        : `https://www.youtube.com/oembed?url=${encodeURIComponent(target)}&format=json`;
    const res = await fetchImpl(endpoint, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw linkError("HTTP", res.status === 400 || res.status === 404 || res.status === 401 ? "Vidéo introuvable ou privée." : `Service indisponible (${res.status}).`);
    }
    const json = await res.json();
    const caption = (json.title || "").trim();
    if (!caption) throw linkError("EMPTY", "Cette vidéo n'a pas de légende à lire.");
    return { url, source, author: json.author_name || null, caption };
  } catch (e) {
    if (e.code) throw e;
    throw linkError("NETWORK", "Pas de connexion — réessayez, ou collez la légende.");
  }
}

// ---------- The whole analysis ----------

// raw = whatever was pasted. Returns
// { places: [{ name, city, categoryId, sourceUrl, sourceLabel }], links: [{ url, source, author, error }], usedAI, aiError }
export async function analyzeInput(raw, { apiKey = null, fetchImpl } = {}) {
  const urls = extractUrls(raw).slice(0, MAX_LINKS);
  const links = await Promise.all(
    urls.map(async (url) => {
      try {
        const info = await fetchLinkInfo(url, { fetchImpl });
        return { ...info, error: null };
      } catch (e) {
        return { url, source: sourceOf(url), author: null, caption: null, error: e.message };
      }
    })
  );

  const chunks = [{ text: removeUrls(raw), sourceUrl: null, sourceLabel: null, preferAI: false }];
  links.forEach((l) => {
    if (l.caption) chunks.push({ text: l.caption, sourceUrl: l.url, sourceLabel: `${SOURCE_LABELS[l.source]}${l.author ? " · " + l.author : ""}`, preferAI: true });
  });

  const places = [];
  const seen = new Set();
  let usedAI = false;
  let aiError = null;
  for (const chunk of chunks) {
    if (!chunk.text.trim()) continue;
    const res = await extractPlaces(chunk.text, { apiKey, preferAI: chunk.preferAI, fetchImpl });
    usedAI = usedAI || res.usedAI;
    aiError = aiError || res.aiError;
    for (const p of res.places) {
      const key = norm(p.name);
      if (seen.has(key)) continue;
      seen.add(key);
      places.push({ ...p, sourceUrl: chunk.sourceUrl, sourceLabel: chunk.sourceLabel });
    }
  }
  return { places: places.slice(0, MAX_PLACES), links, usedAI, aiError };
}

// Flags the places that are already in the notebook (they start unticked).
export function markDuplicates(places, trip) {
  const known = new Set((trip.ideas || []).map((i) => norm(i.name)));
  return places.map((p) => ({ ...p, duplicate: known.has(norm(p.name)) }));
}

// ---------- Positions ----------

// Looks each place up on OpenStreetMap, one after the other (the service allows
// one request per second). A place that is not found, or found suspiciously far
// from the rest of the trip, simply stays without a position. A network problem
// stops the lookups; the places are still returned. `missing` = how many have no position.
// `search` and `shouldStop` are injectable for tests and for the "skip" button.
export async function locatePlaces(places, trip, { onProgress, shouldStop, search = searchPlacesWithFallback } = {}) {
  const located = [];
  let stopped = false;
  const known = (trip.ideas || []).filter((i) => Number.isFinite(i.lat) && Number.isFinite(i.lng));
  for (let i = 0; i < places.length; i++) {
    const place = places[i];
    if (onProgress) onProgress(i, places.length);
    if (stopped || (shouldStop && shouldStop())) {
      stopped = true;
      located.push(place);
      continue;
    }
    try {
      const near = centroidOf([...known, ...located]);
      const { results } = await search({ name: place.name, city: place.city, fallbackCity: trip.defaultLocation }, { near, limit: 3 });
      const hit = results && results[0];
      if (hit && !(near && distanceKm(near, hit) > FAR_FROM_TRIP_KM)) {
        located.push({ ...place, address: hit.address || null, city: place.city || hit.city || null, lat: hit.lat, lng: hit.lng, openingHours: hit.openingHours || null });
      } else {
        located.push(place);
      }
    } catch (e) {
      stopped = true;
      located.push(place);
    }
  }
  if (onProgress) onProgress(places.length, places.length);
  return { places: located, missing: located.filter((p) => !Number.isFinite(p.lat)).length, stopped };
}

// ---------- Writing ----------

// Adds all the places to the notebook in one write. Returns the created ideas.
export async function addImportedIdeas(tripId, places) {
  let created = [];
  await updateTrip(tripId, (trip) => {
    created = places.map((p) =>
      makeIdea(
        {
          name: p.name,
          categoryId: p.categoryId,
          city: p.city,
          address: p.address,
          lat: p.lat,
          lng: p.lng,
          openingHours: p.openingHours,
          sourceUrl: p.sourceUrl,
          note: p.sourceLabel ? `Importé depuis ${p.sourceLabel}` : "",
          priority: "want",
        },
        trip
      )
    );
    return { ...trip, ideas: [...(trip.ideas || []), ...created] };
  });
  return created;
}
