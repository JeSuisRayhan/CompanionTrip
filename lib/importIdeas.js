// "Construire mon voyage", phase 3: fill the idea notebook from something the traveller already has — a TikTok /
// YouTube link, a caption, a description, a pasted list.
//
// In plain words:
//  - Links: the page of a public TikTok or YouTube video is read (title, description or caption, the place the author
//    tagged), see linkReader.js. Instagram cannot be read: the traveller pastes the description instead.
//  - Places are read from the text, from the surest sign to the weakest: a pin (📍), an address with the name written
//    before it ("Kodawari Ramen, 29 rue Sainte-Anne, 75001 Paris"), an "Adresse :" label, a Google Maps link, the chapters
//    of a video ("01:20 Fushimi Inari"), a numbered list. A short plain list (one place per line, or separated by
//    commas) is read too. Free prose ("on a adoré Fushimi Inari puis...") is not understood.
//  - The address found next to a name goes with the place: it is looked up on OpenStreetMap together with the name,
//    and kept on the idea.
//  - Nothing is added before the traveller has ticked what is right. Positions are then looked up, and a wrong or
//    missing position is never fatal.
import { centroidOf, searchPlacesWithFallback } from "./geocode";
import { makeIdea } from "./ideas";
import { distanceKm, stripAccents } from "./planner";
import { updateTrip } from "./trips";
import { findAddress, stripLabel, mapsUrlsIn, isShortMapsUrl, parseMapsUrl, cityOf } from "./placeText";
import { readLink, resolveMapsLink, extractUrls, removeUrls, sourceOf, SOURCE_LABELS } from "./linkReader";

export { extractUrls, sourceOf, SOURCE_LABELS };

const MAX_LINKS = 5;
const MAX_PLACES = 40;
const MAX_NAME_CHARS = 60;
const MAX_NAME_WORDS = 8;
export const FAR_FROM_TRIP_KM = 300; // a lookup result this far from the notebook is a namesake, not the place

// ---------- Text helpers ----------

const CJK = /[぀-ヿ㐀-䶿一-鿿]/;
// Lowercase, no accents, letters and digits only (Japanese and Chinese characters are kept).
const norm = (s) => stripAccents(s).replace(/[^a-z0-9぀-ヿ㐀-䶿一-鿿]+/g, " ").trim();

const NAME_START = /[\p{L}\p{N}"'«(]/u;
const NAME_END = /[\p{L}\p{N})"'»]/u;
// Emoji (surrogate pairs), dingbats, bullets: they separate items inside one line.
const EMOJI_SEP = /[\uD800-\uDFFF☀-➿⬀-⯿•■-◿]+/;
const PROPER_NOUN = /^\p{Lu}[\p{L}'’.-]*(\s+\p{Lu}[\p{L}'’.-]*){0,2}$/u;
// Headers and chatter that are not places.
const NOISE =
  /(^|\b)(abonne|abonnez|follow|like|partage|commente|comment|lien en bio|link in bio|fyp|foryou|pourtoi|vlog|voyage|travel|itineraire|programme|budget|conseils?|astuces?|bons? plans?|guide|que faire|ou manger|a voir|endroits?|lieux|choses|spots|adresses|jours? a|merci|bonjour|salut|hello)(\b|$)/;
// Whole lines of a description that are never a place: "Musique : …", "Instagram : …", "00:00 Intro".
const SECTION_NOISE = new Set([
  "musique", "music", "instagram", "tiktok", "facebook", "twitter", "snapchat", "youtube", "contact", "contacts", "sponsor", "sponsors", "partenariat", "code promo", "lien", "liens", "materiel", "credits",
  "intro", "introduction", "outro", "conclusion", "generique", "sommaire", "bilan", "resume", "teaser", "bonus", "bloopers", "chapitres", "timestamps", "sources", "mail", "email", "site", "blog", "podcast",
  "newsletter", "discord", "twitch", "patreon", "paypal", "suivez moi", "me suivre", "mon materiel", "mon sac a dos", "debut", "fin", "preview", "extrait",
]);
// A time of day or opening hours, not a place.
const HOURS = /\b\d{1,2}\s*h(?:\s*\d{2})?\s*(?:[-–à]|a)\s*\d{1,2}\s*h?/i;
// A sentence about the trip, not a place: it starts with a subject pronoun ("On a adoré Gion hier soir").
const SENTENCE_START = /^(on|nous|je|j|vous|tu|elles?|ils|we|they|you|i)(\s|$)/; // after norm(): "J'ai" is "j ai"

