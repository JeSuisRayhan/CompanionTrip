// Reads the text of a booking confirmation (a flight, a train, a hotel, a restaurant, a ticket) pasted from an
// email or a message, and proposes the steps to add to a trip: day, time, title, price (euros), code, address.
// Rules only, no network: it recognises the usual layouts in French and English; when it finds nothing the
// screen can ask the AI (the person's own key) with the same result shape.
import { addDaysISO, diffDaysISO, isoDate, tripRange } from "./dates";
import { AI_MODEL } from "./script";

const pad2 = (n) => String(n).padStart(2, "0");

// ---------- cleaning ----------
function clean(text) {
  return String(text || "")
    .replace(/[   ]/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ");
}
function linesOf(text) {
  return clean(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

// ---------- dates ----------
const MONTHS = {
  janvier: 1, janv: 1, jan: 1, january: 1, fevrier: 2, février: 2, fevr: 2, févr: 2, feb: 2, february: 2, mars: 3, mar: 3, march: 3, avril: 4, avr: 4, apr: 4, april: 4,
  mai: 5, may: 5, juin: 6, jun: 6, june: 6, juillet: 7, juil: 7, jul: 7, july: 7, aout: 8, août: 8, aug: 8, august: 8, septembre: 9, sept: 9, sep: 9, september: 9,
  octobre: 10, oct: 10, october: 10, novembre: 11, nov: 11, november: 11, decembre: 12, décembre: 12, dec: 12, déc: 12, december: 12,
};
const MONTH_NAMES = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
const WEEKDAY = "(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|lun|mar|mer|jeu|ven|sam|dim|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)";

const DATE_RES = [
  { re: /\b(\d{4})-(\d{2})-(\d{2})\b/g, pick: (m) => ({ y: +m[1], m: +m[2], d: +m[3] }) },
  { re: /\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{4}|\d{2})\b/g, pick: (m) => ({ y: m[3].length === 2 ? 2000 + +m[3] : +m[3], m: +m[2], d: +m[1] }) },
  { re: new RegExp(`\\b(\\d{1,2})(?:er)?\\s+(${MONTH_NAMES})\\.?(?:,?\\s+(\\d{4}))?(?![a-zà-ÿ])`, "gi"), pick: (m) => ({ y: m[3] ? +m[3] : null, m: MONTHS[m[2].toLowerCase()], d: +m[1] }) },
  { re: new RegExp(`\\b(${MONTH_NAMES})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?![a-zà-ÿ0-9])`, "gi"), pick: (m) => ({ y: m[3] ? +m[3] : null, m: MONTHS[m[1].toLowerCase()], d: +m[2] }) },
];

// A date that is when the booking was made or the email sent, not a day of the trip.
const NOISE_BEFORE = /(r[ée]serv[ée]e?\s+le|date\s+de\s+(?:r[ée]servation|commande|paiement|[ée]mission)|[ée]mis\s+le|envoy[ée]\s+le|booked\s+on|booking\s+date|order\s+date|date\s+of\s+(?:booking|issue|purchase)|issued\s+on|sent\s+on|pay[ée]e?\s+le|annulation\s+gratuite\s+jusqu|free\s+cancell?ation\s+until|cancel\w*\s+(?:before|until|avant|jusqu))\s*[:\-]?\s*$/i;

function validDate(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
  const t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
}

// With no year in the text, the year that puts the day inside (or nearest to) the trip, else the next one coming.
function inferYear(m, d, { range, today }) {
  const base = range && range.start ? +range.start.slice(0, 4) : +today.slice(0, 4);
  const candidates = [base - 1, base, base + 1, base + 2].filter((y) => validDate(y, m, d));
  if (range && range.start) {
    const dist = (y) => {
      const iso = `${y}-${pad2(m)}-${pad2(d)}`;
      if (iso < range.start) return diffDaysISO(iso, range.start);
      if (iso > range.end) return diffDaysISO(range.end, iso);
      return 0;
    };
    return candidates.sort((a, b) => dist(a) - dist(b))[0];
  }
  return candidates.find((y) => `${y}-${pad2(m)}-${pad2(d)}` >= today) || candidates[candidates.length - 1];
}

// All the days written in a line: [{ iso, index (where it starts) }], booking dates left out.
export function datesIn(line, ctx) {
  const found = [];
  const spans = []; // where the "12 mai" forms are: "mar. 12 mai" must not also be read as "mar 12" (March 12)
  DATE_RES.forEach(({ re, pick }, rank) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line))) {
      const start = m.index;
      const end = m.index + m[0].length;
      if (rank === 3 && spans.some(([a, b]) => start < b && end > a)) continue;
      if (rank === 2) spans.push([start, end]);
      const before = line.slice(Math.max(0, start - 40), start);
      if (NOISE_BEFORE.test(before)) continue;
      const p = pick(m);
      const y = p.y != null ? p.y : inferYear(p.m, p.d, ctx);
      if (!y || !validDate(y, p.m, p.d)) continue;
      const iso = `${y}-${pad2(p.m)}-${pad2(p.d)}`;
      if (!found.some((f) => f.iso === iso && Math.abs(f.index - start) < 12)) found.push({ iso, index: start });
    }
  });
  return found.sort((a, b) => a.index - b.index);
}

