// What can be read from the page of a public TikTok or YouTube video: its title, its description (the caption on
// TikTok), its author, and the place the author tagged on TikTok.
//
// Neither service hands out a description through a public address without a key, so the pages themselves are read
// the way a browser would, with more than one way to get the same text (the first that works wins, the others are
// the safety net when a service changes or refuses):
//  - YouTube: the watch page (its data holds the whole description) and the short "oEmbed" answer (the title only);
//  - TikTok: the "oEmbed" answer (the caption) and the video page (the caption again, and the tagged place);
//  - Google Maps short links: followed to the real address.
// Every request has a deadline. When nothing can be read, the traveller pastes the text instead.
import { mapsUrlsIn, parseMapsUrl, unwrapConsentUrl } from "./placeText";

export const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const HTML_HEADERS = {
  "User-Agent": BROWSER_UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
};
// YouTube asks people in Europe to accept cookies before showing a page: these two cookies are the answer "accepted".
const YOUTUBE_HEADERS = { ...HTML_HEADERS, Cookie: "SOCS=CAI; CONSENT=YES+cb.20210328-17-p0.en+FX+671" };
const JSON_HEADERS = { "User-Agent": BROWSER_UA, Accept: "application/json", "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8" };

// ---------- Links in a text ----------

export function extractUrls(text) {
  const found = (text || "").match(/https?:\/\/[^\s<>"'`]+/gi) || [];
  return [...new Set(found.map((u) => u.replace(/[),.;:!?]+$/, "")))];
}

export function removeUrls(text) {
  return (text || "").replace(/https?:\/\/[^\s<>"'`]+/gi, " ");
}

export function sourceOf(url) {
  // Regex, not `new URL()`: React Native's URL has no working `hostname`.
  const m = /^https?:\/\/([^/?#:]+)/i.exec(url || "");
  const host = m ? m[1].toLowerCase() : "";
  if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
  if (/(^|\.)youtube\.com$/.test(host) || host === "youtu.be" || host === "youtube-nocookie.com" || host === "www.youtube-nocookie.com") return "youtube";
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  return "other";
}

export const SOURCE_LABELS = { tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram", other: "Lien" };

function linkError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// ---------- Reading a page ----------

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", laquo: "«", raquo: "»" };

// "&amp;", "&#39;", "&#128205;" (📍) in the attributes of a page.
export function decodeEntities(s) {
  return String(s == null ? "" : s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try {
        return String.fromCodePoint(code);
      } catch {
        return m;
      }
    }
    const named = NAMED_ENTITIES[e.toLowerCase()];
    return named != null ? named : m;
  });
}

// The <meta> tags at the top of a page, as [{ property, name, content, … }]. Quoted values may hold ">".
function metaTags(html) {
  const head = String(html || "").slice(0, 400000);
  const tags = [];
  const re = /<meta\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  let m;
  while ((m = re.exec(head))) {
    const attrs = {};
    const are = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let a;
    while ((a = are.exec(m[1]))) attrs[a[1].toLowerCase()] = decodeEntities(a[2] != null ? a[2] : a[3]);
    tags.push(attrs);
  }
  return tags;
}

function metaContent(tags, key) {
  const tag = tags.find((a) => a.content != null && ((a.property || "").toLowerCase() === key || (a.name || "").toLowerCase() === key));
  return tag ? tag.content : null;
}

// The JSON string that starts at src[i] (a quote): { value, end } or null.
function readJsonString(src, i) {
  if (src[i] !== '"') return null;
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (c === "\\") {
      j += 2;
      continue;
    }
    if (c === '"') break;
    j += 1;
  }
  if (j >= src.length) return null;
  try {
    return { value: JSON.parse(src.slice(i, j + 1)), end: j + 1 };
  } catch {
    return null;
  }
}

// The string value after `marker` (like '"shortDescription":'), searched from `from`, no further than `within` characters.
function stringAfter(src, marker, from, within) {
  const at = src.indexOf(marker, from);
  if (at < 0 || (within != null && at - from > within)) return null;
  let i = at + marker.length;
  while (src[i] === " ") i += 1;
  const r = readJsonString(src, i);
  return r ? r.value : null;
}

const longest = (a, b) => (a && b ? (b.length > a.length ? b : a) : a || b || null);

const clean = (v) => {
  const t = typeof v === "string" ? v.replace(/\r/g, "").trim() : "";
  return t || null;
};

// ---------- YouTube ----------

// The identifier of a video from any of its addresses (watch, youtu.be, shorts, live, embed, mobile), or null.
export function youtubeVideoId(url) {
  const u = String(url || "");
  const patterns = [/[?&]v=([\w-]{11})(?![\w-])/, /youtu\.be\/([\w-]{11})(?![\w-])/i, /\/(?:shorts|live|embed|v)\/([\w-]{11})(?![\w-])/i];
  for (const re of patterns) {
    const m = re.exec(u);
    if (m) return m[1];
  }
  return null;
}

// { title, description, author, consent } from the HTML of a watch page. The whole description is in the data of the
// page ("shortDescription"); the <meta> description is only its first lines, kept as a last resort.
export function parseYouTubePage(html) {
  const h = String(html || "");
  const out = { title: null, description: null, author: null, consent: false };
  const tags = metaTags(h);

  const details = h.indexOf('"videoDetails":{');
  if (details >= 0) {
    out.title = clean(stringAfter(h, '"title":', details, 3000));
    out.description = clean(stringAfter(h, '"shortDescription":', details, 60000));
    out.author = clean(stringAfter(h, '"author":', details, 80000));
  }
  if (!out.description) {
    const micro = h.indexOf('"playerMicroformatRenderer"');
    if (micro >= 0) {
      const at = h.indexOf('"description":{"simpleText":', micro);
      if (at >= 0 && at - micro < 8000) out.description = clean(stringAfter(h, '"simpleText":', at, 40));
    }
  }
  if (!out.description) {
    const at = h.indexOf('"attributedDescription":{"content":');
    if (at >= 0) out.description = clean(stringAfter(h, '"content":', at, 40));
  }
  if (!out.title) out.title = clean(metaContent(tags, "og:title")) || clean(metaContent(tags, "title"));
  if (!out.title) {
    const t = /<title>([\s\S]*?)<\/title>/i.exec(h.slice(0, 400000));
    if (t) out.title = clean(decodeEntities(t[1]).replace(/\s*-\s*YouTube\s*$/i, ""));
  }
  if (!out.description) {
    // Truncated, but better than nothing: the beginning of the description, which is where addresses usually are.
    const meta = longest(clean(metaContent(tags, "og:description")), clean(metaContent(tags, "description")));
    if (meta && !/^(?:Enjoy the videos and music|Profitez des vidéos et de la musique)/i.test(meta)) out.description = meta;
  }
  out.consent = !h.includes('"videoDetails"') && /consent\.youtube\.com\/(?:save|s)\b|<title>\s*(?:Before you continue|Avant d.accéder)/i.test(h);
  return out;
}

// ---------- TikTok ----------

// "https://www.tiktok.com/@user/video/123" from any longer address of the same video (tracking parameters dropped), or null.
export function tiktokVideoUrl(url) {
  const m = /https?:\/\/(?:www\.|m\.)?tiktok\.com\/(@[^/?#]*)\/(video|photo)\/(\d+)/i.exec(String(url || ""));
  return m ? `https://www.tiktok.com/${m[1]}/${m[2].toLowerCase()}/${m[3]}` : null;
}

function readPoi(p) {
  if (!p || typeof p !== "object") return null;
  const name = clean(p.name);
  if (!name) return null;
  return { name, address: clean(p.address), city: clean(p.city) };
}

// The caption inside the sentence TikTok puts in its page description:
//   '1.2M likes, 3K comments. TikTok video from Name (@name): "the caption". original sound'
function captionFromSentence(d) {
  const m = /[:：]\s*["“«]\s*([\s\S]+?)\s*["”»]\s*\.?\s*(?:original sound.*|son original.*)?$/i.exec(String(d || "").trim());
  return m ? clean(m[1]) : null;
}

// { caption, author, poi, canonical } from the HTML of a video page: the data of the page first, then its <meta> tags.
export function parseTikTokPage(html) {
  const h = String(html || "");
  const out = { caption: null, author: null, poi: null, canonical: null };

  for (const id of ["__UNIVERSAL_DATA_FOR_REHYDRATION__", "SIGI_STATE"]) {
    const m = new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)</script>`).exec(h);
    if (!m) continue;
    try {
      const data = JSON.parse(m[1]);
      const scope = data && data.__DEFAULT_SCOPE__;
      const detail = scope && (scope["webapp.video-detail"] || scope["webapp.photo-detail"]);
      let item = detail && detail.itemInfo && detail.itemInfo.itemStruct;
      if (!item && data && data.ItemModule && typeof data.ItemModule === "object") item = Object.values(data.ItemModule)[0];
      if (item) {
        out.caption = clean(item.desc);
        const a = item.author;
        out.author = clean(typeof a === "string" ? a : a && (a.nickname || a.uniqueId));
        out.poi = readPoi(item.poi);
        break;
      }
    } catch {
      // not JSON after all: the <meta> tags below
    }
  }

  const tags = metaTags(h);
  if (!out.caption) out.caption = captionFromSentence(metaContent(tags, "og:description")) || captionFromSentence(metaContent(tags, "description"));
  if (!out.author) {
    const t = clean(metaContent(tags, "og:title"));
    const m = t && /^(.+?)\s+(?:on|sur)\s+TikTok/i.exec(t);
    if (m) out.author = clean(m[1]);
  }
  out.canonical = tiktokVideoUrl(metaContent(tags, "og:url") || "") || tiktokVideoUrl((/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i.exec(h.slice(0, 400000)) || [])[1] || "");
  return out;
}

// ---------- Fetching ----------

// GET with one deadline for the whole answer, body included (a slow connection can stall in the middle of a page).
async function getText(fetchImpl, url, { headers = {}, ms = 10000 } = {}) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (controller) controller.abort();
      reject(linkError("TIMEOUT", "Délai dépassé."));
    }, ms);
  });
  const run = (async () => {
    const res = await (fetchImpl || fetch)(url, controller ? { headers, signal: controller.signal } : { headers });
    const text = res.ok ? await res.text() : "";
    return { ok: !!res.ok, status: res.status, url: res.url || url, text };
  })();
  try {
    return await Promise.race([run, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

// Runs one request and counts how it went, so that the caller can tell "no connection" from "no such video".
async function attempt(trace, fn) {
  trace.total += 1;
  try {
    const r = await fn();
    if (r && r.ok) trace.ok += 1;
    else if (r) trace.statuses.push(r.status);
    return r;
  } catch {
    trace.failed += 1;
    return null;
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function readYouTube(url, fetchImpl, trace) {
  const id = youtubeVideoId(url);
  const watch = id ? `https://www.youtube.com/watch?v=${id}` : url;
  const [page, oembed] = await Promise.all([
    attempt(trace, () => getText(fetchImpl, watch, { headers: YOUTUBE_HEADERS, ms: 12000 })),
    attempt(trace, () => getText(fetchImpl, `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`, { headers: JSON_HEADERS, ms: 9000 })),
  ]);
  const parsed = page && page.ok && !/consent\.youtube\.com/.test(page.url || "") ? parseYouTubePage(page.text) : { title: null, description: null, author: null };
  const json = oembed && oembed.ok ? parseJson(oembed.text) : null;
  return {
    title: clean(parsed.title) || clean(json && json.title),
    description: clean(parsed.description),
    author: clean(parsed.author) || clean(json && json.author_name),
    poi: null,
  };
}

async function readTikTok(url, fetchImpl, trace) {
  let target = url;
  let pageHtml = "";
  // A short link (vm.tiktok.com/…, tiktok.com/t/…) is followed first: its answer is already the video page.
  if (/^https?:\/\/(?:vm|vt)\.tiktok\.com\/|tiktok\.com\/t\//i.test(url)) {
    const r = await attempt(trace, () => getText(fetchImpl, url, { headers: HTML_HEADERS, ms: 10000 }));
    if (r && r.ok) {
      pageHtml = r.text;
      const real = tiktokVideoUrl(r.url) || tiktokVideoUrl(parseTikTokPage(r.text).canonical || "");
      if (real) target = real;
    }
  }
  const canonical = tiktokVideoUrl(target);
  const [oembed, page] = await Promise.all([
    attempt(trace, () => getText(fetchImpl, `https://www.tiktok.com/oembed?url=${encodeURIComponent(canonical || target)}`, { headers: JSON_HEADERS, ms: 9000 })),
    pageHtml || !canonical ? Promise.resolve(null) : attempt(trace, () => getText(fetchImpl, canonical, { headers: HTML_HEADERS, ms: 12000 })),
  ]);
  const json = oembed && oembed.ok ? parseJson(oembed.text) : null;
  const parsed = parseTikTokPage(pageHtml || (page && page.ok ? page.text : ""));
  return {
    title: longest(clean(json && json.title), parsed.caption),
    description: null,
    author: clean(json && json.author_name) || parsed.author,
    poi: parsed.poi,
  };
}

// What the link says: { url, source, author, title, caption, description, poi, partial }.
//   title: the title of a YouTube video, the caption of a TikTok;
//   description: the description of a YouTube video (null on TikTok, where the caption says it all);
//   partial: only a title could be read (the description is the part that matters; the traveller pastes it).
// Throws an Error with a code (UNSUPPORTED, NETWORK, HTTP, EMPTY) and a sentence for the screen when nothing was read.
export async function readLink(url, { fetchImpl = fetch } = {}) {
  const source = sourceOf(url);
  if (source === "instagram") throw linkError("UNSUPPORTED", "Instagram ne permet pas de lire ce lien : collez la description.");
  if (source !== "tiktok" && source !== "youtube") throw linkError("UNSUPPORTED", "Seuls les liens TikTok et YouTube sont lus. Collez plutôt le texte.");

  const trace = { total: 0, ok: 0, failed: 0, statuses: [] };
  const read = source === "tiktok" ? await readTikTok(url, fetchImpl, trace) : await readYouTube(url, fetchImpl, trace);

  if (!read.title && !read.description && !read.poi) {
    if (trace.total > 0 && trace.failed === trace.total) throw linkError("NETWORK", "Pas de connexion : réessayez, ou collez la description.");
    if (trace.ok === 0 && trace.statuses.length && trace.statuses.every((s) => s === 400 || s === 401 || s === 403 || s === 404)) throw linkError("HTTP", "Vidéo introuvable ou privée.");
    if (trace.ok === 0 && trace.statuses.length) throw linkError("HTTP", `Service indisponible (${trace.statuses[0]}) : collez la description.`);
    throw linkError("EMPTY", source === "tiktok" ? "Cette vidéo n'a pas de légende lisible : collez-la." : "Impossible de lire cette vidéo : collez sa description.");
  }
  return {
    url,
    source,
    author: read.author,
    title: read.title,
    caption: read.title,
    description: read.description,
    poi: read.poi,
    partial: source === "youtube" && !read.description,
  };
}

// ---------- Google Maps links ----------

// The place behind a map link: { name?, text?, lat?, lng? } or null. A short link is followed to its real address first.
export async function resolveMapsLink(url, { fetchImpl = fetch } = {}) {
  const direct = parseMapsUrl(url);
  if (direct && (direct.lat != null || direct.name || direct.text)) return direct;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let timer;
  try {
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        if (controller) controller.abort();
        reject(linkError("TIMEOUT", "Délai dépassé."));
      }, 8000);
    });
    const res = await Promise.race([(fetchImpl || fetch)(url, controller ? { headers: HTML_HEADERS, signal: controller.signal } : { headers: HTML_HEADERS }), deadline]);
    if (controller) controller.abort(); // only the address after the redirects matters, not the page
    return parseMapsUrl(unwrapConsentUrl((res && res.url) || url));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export { mapsUrlsIn };