function removeTags(s) {
  return s.replace(/[#@][^\s#@]+/g, " ").replace(/\s+/g, " ");
}

function trimEdges(s) {
  let a = 0;
  let b = s.length;
  while (a < b && !NAME_START.test(s[a])) a++;
  while (b > a && !NAME_END.test(s[b - 1])) b--;
  return s.slice(a, b).trim();
}

// A time at the start of a line: the chapters of a video ("01:20 Fushimi Inari", "(1:02:30) Gion", "05:40 - Gion").
const TIMESTAMP = /^[([]?(?:\d{1,2}:)?\d{1,2}:\d{2}[)\]]?(?:\s*[-–—:.)|]+\s*|\s+)/;
const CHAPTER = /^[([]?(?:\d{1,2}:)?\d{1,2}:\d{2}[)\]]?(?:\s*[-–—:.)|]+\s*|\s+)(\S.*)$/;
const NUMBERED = /^\s*(?:\d{1,2}\s*[.)]\s+|\d{1,2}️?⃣\s*)\S/u;

// "1. Fushimi Inari", "✅ Fushimi Inari", "3️⃣ Fushimi Inari", "01:20 Fushimi Inari" -> "Fushimi Inari".
// "7-Eleven" and "21_21 Design Sight" keep their digits.
function cleanPiece(piece) {
  let s = removeTags(piece);
  for (let i = 0; i < 4; i++) {
    const before = s;
    s = trimEdges(s)
      .replace(TIMESTAMP, "")
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
  if (!m) {
    // "Chez Moktar à Djerba", "Joe's Pizza in New York"
    const at = /^(.{2,}?)\s+(?:à|in|en)\s+(\p{Lu}[\p{L}'’.-]*(?:\s+\p{Lu}[\p{L}'’.-]*){0,2})$/u.exec(piece);
    if (at && at[1].split(/\s+/).length <= 5) return { name: trimEdges(at[1]), city: at[2], note: null };
    return { name: piece, city: null, note: null };
  }
  const tail = m[2].split(",")[0].trim();
  const isCity = PROPER_NOUN.test(tail) && tail.length <= 30;
  const head = trimEdges(m[1]);
  // "Tokyo - Shibuya Sky", "Kyoto : Fushimi Inari": a short name first and a longer one after it is the town, then the place.
  if (isCity && PROPER_NOUN.test(head) && head.split(/\s+/).length < tail.split(/\s+/).length) return { name: tail, city: head, note: null };
  // What is not a town is a comment ("Villa Khazroun (hôtel)"): dropped, but it can tell the kind of place.
  return { name: head, city: isCity ? tail : null, note: isCity ? null : m[2].trim() };
}

// Is this a believable name for a place?
function acceptName(name) {
  const words = name.split(/\s+/).length;
  if ((name.length < 3 && !CJK.test(name)) || name.length > MAX_NAME_CHARS || words > MAX_NAME_WORDS) return false;
  if (/\d{1,2}\s*[:h]\s*\d{2}/.test(name) || HOURS.test(name)) return false; // a time, not a place
  const n = norm(name);
  if (!n || SECTION_NOISE.has(n) || NOISE.test(n)) return false;
  if (/^(jour|day|etape|stage|partie|part|episode|chapitre|chapter|acte)\s*\d+/.test(n)) return false; // "Jour 1 - Tokyo"
  if (words >= 3 && SENTENCE_START.test(n)) return false;
  return true;
}

// ---------- Category guess ----------

const CATEGORY_WORDS = [
  ["hotel", ["hotel", "ryokan", "auberge", "hostel", "airbnb", "resort", "guesthouse", "guest house", "capsule", "riad", "gite"]],
  [
    "repas",
    ["restaurant", "resto", "ramen", "sushi", "izakaya", "cafe", "coffee", "bar", "brasserie", "bistro", "boulangerie", "patisserie", "pizzeria", "pizza", "tacos", "burger", "brunch", "street food", "takoyaki", "udon", "yakitori", "tempura", "okonomiyaki", "gyoza", "creperie", "glacier", "bakery", "trattoria", "osteria", "kebab", "snack", "food court", "chez", "bouchon", "bouillon", "sobas?", "tonkatsu", "kaiseki", "dimsum", "dim sum", "tapas", "taberna", "bodega", "ristorante", "gelateria", "pasticceria", "panaderia", "imbiss", "konditorei", "biergarten", "pub", "traiteur", "steakhouse", "diner"],
  ],
  ["shopping", ["marche", "market", "boutique", "shop", "store", "mall", "centre commercial", "outlet", "shopping", "souk", "galerie", "bazar", "bazaar", "depachika", "donki"]],
  ["nature", ["parc", "park", "jardin", "garden", "plage", "beach", "lac", "lake", "mont", "mount", "montagne", "cascade", "waterfall", "sentier", "foret", "forest", "bambou", "volcan", "ile", "gorge", "canyon", "randonnee", "hike", "sommet", "falaise", "grotte"]],
];
const CATEGORY_REGEX = CATEGORY_WORDS.map(([id, words]) => [id, new RegExp(`(^| )(${words.join("|")})s?( |$)`)]);
// In a whole sentence ("ce resto à Lyon vaut le détour"), only the words that are never about something else.
const AMBIGUOUS_WORDS = new Set(["chez", "bar", "snack", "marche", "market", "mont", "mount", "ile", "lac", "lake", "parc", "park", "jardin", "garden", "store", "shop", "mall", "galerie", "foret", "forest", "montagne", "capsule", "resort"]);
const CONTEXT_REGEX = CATEGORY_WORDS.map(([id, words]) => [id, new RegExp(`(^| )(${words.filter((w) => !AMBIGUOUS_WORDS.has(w)).join("|")})s?( |$)`)]);