// ---------- times ----------
const TIME_RE = /\b(\d{1,2})\s*(?::|h)\s*(\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?(?![\d])/gi;
export function timesIn(line) {
  const out = [];
  TIME_RE.lastIndex = 0;
  let m;
  while ((m = TIME_RE.exec(line))) {
    // "14h" alone is a time only when written with the h: "14:" with nothing after is not
    if (m[2] == null && !/h/i.test(m[0])) continue;
    let h = +m[1];
    const min = m[2] != null ? +m[2] : 0;
    const ap = m[3] ? m[3].toLowerCase().replace(/\./g, "") : null;
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h > 23 || min > 59) continue;
    out.push({ time: `${pad2(h)}:${pad2(min)}`, index: m.index, end: m.index + m[0].length });
  }
  return out;
}

// ---------- price (euros only, like the script) ----------
function toNumber(raw) {
  let s = String(raw).replace(/\s/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (lastComma > -1) s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  else if (lastDot > -1 && !/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
const AMOUNT = "(\\d{1,3}(?:[ .,]\\d{3})*(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)";
const EURO_AFTER = new RegExp(`${AMOUNT}\\s*(?:€|eur\\b|euros?\\b)`, "gi");
const EURO_BEFORE = new RegExp(`(?:€|eur\\b)\\s*${AMOUNT}`, "gi");
const TOTAL_WORDS = /(total|montant|prix|price|amount|à payer|a payer|pay[ée]|grand total|sous-total)/i;

// The total of the booking: an amount in euros next to "total", else the largest one.
export function priceIn(text) {
  const all = [];
  for (const line of linesOf(text)) {
    for (const re of [EURO_AFTER, EURO_BEFORE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line))) {
        const n = toNumber(m[1]);
        if (n != null && n > 0) all.push({ n, labelled: TOTAL_WORDS.test(line) && !/sous-total|subtotal|taxes?\b|frais|fees/i.test(line) });
      }
    }
  }
  if (!all.length) return null;
  const labelled = all.filter((a) => a.labelled);
  const pool = labelled.length ? labelled : all;
  return Math.round(Math.max(...pool.map((a) => a.n)) * 100) / 100;
}

// ---------- code ----------
// "Référence de réservation : K7QX2M", "Confirmation code: HMXK4P29", "Dossier voyage : 7XK2PQ": a label, up to two
// filler words, then the code (capitals and digits, with a digit in it or six letters like an airline PNR).
const CODE_LABEL = /(?:r[ée]f[ée]rence|confirmation|r[ée]servation|reservation|booking|dossier|pnr|locator|code|n°|num[ée]ro|number)(?:\s+[a-zà-ÿ'’]{2,15}){0,2}\s*[:#°\-–.]*\s*([a-z0-9]{5,12})(?![a-z0-9à-ÿ])/gi;
const NOT_CODES = /^(RESERVATION|CONFIRMATION|REFERENCE|BOOKING|NUMBER|NUMERO|PASSENGER|PASSAGER|DOSSIER|ADRESSE|ADDRESS|CONFIRMED)$/;
export function codeIn(text) {
  const flat = clean(text);
  CODE_LABEL.lastIndex = 0;
  let m;
  while ((m = CODE_LABEL.exec(flat))) {
    const code = m[1];
    if (code !== code.toUpperCase() || NOT_CODES.test(code)) continue;
    if (/\d/.test(code) || code.length === 6) return code;
  }
  return null;
}

// ---------- kinds ----------
const ARROW = "(?:→|➔|➜|->|=>|—>|–>|>|\\bto\\b|\\bvers\\b)";
const IATA_PAIR = new RegExp(`\\b([A-Z]{3})\\b[^A-Za-z\\n]{0,24}?${ARROW}[^A-Za-z\\n]{0,24}?\\b([A-Z]{3})\\b`);
const FLIGHT_WORDS = /\b(vol|flight|boarding|embarquement|airlines?|airways|ryanair|easyjet|transavia|vueling|a[ée]roport|airport|air france|klm|lufthansa|iberia|emirates|qatar|volotea|wizz)\b/i;
const TRAIN_WORDS = /\b(train|tgv|sncf|ouigo|eurostar|trainline|inoui|thalys|shinkansen|ter|intercit[ée]s|renfe|trenitalia|italo|db bahn|gare)\b/i;
const HOTEL_WORDS = /(h[ôo]tel|hotel|h[ée]bergement|check-?in|check-?out|\bnuit|\bnight|chambre|\broom\b|resort|ryokan|auberge|hostel|airbnb|booking\.com|logement|appartement|gîte|gite|villa)/i;
const RESTAURANT_WORDS = /(restaurant|thefork|lafourchette|opentable|\bcouverts?\b|brasserie|bistro|trattoria|izakaya|table pour|table for|réservation de table)/i;

// A line that goes from a place to another: "Paris (CDG) 10:05 → Tokyo (HND) 06:30", "Gare de Lyon 08:19 → Lyon Part-Dieu 10:21".
const SEGMENT_SPLIT = new RegExp(`\\s*${ARROW}\\s*`, "i");
function segmentFromLine(line) {
  if (!SEGMENT_SPLIT.test(line)) return null;
  const parts = line.split(SEGMENT_SPLIT);
  if (parts.length < 2) return null;
  const place = (s) =>
    s
      .replace(TIME_RE, " ")
      .replace(/\+\d\b/g, " ")
      .replace(/^[^A-Za-zÀ-ÿ0-9(]+|[^A-Za-zÀ-ÿ0-9)]+$/g, "")
      .replace(/^(?:d[ée]part|arriv[ée]e|from|de|depart|arrival)\s*[:\-]?\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
  const from = place(parts[0]);
  const to = place(parts[parts.length - 1]);
  if (from.length < 3 || to.length < 3 || from.length > 48 || to.length > 48) return null;
  if (!/[A-Za-zÀ-ÿ]{3}/.test(from) || !/[A-Za-zÀ-ÿ]{3}/.test(to)) return null;
  return { from, to, times: timesIn(line) };
}

const FLIGHT_NO = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{2,4})\b/;
const NOT_AIRLINES = /^(TO|DE|LE|LA|AU|EN|ET|OU|NO|TVA|PM|AM)$/;
function flightNoOf(line) {
  if (!line) return null;
  const m = FLIGHT_NO.exec(line.replace(/\b\d{1,2}\s*[:h]\s*\d{2}\b/g, " "));
  return m && /[A-Z]/.test(m[1]) && !NOT_AIRLINES.test(m[1]) ? `${m[1]} ${m[2]}` : null;
}

function detectKind(text, segments) {
  const flat = clean(text);
  if (segments.length) {
    if (IATA_PAIR.test(flat) || FLIGHT_WORDS.test(flat)) return "flight";
    if (TRAIN_WORDS.test(flat)) return "train";
    return "train";
  }
  if (HOTEL_WORDS.test(flat) && !RESTAURANT_WORDS.test(flat)) return "hotel";
  if (RESTAURANT_WORDS.test(flat)) return "restaurant";
  if (HOTEL_WORDS.test(flat)) return "hotel";
  return "activity";
}

const LABELLED = (label) => new RegExp(`^(?:${label})\\s*[:\\-–]\\s*(.*)$`, "i");

function labelled(lines, label) {
  const re = LABELLED(label);
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]);
    if (!m) continue;
    const value = m[1].trim();
    if (value) return value;
    if (lines[i + 1] && !/^[^:]{1,25}:\s/.test(lines[i + 1])) return lines[i + 1].trim();
  }
  return null;
}