const categoryOfName = (name) => {
  const n = norm(name);
  for (const [id, re] of CATEGORY_REGEX) if (re.test(n)) return id;
  return null;
};
const categoryOfContext = (text) => {
  const c = norm(text);
  for (const [id, re] of CONTEXT_REGEX) if (re.test(c)) return id;
  return null;
};

// `context` (the line the place was read from) is only looked at when the name itself says nothing.
export function guessCategory(name, context) {
  return categoryOfName(name) || (context && categoryOfContext(context)) || "activite";
}

// The kind of place: what the name says ("Kodawari Ramen"); else a word written next to it ("(hôtel)"); else the section
// (or the headline: "Les meilleurs restos de Lyon") it is listed under; else a
// word of the name that is not always about the same thing ("Parc de Ueno"); else, for a place known by its address
// only, the line it was read from ("ce resto à Lyon").
function categoryFor(name, entry) {
  const byName = categoryOfName(name);
  if (byName && categoryOfContext(name) === byName) return byName;
  const byNote = entry.note ? categoryOfContext(entry.note) : null; // "Villa Khazroun (hôtel)"
  if (byNote) return byNote;
  if (entry.section) return entry.section;
  if (byName) return byName;
  if (entry.nameless && entry.context) return categoryOfContext(entry.context) || "activite";
  return "activite";
}

// The title of a section of a description ("RESTOS :", "🏨 HÔTELS", "Où dormir ?") says what kind of places follow.
const SECTION_CATEGORY = [
  ["repas", /(^| )(manger|mange|eat|food|resto|restos|restaurant|restaurants|cafe|cafes|bouffe|gourmand|gourmandises|brunch|bar|bars|street food)( |$)/],
  ["hotel", /(^| )(dormir|sleep|hebergement|hebergements|logement|logements|hotel|hotels|hostel|hostels|ryokan|airbnb|stay)( |$)/],
  ["shopping", /(^| )(shopping|boutique|boutiques|marche|marches|souvenirs|market|markets)( |$)/],
  ["nature", /(^| )(nature|randonnee|randonnees|plage|plages|beach|beaches|parc|parcs|hike|hikes|hiking)( |$)/],
];

// ---------- Reading places from text ----------

const PIN_SRC = "[\\u{1F4CD}\\u{1F4CC}\\u{1F5FA}]\\uFE0F?"; // 📍 📌 🗺
const PIN = new RegExp(PIN_SRC, "u");
const PIN_ALL = new RegExp(PIN_SRC, "gu");
// "… Adresse :" at the end of what comes before an address: the address has no name of its own.
const LABEL_BEFORE = /(?:^|[\s.!?,;])(?:adresses?|address(?:es)?)\s*[:：]?\s*$|(?:^|[\s.!?,;])(?:lieu|o[ùu]|where|location|localisation|situ[ée]e?|gps|emplacement|plan|maps?|spot|endroit)\s*[:：]\s*$/i;
const CHEZ = /\bchez\s+\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+)?/u;

// The lines of a text: what is written (links removed) and the map links that were on it.
function prepareLines(raw) {
  return String(raw || "")
    .replace(/\r/g, "")
    .replace(/[\u2212\u2010\u2011\u2012]/g, "-") // the "−" of "4 Chome−2−15" (Google Maps) is not a hyphen
    .replace(/[​‌⁠﻿]/g, "")
    .replace(/ /g, " ")
    .split("\n")
    .map((l) => ({ maps: mapsUrlsIn(l), text: removeUrls(l).replace(/\s+/g, " ").trim() }))
    .filter((l) => l.text || l.maps.length);
}

const wordCount = (s) => s.split(/\s+/).filter(Boolean).length;

// A line that is short and not a sentence: the shape of one item of a list.
function isShortLine(text) {
  return wordCount(text) <= 6 && !/[.!?]$/.test(text.trim());
}

// A name written on a line of its own, just above an address ("Ichiran Ramen" / "1-22-7 Jinnan, Shibuya"), or null.
function nameFromPlainLine(text) {
  const cleaned = cleanPiece(text);
  if (!cleaned || /[:：]$/.test(cleaned) || !isShortLine(cleaned) || !/^[\p{Lu}\p{N}぀-ヿ㐀-䶿一-鿿]/u.test(cleaned)) return null;
  if (findAddress(cleaned, { strong: true })) return null;
  const { name, city } = splitNameCity(cleaned.split(EMOJI_SEP)[0] || cleaned);
  return name && acceptName(name) ? { name, city } : null;
}

// "Resto incroyable à Lyon ! Chez Paul" -> "Chez Paul": only the last sentence can be the name ("St." or "Bd." do not end one).
function lastSentence(text) {
  const re = /(?:[!?…]|\p{L}{3,}\.)\s+/gu;
  let cut = 0;
  let m;
  while ((m = re.exec(text))) cut = m.index + m[0].length;
  return text.slice(cut);
}

// One piece of text (a pin's segment, a line, a chapter title) -> { name, city, address, nameless, labelKind } or null.
//   strongCtx: it follows a pin, a chapter number or a list number, which allows the weaker shapes of an address.
function analyzeSegment(rawSegment, { strongCtx = false } = {}) {
  const text0 = cleanPiece(rawSegment);
  if (!text0) return null;
  const { kind: labelKind, rest } = stripLabel(text0);
  const text = rest || text0;
  const strongHere = strongCtx || labelKind === "address" || labelKind === "soft";
  let addr = findAddress(text, { strong: strongHere });
  if (!addr) {
    // "Shinjuku Gyoen : 11 Naitomachi, Shinjuku City": after "name :" or "name -", what starts with a number is an address.
    const m = /^(.{2,60}?)\s*(?:[:：]|\s[-–—|]\s)\s*(\d.*)$/.exec(text);
    const tail = m ? findAddress(m[2], { strong: true }) : null;
    if (tail) {
      const offset = text.length - m[2].length;
      addr = { ...tail, start: offset + tail.start, end: offset + tail.end };
    }
  }

  if (addr) {
    // The name sits between the last emoji / label and the address: "Kodawari Ramen, 29 rue X" -> "Kodawari Ramen".
    const chunks = text.slice(0, addr.start).split(EMOJI_SEP);
    let nameText = chunks[chunks.length - 1] || "";
    if (LABEL_BEFORE.test(nameText)) nameText = "";
    nameText = cleanPiece(lastSentence(nameText).replace(/[\s,;:|–—-]+$/, "").replace(/\s+(?:au|aux|à|a|en|dans|sur|at|in|situ[ée]e?|located)\s*$/i, ""));
    let name = "";
    let hint = null;
    let note = null;
    if (nameText) {
      const split = splitNameCity(nameText);
      if (split.name && acceptName(split.name)) {
        name = split.name;
        hint = split.city;
        note = split.note;
      } else {
        const chez = CHEZ.exec(nameText);
        if (chez && acceptName(chez[0])) name = chez[0].replace(/^chez/, "Chez");
      }
    }
    return { name, city: hint || addr.city || null, address: addr.text, nameless: !name, labelKind, note, after: text.slice(addr.end) };
  }

  if (labelKind === "address") {
    // "Adresse : Midoun, Djerba": no street recognised, but the label says it is an address.
    if (text.length < 3 || text.length > 120 || /[.!?]\s+\p{Lu}/u.test(text)) return null;
    return { name: "", city: cityOf(text).city, address: text, nameless: true, labelKind };
  }
  const { name, city, note } = splitNameCity(text.split(EMOJI_SEP)[0] || text);
  if (!name || !acceptName(name)) return null;
  return { name, city, address: null, nameless: false, labelKind, note };
}

// "29 rue Sainte-Anne, 75001 Paris" -> "29 rue Sainte-Anne": what a place without a name is called.
function nameFromAddress(address) {
  const first = String(address || "").split(",")[0].replace(/\s+(?:\d{4,5}|\d{3}-\d{4})\b.*$/, "").trim();
  return first.length > MAX_NAME_CHARS ? first.slice(0, MAX_NAME_CHARS).trim() : first;
}

// "Ichiran Ramen 🍜 📍 1-22-7 Jinnan": the name is written before the pin, not after it. `text` = what sits before the pin.
// Only a name that looks like one (capitals), and a single word only when it touches the pin.
function nameBeforePin(text) {
  const chunks = String(text || "").split(EMOJI_SEP);
  for (let k = chunks.length - 1; k >= 0; k--) {
    const cleaned = cleanPiece(chunks[k]);
    if (!cleaned) continue;
    const split = splitNameCity(cleaned);
    if (split.name && acceptName(split.name) && looksLikeName(split.name) && (wordCount(split.name) >= 2 || k === chunks.length - 1)) return split;
    const chez = CHEZ.exec(cleaned);
    return chez && acceptName(chez[0]) ? { name: chez[0].replace(/^chez/, "Chez"), city: null } : null;
  }
  return null;
}