// The first line that reads as a name: no label, not a greeting or a "confirmed" banner.
function firstTitleLine(lines) {
  return lines.find((l) => l.length >= 4 && l.length <= 80 && !/:\s/.test(l) && /[A-Za-zÀ-ÿ]{4}/.test(l) && !/^(bonjour|hello|hi\b|dear|cher|chère|merci|thank)/i.test(l) && !/confirm|r[ée]servation|reservation|booking|votre|your|re[çc]u|receipt/i.test(l));
}

function addressIn(lines) {
  return labelled(lines, "adresse|address|adresse de l'établissement|property address|lieu|location|lieu de rendez-vous|meeting point");
}

// ---------- the steps ----------
// Returns [{ date, time, title, type, price, confirmationCode, address, nights, kind }] — date is an ISO day or null when
// the text gives none.
export function parseConfirmation(text, { trip = null, today = isoDate(new Date()) } = {}) {
  const lines = linesOf(text);
  if (!lines.length) return [];
  const range = trip ? tripRange(trip) : null;
  const ctx = { range: range && range.start ? range : null, today };
  const code = codeIn(text);
  const price = priceIn(text);
  const address = addressIn(lines);

  // 1. place-to-place lines (flights, trains) with the day last seen above them
  let segments = [];
  let lastDate = null;
  lines.forEach((line, i) => {
    const ds = datesIn(line, ctx);
    const seg = segmentFromLine(line);
    if (ds.length && !seg) lastDate = ds[0].iso;
    if (!seg) return;
    const date = ds.length ? ds[0].iso : lastDate;
    let time = seg.times.length ? seg.times[0].time : null;
    if (!time) {
      for (const near of [lines[i + 1], lines[i - 1]]) {
        const t = near && !segmentFromLine(near) ? timesIn(near) : [];
        if (t.length) {
          time = t[0].time;
          break;
        }
      }
    }
    // the flight number is on the line, or on the one below or above it
    const flightNo = flightNoOf(line) || (lines[i + 1] && !segmentFromLine(lines[i + 1]) ? flightNoOf(lines[i + 1]) : null) || (lines[i - 1] && !segmentFromLine(lines[i - 1]) ? flightNoOf(lines[i - 1]) : null);
    segments.push({ date, time, from: seg.from, to: seg.to, flightNo });
    if (ds.length) lastDate = ds[0].iso;
  });
  // "Votre voyage Paris → Lyon" is a title, not a leg: when some lines have an hour, only those are legs
  if (segments.some((s) => s.time)) segments = segments.filter((s) => s.time);

  const kind = detectKind(text, segments);
  const steps = [];

  if (kind === "flight" || kind === "train") {
    segments.forEach((s, i) => {
      const prefix = kind === "flight" ? (s.flightNo ? `Vol ${s.flightNo}` : "Vol") : "Train";
      steps.push({ date: s.date, time: s.time, title: `${prefix} ${s.from} → ${s.to}`, type: "transport", transportMode: kind === "flight" ? "avion" : "train", price: i === 0 ? price : null, confirmationCode: code, address: null, nights: null, kind });
    });
    return steps;
  }

  const allDates = [];
  lines.forEach((l, i) => datesIn(l, ctx).forEach((d) => allDates.push({ ...d, line: i })));

  if (kind === "hotel") {
    const name =
      (labelled(lines, "h[ôo]tel|hotel|property|[ée]tablissement|nom de l'h[ôo]tel|hotel name|logement|accommodation") ||
        lines.find((l) => /h[ôo]tel|hotel|resort|ryokan|auberge|hostel|villa|apart|airbnb|gîte|gite/i.test(l) && l.length <= 70 && !/check-?in|check-?out|adresse|address|confirmation/i.test(l)) ||
        firstTitleLine(lines) ||
        "").replace(/^(?:h[ôo]tel|hotel)\s*[:\-]\s*/i, "").trim() || "Hébergement";
    const inLine = lines.findIndex((l) => /check-?in|arriv[ée]e|arrival|du\b|from\b|séjour|stay/i.test(l) && datesIn(l, ctx).length);
    const outLine = lines.findIndex((l, i) => i !== inLine && /check-?out|d[ée]part|departure|au\b|until|jusqu/i.test(l) && datesIn(l, ctx).length);
    const checkIn = inLine >= 0 ? datesIn(lines[inLine], ctx)[0].iso : allDates.length ? allDates[0].iso : null;
    let checkOut = null;
    if (outLine >= 0) checkOut = datesIn(lines[outLine], ctx).slice(-1)[0].iso;
    else if (inLine >= 0 && datesIn(lines[inLine], ctx).length > 1) checkOut = datesIn(lines[inLine], ctx).slice(-1)[0].iso;
    else if (allDates.length > 1) checkOut = allDates[1].iso;
    const nightsText = /(\d{1,2})\s*(?:nuits?|nights?)/i.exec(clean(text));
    let nights = nightsText ? +nightsText[1] : checkIn && checkOut && checkOut > checkIn ? diffDaysISO(checkIn, checkOut) : null;
    const timeLine = lines.find((l) => /check-?in|arriv[ée]e|arrival|à partir de|from/i.test(l) && timesIn(l).length);
    const time = timeLine ? timesIn(timeLine)[0].time : null;
    steps.push({ date: checkIn, time, title: name, type: "hotel", price, confirmationCode: code, address, nights: nights || null, kind });
    return steps;
  }

  const firstDate = allDates.length ? allDates[0] : null;
  const dateLineTimes = firstDate ? timesIn(lines[firstDate.line]) : [];
  const anyTime = lines.map((l) => timesIn(l)).find((t) => t.length);
  const time = dateLineTimes.length ? dateLineTimes[0].time : anyTime ? anyTime[0].time : null;

  if (kind === "restaurant") {
    const raw =
      labelled(lines, "restaurant|[ée]tablissement|nom du restaurant") ||
      lines.find((l) => /restaurant|brasserie|bistro|trattoria|izakaya/i.test(l) && l.length <= 70 && !/r[ée]servation|confirm|adresse|address/i.test(l)) ||
      lines[0];
    const name = raw.trim();
    const title = /restaurant|brasserie|bistro|trattoria|izakaya|chez /i.test(name) ? name : `Restaurant ${name}`;
    steps.push({ date: firstDate ? firstDate.iso : null, time, title, type: "repas", price, confirmationCode: code, address, nights: null, kind });
    return steps;
  }

  const named =
    labelled(lines, "activit[ée]|billet|ticket|visite|excursion|entr[ée]e|[ée]v[ée]nement|event|spectacle|mus[ée]e|museum|tour|exp[ée]rience") ||
    lines.find((l) => /billet|ticket|visite|excursion|mus[ée]e|museum|tour\b|parc|park|spectacle|concert|hike|randonn|croisi|cruise|atelier|workshop/i.test(l) && l.length <= 80 && !/confirm|r[ée]f[ée]rence|adresse|address/i.test(l));
  // nothing says "activity" and there is no date, hour, price or code: this is not a booking, so nothing is invented from it
  if (!named && !firstDate && !time && price == null && !code) return [];
  const raw = named || firstTitleLine(lines);
  steps.push({ date: firstDate ? firstDate.iso : null, time, title: (raw || "Réservation").trim(), type: "activite", price, confirmationCode: code, address, nights: null, kind });
  return steps;
}