// "Les meilleurs restos de Lyon 🍽️ 1. …": a headline that says what kind of places the text lists. null when there is none.
const TITLE_START = /^(top|best|mes|nos|my|our|voici|here|ou|where|que|what|\d+|les (\d+|meilleur|meilleurs|meilleures|bons|bonnes|incontournables|plus)|the (best|top|\d+)|restos|restaurants|hotels|cafes|bars)( |$)/;
function headlineCategory(lines) {
  const first = lines.length ? lines[0].text : "";
  const chunk = first.split(PIN_ALL)[0].split(new RegExp(EMOJI_SEP.source))[0].split(/[:：]/)[0].trim();
  if (!chunk || wordCount(chunk) > 8) return null;
  const n = norm(chunk);
  if (!TITLE_START.test(n)) return null;
  for (const [id, re] of SECTION_CATEGORY) if (re.test(n)) return id;
  return categoryOfContext(chunk); // "Best sushi in Tokyo", "Où dormir dans un ryokan"
}

// undefined = not a section title; null = a title that is not about a kind of place; else the category it announces.
function sectionTitle(text) {
  const bare = removeTags(text).replace(new RegExp(EMOJI_SEP.source, "g"), " ").replace(/\s+/g, " ").trim();
  if (!bare || wordCount(bare) > 4) return undefined;
  const isTitle = /[:：?]$/.test(bare) || (bare === bare.toUpperCase() && /\p{L}{3}/u.test(bare));
  if (!isTitle) return undefined;
  const n = norm(bare);
  for (const [id, re] of SECTION_CATEGORY) if (re.test(n)) return id;
  return null;
}

// The places with a sure sign: pins, addresses, labels, map links, chapters, numbered lists.
// Returns { entries, consumed }: `consumed` = the indexes of the lines that were used.
function readStrong(lines, { sparse = false, headline = null } = {}) {
  const entries = [];
  const consumed = new Set();
  const chapters = lines.filter((l) => CHAPTER.test(l.text)).length >= 2;
  const numbered = lines.filter((l) => NUMBERED.test(l.text)).length >= 2;
  let section = headline; // the category announced by the last section title (or by the headline)
  const add = (entry) => entries.push({ section, ...entry });

  // An address with no name: it belongs to the entry just above, else the line above is its name, else it stays as it is.
  const addNameless = (c, i) => {
    const prev = entries[entries.length - 1];
    if (prev && prev.line === i - 1 && !prev.address && prev.lat == null && !prev.fromMaps) {
      prev.address = c.address || prev.address;
      prev.city = prev.city || c.city;
      if (c.lat != null) Object.assign(prev, { lat: c.lat, lng: c.lng });
      if (c.mapsUrl) prev.mapsUrl = c.mapsUrl;
      consumed.add(i);
      return;
    }
    const above = lines[i - 1];
    const cand = above && !consumed.has(i - 1) && !above.maps.length ? nameFromPlainLine(above.text) : null;
    if (cand) {
      consumed.add(i - 1);
      consumed.add(i);
      add({ ...c, name: cand.name, city: c.city || cand.city, nameless: false, line: i, context: lines[i].text });
      return;
    }
    consumed.add(i);
    add({ ...c, line: i, context: lines[i].text });
  };

  lines.forEach((line, i) => {
    const hasPin = PIN.test(line.text);
    const chapter = !hasPin && chapters ? CHAPTER.exec(line.text) : null;
    const listed = !hasPin && !chapter && numbered && NUMBERED.test(line.text);
    // What comes before the first pin only counts for an address ("Adresse : 14 rue X 📍 …"), like a plain line.
    const pieces = hasPin
      ? line.text.split(PIN_ALL).map((t, k) => (k === 0 ? { text: t, strongCtx: false, kind: "plain" } : { text: t, strongCtx: true, kind: "pin" }))
      : [{ text: chapter ? chapter[1] : line.text, strongCtx: !!(chapter || listed), kind: chapter ? "chapter" : listed ? "numbered" : "plain" }];

    let found = 0;
    let lastCandidate = null;
    let carry = ""; // the text that sits before the next pin
    for (const piece of pieces) {
      const c = analyzeSegment(piece.text, { strongCtx: piece.strongCtx });
      const before = carry;
      carry = c && c.after != null ? c.after : piece.text;
      if (!c) continue;
      if (piece.kind === "pin") {
        // "Ichiran Ramen 📍 1-22-7 Jinnan": an address after the pin, the name before it.
        if (c.nameless && c.address) {
          const cand = nameBeforePin(before);
          if (cand) Object.assign(c, { name: cand.name, city: c.city || cand.city, nameless: false });
        } else if (sparse && !c.nameless && !looksLikeName(c.name)) continue; // a comment after a pin ("📍 un resto incroyable")
      }
      // A plain line only counts for its address (or an "Adresse :" / "Nom :" label); a chapter title must look like a name.
      if (piece.kind === "plain" && !c.address && c.labelKind !== "name" && !line.maps.length) continue;
      if (piece.kind === "chapter" && !c.address && (wordCount(c.name) > 5 || !/^[\p{Lu}\p{N}぀-ヿ㐀-䶿一-鿿]/u.test(c.name))) continue;
      lastCandidate = c;
      found += 1;
      if (c.nameless) addNameless({ ...c, line: i }, i);
      else {
        add({ ...c, line: i, context: line.text });
        consumed.add(i);
      }
    }

    if (!found && !hasPin && !line.maps.length) {
      const title = sectionTitle(line.text);
      if (title !== undefined) section = title;
    }

    // Map links on this line: the position (and the name) they carry.
    line.maps.forEach((url) => {
      const info = parseMapsUrl(url);
      const last = found && lastCandidate ? entries.find((e) => e.line === i && e.name === lastCandidate.name && e.address === lastCandidate.address) || entries[entries.length - 1] : null;
      if (last && last.line === i) {
        if (info && info.lat != null) Object.assign(last, { lat: info.lat, lng: info.lng });
        if (!isShortMapsUrl(url) && !last.mapsUrl) last.mapsUrl = url;
        if (isShortMapsUrl(url)) last.mapsUrl = url;
        consumed.add(i);
        return;
      }
      // The link stands alone (or with text that is not a place): it makes a place of its own.
      let name = info && info.name ? cleanPiece(info.name) : "";
      let address = null;
      let city = null;
      if (info && info.text) {
        const t = analyzeSegment(info.text, { strongCtx: true });
        if (t) {
          if (!name) name = t.name;
          address = t.address;
          city = t.city;
        } else if (!name) {
          name = cleanPiece(info.text);
        }
      }
      const c = { name: name && acceptName(name) ? name : "", city, address, nameless: !(name && acceptName(name)), lat: info ? info.lat : undefined, lng: info ? info.lng : undefined, mapsUrl: url, fromMaps: true };
      if (!c.nameless) {
        add({ ...c, line: i, context: line.text });
        consumed.add(i);
      } else {
        const above = lines[i - 1];
        const cand = above && !consumed.has(i - 1) && !above.maps.length ? nameFromPlainLine(above.text) : null;
        if (cand) {
          consumed.add(i - 1);
          add({ ...c, name: cand.name, city: c.city || cand.city, nameless: false, line: i, context: above.text });
        } else {
          add({ ...c, name: "Lieu sur Google Maps", line: i, context: line.text });
        }
        consumed.add(i);
      }
    });
  });
  return { entries, consumed };
}

// Words that may stay in lowercase inside a name ("Café de Flore", "Tour of Duty").
const NAME_CONNECTORS = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "a", "of", "the", "and", "et", "y", "e", "al", "el", "il", "di", "da", "del", "dei", "della", "delle", "do", "dos", "das", "von", "van", "der", "die", "am", "an", "en", "sur", "sous", "au", "aux", "in", "on", "at", "by", "san", "bin", "ben", "ibn", "abu"]);
// Names are written with capitals: "Best ramen in Tokyo" or "Le meilleur resto de Lyon" is a title, not a place.
function looksLikeName(name) {
  return name.split(/\s+/).every((w) => /^[\p{Lu}\p{N}"'«(]/u.test(w) || CJK.test(w) || /^[ld]['’]\p{Lu}/u.test(w) || NAME_CONNECTORS.has(norm(w)));
}

const inlineNumbered = (text) => (text.match(/(^|\s)\d{1,2}[.)]\s+\S/g) || []).length >= 2;
// One item of a list: short, and neither a sentence nor the header of a list ("Mes adresses :").
const isListLine = (text) => {
  const bare = removeTags(text).trim();
  return inlineNumbered(bare) || (!/[.!?:：]$/.test(bare) && wordCount(bare) <= MAX_NAME_WORDS);
};

// A short list: one place per line, numbered chunks inside a line, parts of a line separated by emoji, or separated
// by commas. The lines in `skip` (already read) are left out. Not for prose: most of what is left must look like the
// items of a list. Next to places read with a sure sign, it only completes them when two or more plain items are left;
// and in a text read from a video page (`sparse`) it only takes what is written like a name.
function readLoose(lines, skip, { sparse = false, strongCount = 0 } = {}) {
  const strict = sparse || strongCount > 0;
  const units = []; // { text, i, part }: a line, or one emoji-separated part of a line
  lines.forEach((l, i) => {
    if (!l.text || skip.has(i)) return;
    const text = l.text.replace(PIN_ALL, "•");
    if (!removeTags(text).trim()) return; // only hashtags
    if (strict && sectionTitle(text) !== undefined) return; // "HÔTELS", "Où dormir ?"
    const parts = text.split(EMOJI_SEP).map((p) => p.trim()).filter((p) => removeTags(p).trim());
    if (parts.length > 1) parts.forEach((p) => units.push({ text: p, i, part: true }));
    else units.push({ text, i, part: false });
  });
  const items = units.filter((u) => isListLine(u.text));
  if (!items.length || items.length < units.length * 0.5) return [];
  if (strongCount > 0 && (sparse || lines.length > 12 || items.length < 2)) return []; // a long description: only what is sure

  const out = [];
  const take = (piece, i) => out.push({ piece, i });
  if (units.length === 1 && !units[0].part && (units[0].text.match(/[,;]/g) || []).length >= 2) {
    // "Fushimi Inari, Kiyomizu-dera, Arashiyama": a list on one line.
    const parts = units[0].text.split(/[;,]/).map((p) => p.trim()).filter(Boolean);
    if (parts.every((p) => p.split(/\s+/).length <= 5)) parts.forEach((p) => take(p, units[0].i));
    else take(units[0].text, units[0].i);
  } else {
    items.forEach((u) => {
      // "Top 3 : 1) Fushimi Inari 2) Kiyomizu 3) Gion" — several numbered items in one line.
      const chunks = inlineNumbered(u.text) ? u.text.split(/(?:^|\s)\d{1,2}[.)]\s+/).slice(1) : [u.text];
      chunks.forEach((c) => take(c, u.i));
    });
  }

  const entries = [];
  for (const { piece, i } of out) {
    const cleaned = cleanPiece(piece);
    if (!cleaned) continue;
    const { name, city, note } = splitNameCity(cleaned);
    if (!acceptName(name) || (sparse && !looksLikeName(name))) continue;
    entries.push({ name, city, note, address: null, nameless: false, line: i, context: null });
  }
  return entries;
}