// ---------- the AI, when the rules found nothing ----------
export const CONFIRMATION_SYSTEM = `Tu lis le texte d'une confirmation de réservation (vol, train, hôtel, restaurant, billet d'activité) et tu en extrais les étapes de voyage. Tu réponds UNIQUEMENT avec un tableau JSON, sans aucun texte autour. Chaque élément :
{"type":"vol|train|hotel|repas|activite","date":"AAAA-MM-JJ ou null","time":"HH:MM ou null","title":"titre court (ex : Vol AF 276 Paris CDG → Tokyo HND)","address":"adresse ou null","price":nombre en euros ou null,"code":"code de réservation ou null","nights":nombre ou null}
Règles : une entrée par trajet (aller et retour = deux entrées) ; pour un hôtel, la date est celle du check-in, "nights" le nombre de nuits et "price" le prix total du séjour ; le prix total de la réservation va sur la première entrée seulement ; seuls les euros sont lus (sinon null) ; n'invente jamais une date, une heure, un prix ou un code absents du texte.`;

const AI_KIND = { vol: ["transport", "flight"], train: ["transport", "train"], hotel: ["hotel", "hotel"], hôtel: ["hotel", "hotel"], repas: ["repas", "restaurant"], activite: ["activite", "activity"], activité: ["activite", "activity"] };