// Returns [{ name, city, address, categoryId, lat?, lng?, mapsUrl? }] — possibly with a few wrong lines: the
// traveller ticks what is right before anything is added.
// `sparse`: the text is a long one read from a video page, not a list typed by the traveller.
export function readPlaces(raw, { sparse = false } = {}) {
  const lines = prepareLines(raw);
  if (!lines.length) return [];
  const headline = headlineCategory(lines);
  const { entries: strong, consumed } = readStrong(lines, { sparse, headline });
  const entries = [...strong, ...readLoose(lines, consumed, { sparse, strongCount: strong.length }).map((e) => ({ section: headline, ...e }))].sort((a, b) => a.line - b.line);

  const seen = new Map();
  const out = [];
  for (const e of entries) {
    const name = e.name || nameFromAddress(e.address);
    if (!name) continue;
    const key = norm(name);
    if (!key) continue;
    const before = seen.get(key);
    if (before) {
      // The same place written twice: keep the one that says more.
      if (!before.address && e.address) before.address = e.address;
      if (!before.city && e.city) before.city = e.city;
      if (before.lat == null && e.lat != null) Object.assign(before, { lat: e.lat, lng: e.lng });
      if (!before.mapsUrl && e.mapsUrl) before.mapsUrl = e.mapsUrl;
      continue;
    }
    const place = { name, city: e.city || null, categoryId: categoryFor(name, e) };
    if (e.address) place.address = e.address;
    if (e.nameless && e.address) place.nameless = true;
    if (e.lat != null) Object.assign(place, { lat: e.lat, lng: e.lng });
    if (e.mapsUrl) place.mapsUrl = e.mapsUrl;
    seen.set(key, place);
    out.push(place);
    if (out.length >= MAX_PLACES) break;
  }
  return out;
}

// Same as readPlaces (the name the screens and the tests know).
export const parsePlaceList = readPlaces;

// ---------- Links ----------

// What a link says (see linkReader.readLink). Kept under its old name.
export const fetchLinkInfo = readLink;

// ---------- The whole analysis ----------

const PARTIAL_WARNING = "Seul le titre a pu être lu : collez aussi la description de la vidéo.";