export function stepsFromAIJson(raw) {
  const text = String(raw || "");
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end < start) return [];
  let list;
  try {
    list = JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const steps = [];
  for (const item of list) {
    if (!item || typeof item !== "object" || !String(item.title || "").trim()) continue;
    const [type, kind] = AI_KIND[String(item.type || "").toLowerCase()] || ["activite", "activity"];
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || "")) && validDate(+item.date.slice(0, 4), +item.date.slice(5, 7), +item.date.slice(8, 10)) ? item.date : null;
    const time = /^\d{1,2}:\d{2}$/.test(String(item.time || "")) ? String(item.time).replace(/^(\d):/, "0$1:") : null;
    const price = Number.isFinite(Number(item.price)) && Number(item.price) > 0 ? Math.round(Number(item.price) * 100) / 100 : null;
    const nights = Number.isInteger(Number(item.nights)) && Number(item.nights) > 0 ? Number(item.nights) : null;
    steps.push({
      date,
      time,
      title: String(item.title).trim(),
      type,
      transportMode: type === "transport" ? (kind === "flight" ? "avion" : "train") : null,
      price,
      confirmationCode: item.code ? String(item.code).trim() : null,
      address: item.address ? String(item.address).trim() : null,
      nights: type === "hotel" ? nights : null,
      kind,
    });
  }
  return steps;
}

export async function parseConfirmationWithAI(text, apiKey) {
  if (!apiKey) {
    const err = new Error("NO_API_KEY");
    err.code = "NO_API_KEY";
    throw err;
  }
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model: AI_MODEL, max_tokens: 1500, system: CONFIRMATION_SYSTEM, messages: [{ role: "user", content: String(text).slice(0, 12000) }] }),
  });
  if (!response.ok) throw new Error("La lecture a échoué (" + response.status + ")");
  const data = await response.json();
  const out = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return stepsFromAIJson(out);
}

// Day of the trip a step belongs to: the index of the day with this date, or -1.
export function dayIndexForDate(trip, iso) {
  if (!iso) return -1;
  return trip.days.findIndex((d, i) => (d.date || (trip.startDate ? addDaysISO(trip.startDate, i) : null)) === iso);
}