// raw = whatever was pasted. Returns
// { places: [{ name, city, address, categoryId, lat?, lng?, sourceUrl, sourceLabel }],
//   links: [{ url, source, author, title, caption, description, poi, partial, found, warning, error }] }
export async function analyzeInput(raw, { fetchImpl } = {}) {
  const mapsUrls = mapsUrlsIn(raw);
  const urls = extractUrls(raw).filter((u) => !mapsUrls.some((m) => u === m || u.startsWith(m))).slice(0, MAX_LINKS);
  const links = await Promise.all(
    urls.map(async (url) => {
      try {
        const info = await readLink(url, { fetchImpl });
        return { ...info, error: null };
      } catch (e) {
        return { url, source: sourceOf(url), author: null, title: null, caption: null, description: null, poi: null, partial: false, error: e.message };
      }
    })
  );

  // What each source says, in the order it was given: the pasted text first, then each link.
  const chunks = [{ text: raw, sourceUrl: null, sourceLabel: null, link: null }];
  links.forEach((l) => {
    const label = `${SOURCE_LABELS[l.source]}${l.author ? " · " + l.author : ""}`;
    const text = l.source === "youtube" ? l.description : l.title;
    if (text) chunks.push({ text, sourceUrl: l.url, sourceLabel: label, link: l });
    if (l.poi) chunks.push({ text: [l.poi.name, l.poi.address].filter(Boolean).join(", "), poi: l.poi, sourceUrl: l.url, sourceLabel: label, link: l });
  });

  const places = [];
  const index = new Map();
  for (const chunk of chunks) {
    if (!chunk.text || !chunk.text.trim()) continue;
    let found;
    if (chunk.poi) {
      // The place the author tagged on the video: its name and address as TikTok has them.
      const p = chunk.poi;
      const addr = findAddress(p.address || "", { strong: true });
      found = [{ name: p.name, city: p.city || (addr && addr.city) || null, categoryId: guessCategory(p.name, chunk.text), address: p.address || undefined }];
    } else {
      found = readPlaces(chunk.text, { sparse: !!chunk.link });
    }
    for (const p of found) {
      const key = norm(p.name);
      const known = index.get(key);
      if (known) {
        // Already read from another source (the caption says the name, the tag says the address): complete it.
        if (!known.address && p.address) known.address = p.address;
        if (!known.city && p.city) known.city = p.city;
        if (known.lat == null && p.lat != null) Object.assign(known, { lat: p.lat, lng: p.lng });
        if (chunk.link) chunk.link.found = (chunk.link.found || 0) + 0;
        continue;
      }
      const place = { ...p, sourceUrl: p.mapsUrl || chunk.sourceUrl, sourceLabel: chunk.sourceLabel, origin: chunk.sourceUrl };
      index.set(key, place);
      places.push(place);
      if (chunk.link) chunk.link.found = (chunk.link.found || 0) + 1;
    }
  }

  // Short map links ("maps.app.goo.gl/…") say nothing until they are followed: that gives the position of the place.
  const pending = places.filter((p) => p.mapsUrl && isShortMapsUrl(p.mapsUrl) && p.lat == null).slice(0, 8);
  await Promise.all(
    pending.map(async (p) => {
      const info = await resolveMapsLink(p.mapsUrl, { fetchImpl });
      if (!info) return;
      if (info.lat != null) Object.assign(p, { lat: info.lat, lng: info.lng });
      if (info.name && p.nameless) {
        p.name = cleanPiece(info.name) || p.name;
        p.nameless = false;
      }
      if (info.text && !p.address) {
        const t = analyzeSegment(info.text, { strongCtx: true });
        if (t && t.address) p.address = t.address;
        if (t && !p.city) p.city = t.city;
      }
    })
  );

  links.forEach((l) => {
    l.found = l.found || 0;
    if (l.error) return;
    if (l.partial) l.warning = PARTIAL_WARNING;
    else if (!l.found) l.warning = l.source === "tiktok" ? "Aucun lieu reconnu dans la légende." : "Aucun lieu reconnu dans la description.";
  });
  places.forEach((p) => delete p.origin);
  return { places: places.slice(0, MAX_PLACES), links };
}

// Flags the places that are already in the notebook (they start unticked).
export function markDuplicates(places, trip) {
  const known = new Set((trip.ideas || []).map((i) => norm(i.name)));
  return places.map((p) => ({ ...p, duplicate: known.has(norm(p.name)) }));
}

// ---------- Positions ----------

// Looks each place up on OpenStreetMap, one after the other (the service allows one request per second). A place
// that already has a position (from a map link) is not searched. A place with an address is searched by its name and
// its address, then by the address alone, then a little less exactly (without the number, the postal code): the typed
// address is kept either way. A place that is not found, or found suspiciously far from the rest of the trip,
// simply stays without a position. A network problem stops the lookups; the places are still returned.
// `missing` = how many have no position. `search` and `shouldStop` are injectable for tests and for the "skip" button.
export async function locatePlaces(places, trip, { onProgress, shouldStop, search = searchPlacesWithFallback } = {}) {
  const located = [];
  let stopped = false;
  const known = (trip.ideas || []).filter((i) => Number.isFinite(i.lat) && Number.isFinite(i.lng));
  for (let i = 0; i < places.length; i++) {
    const place = places[i];
    if (onProgress) onProgress(i, places.length);
    if (Number.isFinite(place.lat) && Number.isFinite(place.lng)) {
      located.push(place);
      continue;
    }
    if (stopped || (shouldStop && shouldStop())) {
      stopped = true;
      located.push(place);
      continue;
    }
    try {
      const near = centroidOf([...known, ...located]);
      const { results } = await search({ name: place.nameless ? "" : place.name, address: place.address, city: place.city, fallbackCity: trip.defaultLocation }, { near, limit: 3, loose: !!place.address });
      const hit = results && results[0];
      if (hit && !(near && distanceKm(near, hit) > FAR_FROM_TRIP_KM)) {
        located.push({ ...place, address: place.address || hit.address || null, city: place.city || hit.city || null, lat: hit.lat, lng: hit.lng, openingHours: hit.openingHours || null });
      } else {
        located.push(place);
      }
    } catch {
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
