// Reads the text of a booking confirmation (a flight, a train, a hotel, a restaurant, a ticket) pasted from an
// email or a message, or read in a screenshot or a PDF, and proposes the steps to add to a trip: day, time, title,
// price (euros), code, address. Rules only, on the phone, no network: it recognises the usual layouts in French
// and English.
import { addDaysISO, diffDaysISO, isoDate, tripRange } from "./dates";

const pad2 = (n) => String(n).padStart(2, "0");

// ---------- cleaning ----------
function clean(text) {
  return String(text || "")
    .replace(/[   ]/g, " ")
    .replace(/\r/g, "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "") // invisible marks (a mail printed to PDF has some in numbers and around the "|")
    .replace(/[ \t]+/g, " ");
}
function linesOf(text) {
  return clean(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

// The head of a mail printed or screenshotted: "Trip.com <noreply@trip.com> mar. 22 sept. 2026 à 20:55", "À : me@mail.com".
// Its lines hold addresses, and "<...>" looks like an arrow: they are left out, with the date of the mail right under them
// (it is the day the mail was sent, not a day of the trip).
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

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

const MAIL_DATE = new RegExp(`^(?:(?:date|envoy[ée]e?|sent)\\s*:\\s*)?(?:${WEEKDAY}\\.?,?\\s+)?\\d{1,2}\\s+(?:${MONTH_NAMES})\\.?,?\\s+\\d{4}\\s*(?:[àa]|at|,|-)?\\s*\\d{1,2}\\s*[:h]\\s*\\d{2}$`, "i");
function withoutMailHead(lines) {
  const out = [];
  let under = false;
  for (const l of lines) {
    if (EMAIL.test(l)) {
      under = true;
      continue;
    }
    if (under && MAIL_DATE.test(l)) {
      under = false;
      continue;
    }
    under = false;
    out.push(l);
  }
  return out;
}

// A date that is when the booking was made or the email sent, not a day of the trip.
const NOISE_BEFORE = /(r[ée]serv[ée]e?\s+le|date\s+(?:pr[ée]vue\s+)?(?:de\s+|d['’]|du\s+)(?:r[ée]servation|commande|paiement|[ée]mission|achat)|[ée]mis\s+le|envoy[ée]\s+le|booked\s+on|booking\s+date|order\s+date|date\s+of\s+(?:booking|issue|purchase)|issued\s+on|sent\s+on|pay[ée]e?\s+le|annul\w*\s+(?:gratuite(?:ment)?\s+)?(?:avant|jusqu\S*)(?:\s+le)?|free\s+cancell?ation\s+until|cancel\w*\s+(?:before|until|avant|jusqu))\s*[:\-]?\s*$/i;

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
const EURO_AFTER = new RegExp(`(?:^|[^\\d])${AMOUNT}\\s*(?:€|eur\\b|euros?\\b)`, "gi"); // not inside a number: "Mastercard 0771 197,60 €" is 197,60, not 771 197,60
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
const CODE_LABEL = /(?:r[ée]f[ée]rence|confirmation|r[ée]servation|reservation|booking|dossier|pnr|locator|code|n°|num[ée]ro|number)(?:\s+[a-zà-ÿ'’]{2,15}){0,2}(?:\s*\([^)\n]{2,15}\))?\s*[:#°\-–.]*\s*([a-z0-9][a-z0-9-]{3,16}[a-z0-9])(?![a-z0-9à-ÿ-])/gi;
const NOT_CODES = /^(RESERVATION|CONFIRMATION|REFERENCE|BOOKING|NUMBER|NUMERO|PASSENGER|PASSAGER|DOSSIER|ADRESSE|ADDRESS|CONFIRMED)$/;
const looksLikeCode = (c) => c === c.toUpperCase() && !NOT_CODES.test(c) && (/\d/.test(c) || c.replace(/-/g, "").length === 6);
// "LEW84T, NJTBXH, CJFTD7": a booking split in several has one code each, all of them are kept
const MORE_CODES = /^(?:\s*[,;/]\s*|\s+(?:et|and)\s+)([A-Z0-9][A-Z0-9-]{3,16}[A-Z0-9])(?![A-Za-z0-9à-ÿ-])/;
export function codeIn(text) {
  const flat = clean(text);
  CODE_LABEL.lastIndex = 0;
  let best = null;
  let m;
  while ((m = CODE_LABEL.exec(flat))) {
    CODE_LABEL.lastIndex = m.index + 1; // a label can start inside the words of the one before ("Numéro de dossier passager (PNR)")
    const code = m[1];
    if (!looksLikeCode(code)) continue;
    const label = m[0].slice(0, m[0].length - code.length);
    // the airline's own code (PNR) first, a ticket number last: it does not open the booking
    const rank = /pnr|locator/i.test(label) ? 0 : /billet|ticket/i.test(label) ? 2 : 1;
    if (best && best.rank <= rank) continue;
    const codes = [code];
    let rest = flat.slice(m.index + m[0].length);
    let more;
    while (rank < 2 && codes.length < 4 && (more = MORE_CODES.exec(rest)) && looksLikeCode(more[1])) {
      codes.push(more[1]);
      rest = rest.slice(more[0].length);
    }
    best = { rank, code: codes.join(", ") };
    if (rank === 0) break;
  }
  return best ? best.code : null;
}

// ---------- kinds ----------
const ARROW = "(?:→|➔|➜|->|=>|—>|–>|>|\\bto\\b|\\bvers\\b)";
const IATA_PAIR = new RegExp(`\\b([A-Z]{3})\\b[^A-Za-z\\n]{0,24}?${ARROW}[^A-Za-z\\n]{0,24}?\\b([A-Z]{3})\\b`);
const FLIGHT_WORDS = /\b(vol|flight|boarding|embarquement|airlines?|airways|ryanair|easyjet|transavia|vueling|a[ée]roport|airport|air france|klm|lufthansa|iberia|emirates|qatar|volotea|wizz)\b/i;
const TRAIN_WORDS = /\b(train|tgv|sncf|ouigo|eurostar|trainline|inoui|thalys|shinkansen|ter|intercit[ée]s|renfe|trenitalia|italo|db bahn|gare)\b/i;
const BUS_WORDS = /\b(bus|autocars?|flixbus|blablabus|ouibus|eurolines|isilines|greyhound|megabus|alsa|gare routi[èe]re|bus station|coach)\b/i;
const FERRY_WORDS = /\b(ferry|ferries|travers[ée]e|bateau|navire|corsica ferries|brittany ferries|dfds|moby|grimaldi|balearia|la m[ée]ridionale|boat|cabine)\b/i;
const HOTEL_WORDS = /(h[ôo]tel|hotel|h[ée]bergement|check-?in|check-?out|\bnuit|\bnight|chambre|\broom\b|resort|ryokan|auberge|hostel|airbnb|booking\.com|logement|appartement|gîte|gite|villa)/i;
const RESTAURANT_WORDS = /(restaurant|thefork|lafourchette|opentable|\bcouverts?\b|brasserie|bistro|trattoria|izakaya|\btable pour|\btable for|réservation de table)/i;

// A line that goes from a place to another: "Paris (CDG) 10:05 → Tokyo (HND) 06:30", "Gare de Lyon 08:19 → Lyon Part-Dieu 10:21".
const SEGMENT_SPLIT = new RegExp(`\\s*${ARROW}\\s*`, "i");
function segmentFromLine(line) {
  if (!SEGMENT_SPLIT.test(line)) return null;
  const parts = line.split(SEGMENT_SPLIT);
  if (parts.length < 2) return null;
  const place = (s) =>
    s
      .replace(TIME_RE, " ")
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
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

const FLIGHT_NO = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{2,4})\b/g;
const NOT_AIRLINES = /^(TO|DE|LE|LA|AU|EN|ET|OU|NO|TVA|PM|AM)$/;
const AIRCRAFT = /\b(?:airbus|boeing|embraer|bombardier|atr|cessna)\s+[A-Za-z]{0,3}\s?-?\d[\w-]*/gi; // "Airbus A320-212", "Boeing 737-800"
const AIRCRAFT_CODE = /^(?:A3\d{2}|A22\d|B7\d{2}|E1\d{2}|E19\d|AT[R7]\d{2}|CRJ\d|DH8\d)$/;
function flightNoOf(line) {
  if (!line) return null;
  const plain = line.replace(/\b\d{1,2}\s*[:h]\s*\d{2}\b/g, " ").replace(AIRCRAFT, " ");
  for (const m of plain.matchAll(FLIGHT_NO)) {
    if (!/[A-Z]/.test(m[1])) continue;
    const spaced = /\s/.test(m[0]);
    if (NOT_AIRLINES.test(m[1]) && (spaced || m[1] !== "TO")) continue; // "TO 10" is not a flight, "TO8602" is
    if (!spaced && AIRCRAFT_CODE.test(m[0])) continue;
    return `${m[1]} ${m[2]}`;
  }
  return null;
}

const countOf = (re, text) => (text.match(new RegExp(re.source, "gi")) || []).length;

function detectKind(text, segments) {
  const flat = clean(text);
  if (segments.length) {
    if (IATA_PAIR.test(flat)) return "flight";
    // the kind that is named most often: a bus company's mail may well speak of the "aéroport" once
    const scores = [["flight", countOf(FLIGHT_WORDS, flat)], ["train", countOf(TRAIN_WORDS, flat)], ["bus", countOf(BUS_WORDS, flat)], ["ferry", countOf(FERRY_WORDS, flat)]];
    const best = scores.reduce((a, b) => (b[1] > a[1] ? b : a));
    return best[1] > 0 ? best[0] : "train";
  }
  if (HOTEL_WORDS.test(flat) && !RESTAURANT_WORDS.test(flat)) return "hotel";
  if (RESTAURANT_WORDS.test(flat)) return "restaurant";
  if (HOTEL_WORDS.test(flat)) return "hotel";
  return "activity";
}

// What a transport kind is called on a step: the mode of transport and the word in front of the title.
const TRANSPORT_OF_KIND = { flight: { mode: "avion", word: "Vol" }, train: { mode: "train", word: "Train" }, bus: { mode: "bus", word: "Bus" }, ferry: { mode: "bateau", word: "Ferry" } };

const LABELLED = (label) => new RegExp(`^(?:${label})\\s*[:\\-–]\\s*(.*)$`, "i");

// `loose`: the colon may be missing ("Point de rendez-vous Gare d'Inari"), as in the text of a PDF table.
function labelled(lines, label, { loose = false } = {}) {
  const re = loose ? new RegExp(`^(?:${label})(?:\\s*[:\\-–]\\s*|\\s+)(.*)$`, "i") : LABELLED(label);
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

const STREET = /\b(rue|avenue|av\.|boulevard|bd|chemin|place (?:de|du|des|d['’])|all[ée]e|impasse|quai|route|street|st\.|road|rd\.|ave|lane|via|calle|strasse|straße|platz)\b|\d+-\d+-\d+/i;
// A line that reads as a postal address: digits, and several parts or a street word ("12 rue des Martyrs, 75009 Paris").
function looksLikeAddress(l) {
  if (l.length < 10 || l.length > 120 || !/\d/.test(l) || /€|\beur\b/i.test(l) || /\d{1,2}\s*[:h]\s*\d{2}/i.test(l) || /^[^:]{1,25}:\s/.test(l)) return false;
  return l.split(",").length >= 3 || STREET.test(l);
}

// A rental's page (Airbnb): its title, often on two lines, sits right above "Logement entier, hôte : Benja Olivier".
const HOST_LINE = /^(?:logement entier|h[ée]bergement entier|chambre\s+(?:priv[ée]e|partag[ée]e|d['’]h[ôo]tel)|entire\s+\w+(?:\s+\w+)?|private room|shared room)\b.*\b(?:h[ôo]te|host)\b/i;
const NOT_A_TITLE = /^(?:tout est|everything is|destination|votre voyage|your trip|bonjour|hello|confirmation|r[ée]servation|booking|voyage)\b/i;
function listingTitle(lines) {
  const host = lines.findIndex((l) => HOST_LINE.test(l));
  if (host < 1) return null;
  const parts = [];
  for (let k = host - 1; k >= 0 && parts.length < 3; k--) {
    const l = lines[k];
    if (l.length > 80 || /[,:]$/.test(l) || NOT_A_TITLE.test(l)) break;
    parts.unshift(l);
  }
  return parts.length ? parts.join(" ") : null;
}

// The address after its label, or else the first line that reads as one (a screenshot often has no label).
function addressIn(lines) {
  return (
    labelled(lines, "adresse|address|adresse de l'établissement|property address|lieu|location|lieu de rendez-vous|meeting point") ||
    labelled(lines, "adresse de l'établissement|adresse|address|property address|point de rendez-vous|lieu de rendez-vous|meeting point", { loose: true }) ||
    lines.find(looksLikeAddress) ||
    null
  );
}

// ---------- screenshots and PDFs ----------
// A screenshot or a PDF flattens a page into lines, and a table or a card comes out differently from the text of a mail.
// These steps put the usual cases back into the shapes the rest reads: "Label : value" lines, and "08:19 Paris → 10:21 Lyon"
// legs. Text that is already in those shapes goes through unchanged.

const LABEL_KINDS = [
  ["date", /^(?:date d['’](?:arriv[ée]e|d[ée]part)|date de (?:d[ée]part|retour|check-?in|check-?out)|arriv[ée]e|d[ée]part|check-?in|check-?out|arrival|departure|date)$/i],
  ["code", /^(?:num[ée]ro de (?:confirmation|r[ée]servation|commande|dossier|r[ée]f[ée]rence)|n° de (?:r[ée]servation|commande|dossier)|r[ée]f[ée]rence(?: de r[ée]servation)?|code de (?:r[ée]servation|confirmation)|dossier(?: voyage)?|confirmation(?: (?:code|number))?|booking (?:number|reference|ref|code)|pnr|locator)$/i],
  ["price", /^(?:prix(?: total)?|total(?: (?:pay[ée]|[àa] payer|ttc|price))?|montant(?: total)?|amount|price|total price|grand total)$/i],
  ["nights", /^(?:dur[ée]e(?: du s[ée]jour)?|nuits?|nights?|length of stay|s[ée]jour)$/i],
  ["address", /^(?:adresse|address|lieu|location)$/i],
];
const labelKindOf = (line) => {
  const t = line.replace(/\s*[:：]\s*$/, "");
  if (t.length > 40) return null;
  const hit = LABEL_KINDS.find(([, re]) => re.test(t));
  return hit ? hit[0] : null;
};
const FITS = {
  date: (l, ctx) => datesIn(l, ctx).length > 0,
  code: (l) => /^[A-Z0-9]{5,12}$/.test(l) && (/\d/.test(l) || l.length === 6),
  price: (l) => priceIn(l) != null,
  nights: (l) => /\b\d{1,2}\s*(?:nuits?|nights?)\b/i.test(l),
  address: (l) => looksLikeAddress(l),
};
const TIME_NOTE = /^(?:(?:[àa] partir de|d[èe]s|jusqu['’]?[àa]|avant|apr[èe]s|from|until|before|after)\s*)?\d{1,2}\s*[:h]\s*\d{2}(?:\s*(?:am|pm))?$/i;

// The stay as a table of two columns, one line per row ("Arrivée Départ", "lun. 4 janv. 2027 ven. 8 janv. 2027", "Après 14:00
// Avant 10:00"): becomes "Arrivée : 2027-01-04 (à partir de 14:00)" and "Départ : 2027-01-08 (jusqu'à 10:00)".
const IN_OUT_LABELS = /^(arriv[ée]e|check-?in|arrival)\s+(d[ée]part|check-?out|departure)$/i;
const IN_OUT_TIMES = /^(?:apr[èe]s|[àa] partir de|d[èe]s|from|after)\s+(\d{1,2}\s*[:h]\s*\d{2})\s+(?:avant|jusqu['’]?[àa]|before|until)\s+(\d{1,2}\s*[:h]\s*\d{2})$/i;
function stayColumns(lines, ctx) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const labels = IN_OUT_LABELS.exec(lines[i]);
    const days = labels && lines[i + 1] ? datesIn(lines[i + 1], ctx) : [];
    if (!labels || days.length !== 2) {
      out.push(lines[i]);
      continue;
    }
    const times = lines[i + 2] ? IN_OUT_TIMES.exec(lines[i + 2]) : null;
    out.push(`${labels[1]} : ${days[0].iso}${times ? ` (à partir de ${times[1]})` : ""}`);
    out.push(`${labels[2]} : ${days[1].iso}${times ? ` (jusqu'à ${times[2]})` : ""}`);
    i += times ? 2 : 1;
  }
  return out;
}

// Two columns read one after the other ("Arrivée", "Départ", "Prix total", then "17 nov. 2026", "29 nov. 2026", "1 240 €"):
// each label that has no value takes the next line that fits it (a day for a day label, an amount for a price...).
function pairLabels(lines, ctx) {
  const used = new Set();
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const kind = labelKindOf(lines[i]);
    if (!kind) {
      out.push(lines[i]);
      continue;
    }
    let found = -1;
    for (let j = i + 1; j < Math.min(lines.length, i + 10); j++) {
      if (used.has(j) || labelKindOf(lines[j])) continue;
      if (FITS[kind](lines[j], ctx)) {
        found = j;
        break;
      }
    }
    if (found < 0) {
      out.push(lines[i]);
      continue;
    }
    used.add(found);
    let value = lines[found];
    // "à partir de 15:00" under the day
    if (kind === "date" && lines[found + 1] && !used.has(found + 1) && TIME_NOTE.test(lines[found + 1])) {
      value += " " + lines[found + 1];
      used.add(found + 1);
    }
    out.push(`${lines[i].replace(/\s*[:：]\s*$/, "")} : ${value}`);
  }
  return out;
}

const DURATION_LINE = /^(?:\d{1,2}\s*h(?:\s*\d{1,2})?\s*(?:min)?|\d{1,3}\s*min)\b/i;
const TIME_PLACE_RE = /^(?:(?:d[ée]part|arriv[ée]e|departure|arrival)\s*:?\s*)?(\d{1,2}\s*[:h]\s*\d{2})\s+([A-Za-zÀ-ÿ].{2,46})$/i;
// "08:19 Paris Gare de Lyon" ("3h 40 min - Direct" is a duration, not an hour and a place)
const TIME_PLACE = {
  exec: (l) => {
    const m = TIME_PLACE_RE.exec(l);
    return m && !/^(?:min|mn|minutes?)\b/i.test(m[2]) ? m : null;
  },
  test: (l) => !!TIME_PLACE.exec(l),
};
const STATION_WORDS = /\b(gare|station|terminal|a[ée]roport|airport|port|bercy|centrale|central|hbf|termini)\b/i;
const LEG_HEADER = /^(?:aller|retour|outbound|return|trajet|segment)\b/i;

// A leg written as a card: "08:19 Paris Gare de Lyon", a line or two about the train, "10:21 Lyon Part-Dieu" becomes
// "08:19 Paris Gare de Lyon → 10:21 Lyon Part-Dieu". Only when something says it is a trip (a transport word, a duration,
// "Aller", a station), so a day's programme ("09:00 Visite", "12:00 Déjeuner") is left alone.
function stackLegs(lines) {
  const flat = lines.join("\n");
  const anyWord = FLIGHT_WORDS.test(flat) || TRAIN_WORDS.test(flat) || BUS_WORDS.test(flat) || FERRY_WORDS.test(flat);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const a = TIME_PLACE.exec(lines[i]);
    let j = -1;
    if (a && !segmentFromLine(lines[i])) {
      for (let k = i + 1; k <= i + 3 && k < lines.length; k++) {
        if (TIME_PLACE.test(lines[k])) {
          j = k;
          break;
        }
      }
    }
    if (j > 0) {
      const between = lines.slice(i + 1, j);
      const b = TIME_PLACE.exec(lines[j]);
      const cue = anyWord || between.some((l) => DURATION_LINE.test(l)) || LEG_HEADER.test(lines[i - 1] || "") || LEG_HEADER.test(lines[i - 2] || "") || STATION_WORDS.test(a[2]) || STATION_WORDS.test(b[2]);
      if (cue) {
        out.push(`${a[1]} ${a[2]} → ${b[1]} ${b[2]}`);
        out.push(...between);
        i = j + 1;
        continue;
      }
    }
    out.push(lines[i]);
    i++;
  }
  return out;
}

const AIRPORT_ONLY = /^[A-Z]{3}$/;
const NOT_AIRPORTS = /^(TVA|PNR|VOL|AIR|EUR|USD|GBP|TTC|HTC|PDF|SMS|BAG|WEB|FAQ|CGV|TER|TGV|NEW|FOR|THE|AND|NON|OUI|MME|MLE|MRS|MR|MS)$/;

// A flight card: two airport codes ("CDG", "LIS", with a plane or nothing between them, on one line or on two), the cities,
// the two hours, the flight number: becomes "CDG 08:15 → LIS 10:05 AF1124". Only when the text speaks of a flight.
function flightCards(lines) {
  const flat = lines.join("\n");
  if (!FLIGHT_WORDS.test(flat) && !lines.some((l) => flightNoOf(l))) return lines;
  const codesOf = (l) => {
    const pair = /^\W*([A-Z]{3})\W{0,10}([A-Z]{3})\W*$/.exec(l);
    if (pair) return [pair[1], pair[2]];
    return AIRPORT_ONLY.test(l) ? [l] : null;
  };
  const ok = (c) => !NOT_AIRPORTS.test(c);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const first = codesOf(lines[i]);
    if (!first || !first.every(ok) || segmentFromLine(lines[i])) {
      out.push(lines[i]);
      i++;
      continue;
    }
    let from = first[0];
    let to = first[1] || null;
    let last = i;
    if (!to) {
      for (let k = i + 1; k <= i + 6 && k < lines.length; k++) {
        const c = codesOf(lines[k]);
        if (c && c.length === 1 && ok(c[0])) {
          to = c[0];
          last = k;
          break;
        }
      }
    }
    if (!to) {
      out.push(lines[i]);
      i++;
      continue;
    }
    // what follows the codes: the hours (two, in the order of the page) and the flight number
    const tail = lines.slice(i + 1, last + 7).filter((l, k) => i + 1 + k !== last);
    const hours = [];
    for (const l of tail) {
      if (codesOf(l) && codesOf(l).every(ok)) break;
      for (const t of timesIn(l)) hours.push(t.time);
      if (hours.length >= 2) break;
    }
    const flightNo = tail.map((l) => flightNoOf(l)).find(Boolean);
    out.push(`${from}${hours[0] ? " " + hours[0] : ""} → ${to}${hours[1] ? " " + hours[1] : ""}`);
    if (flightNo) out.push(`Vol ${flightNo}`);
    // the lines between the two codes stay (the cities, the hours): they are read as plain lines
    for (let k = i + 1; k <= last; k++) if (k !== last) out.push(lines[k]);
    i = last + 1;
  }
  return out;
}

// A flight written as two lines, each an hour, an airport code and the airport's name ("14:45 ORY Aéroport de Paris-Orly T3",
// a few lines about the flight, "17:40 DJE Aéroport international de Djerba-Zarzis"): becomes "ORY 14:45 → DJE 17:40" and
// "Vol TO8602". The lines go two by two (departure, arrival), so a stopover or a return flight right after is not mixed up.
const AIRPORT_NAME = /\b(a[ée]roport|airport|aeropuerto|aeroporto|flughafen|international|intl)\b/i;
const TIMED_AIRPORT = /^(\d{1,2}\s*[:h]\s*\d{2})\s+([A-Z]{3})\b\s*([A-Za-zÀ-ÿ].*)?$/;
function timedAirports(lines) {
  const flat = lines.join("\n");
  if (!FLIGHT_WORDS.test(flat)) return lines;
  const timed = (l) => {
    const m = TIMED_AIRPORT.exec(l);
    return m && !NOT_AIRPORTS.test(m[2]) ? m : null;
  };
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const a = timed(lines[i]);
    let j = -1;
    if (a) {
      for (let k = i + 1; k <= i + 10 && k < lines.length; k++) {
        if (timed(lines[k])) {
          j = k;
          break;
        }
      }
    }
    const b = j > 0 ? timed(lines[j]) : null;
    const between = b ? lines.slice(i + 1, j) : [];
    const flightNo = between.map((l) => flightNoOf(l)).find(Boolean);
    // only when something says these are airports: a name that says so, or a flight number between the two lines
    // ("09:00 RER Visite" then "12:00 CCA Déjeuner" is a day's programme)
    if (!b || b[2] === a[2] || !(flightNo || AIRPORT_NAME.test(a[3] || "") || AIRPORT_NAME.test(b[3] || ""))) {
      out.push(lines[i]);
      i++;
      continue;
    }
    out.push(`${a[2]} ${a[1]} → ${b[2]} ${b[1]}`);
    if (flightNo) out.push(`Vol ${flightNo.replace(/\s/g, "")}`);
    out.push(...between);
    i = j + 1;
  }
  return out;
}

// A row of a flight table, the airports in brackets ("AF 1124  Paris Charles de Gaulle (CDG) Terminal 2E  Lisbonne (LIS)", the days
// and hours on the lines under it, the departure and the arrival side by side): becomes "CDG 2026-11-14 08:15 → LIS" + "Vol AF 1124".
// The departure is the earliest day and hour written on the row and the two lines under it.
function airportRows(lines, ctx) {
  const codesOf = (l) => [...l.matchAll(/\(([A-Z]{3})\)/g)].map((m) => m[1]).filter((c) => !NOT_AIRPORTS.test(c));
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const codes = codesOf(lines[i]);
    if (codes.length < 2 || segmentFromLine(lines[i])) {
      out.push(lines[i]);
      continue;
    }
    const whens = [];
    for (let k = i; k < Math.min(lines.length, i + 3); k++) {
      if (k > i && codesOf(lines[k]).length >= 2) break;
      const ds = datesIn(lines[k], ctx);
      const ts = timesIn(lines[k]);
      if (ds.length && ts.length) whens.push({ iso: ds[0].iso, time: (ts.find((t) => t.index >= ds[0].index) || ts[0]).time });
    }
    whens.sort((a, b) => (a.iso + a.time < b.iso + b.time ? -1 : 1));
    const w = whens[0];
    out.push(`${codes[0]}${w ? ` ${w.iso} ${w.time}` : ""} → ${codes[1]}`);
    const flightNo = flightNoOf(lines[i]);
    if (flightNo) out.push(`Vol ${flightNo}`);
  }
  return out;
}

export function normalizeLayout(lines, ctx) {
  return flightCards(stackLegs(timedAirports(airportRows(pairLabels(stayColumns(lines, ctx), ctx), ctx))));
}

// ---------- the steps ----------
// Returns [{ date, time, title, type, price, confirmationCode, address, nights, kind }] — date is an ISO day or null when
// the text gives none.
export function parseConfirmation(rawText, { trip = null, today = isoDate(new Date()) } = {}) {
  const range = trip ? tripRange(trip) : null;
  const ctx = { range: range && range.start ? range : null, today };
  const lines = normalizeLayout(withoutMailHead(linesOf(rawText)), ctx);
  if (!lines.length) return [];
  const text = lines.join("\n");
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
    let date = ds.length ? ds[0].iso : lastDate;
    // no day above the line yet: the day written just under it ("Marseille → Bastia", then "dimanche 9 mai à 19:30")
    if (!date) {
      for (const near of [lines[i + 1], lines[i + 2]]) {
        const nd = near && !segmentFromLine(near) ? datesIn(near, ctx) : [];
        if (nd.length) {
          date = nd[0].iso;
          break;
        }
      }
    }
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

  if (TRANSPORT_OF_KIND[kind]) {
    const { mode, word } = TRANSPORT_OF_KIND[kind];
    segments.forEach((s, i) => {
      const prefix = kind === "flight" && s.flightNo ? `${word} ${s.flightNo}` : word;
      steps.push({ date: s.date, time: s.time, title: `${prefix} ${s.from} → ${s.to}`, type: "transport", transportMode: mode, price: i === 0 ? price : null, confirmationCode: code, address: null, nights: null, kind });
    });
    return steps;
  }

  const allDates = [];
  lines.forEach((l, i) => datesIn(l, ctx).forEach((d) => allDates.push({ ...d, line: i })));

  if (kind === "hotel") {
    const name =
      (listingTitle(lines) ||
        labelled(lines, "h[ôo]tel|hotel|property|[ée]tablissement|nom de l'h[ôo]tel|hotel name|logement|accommodation") ||
        lines.find((l) => /h[ôo]tel|hotel|resort|ryokan|auberge|hostel|villa|apart|airbnb|gîte|gite/i.test(l) && l.length <= 70 && !/check-?in|check-?out|adresse|address|confirmation/i.test(l)) ||
        firstTitleLine(lines) ||
        "").replace(/^(?:h[ôo]tel|hotel)\s*[:\-]\s*/i, "").trim() || "Hébergement";
    const hasDate = (l) => datesIn(l, ctx).length > 0;
    // the lines that name the arrival or the departure come first: "Confirmation de votre réservation du 4–8 janv." is a title
    let inLine = lines.findIndex((l) => /check-?in|arriv[ée]e|arrival/i.test(l) && hasDate(l));
    if (inLine < 0) inLine = lines.findIndex((l) => /\bdu\b|\bfrom\b|séjour|stay/i.test(l) && hasDate(l));
    let outLine = lines.findIndex((l, i) => i !== inLine && /check-?out|d[ée]part|departure/i.test(l) && hasDate(l));
    if (outLine < 0) outLine = lines.findIndex((l, i) => i !== inLine && /\bau\b|until|jusqu/i.test(l) && hasDate(l));
    const checkIn = inLine >= 0 ? datesIn(lines[inLine], ctx)[0].iso : allDates.length ? allDates[0].iso : null;
    let checkOut = null;
    if (outLine >= 0) checkOut = datesIn(lines[outLine], ctx).slice(-1)[0].iso;
    else if (inLine >= 0 && datesIn(lines[inLine], ctx).length > 1) checkOut = datesIn(lines[inLine], ctx).slice(-1)[0].iso;
    else if (allDates.length > 1) checkOut = allDates[1].iso;
    const nightsText = /(\d{1,2})\s*(?:nuits?|nights?)/i.exec(clean(text));
    let nights = nightsText ? +nightsText[1] : checkIn && checkOut && checkOut > checkIn ? diffDaysISO(checkIn, checkOut) : null;
    // the arrival hour: on the arrival line, else alone on its line ("Après 14:00", when the columns were read one after the other)
    const timeLine = lines.find((l) => /check-?in|arriv[ée]e|arrival|à partir de|from/i.test(l) && timesIn(l).length) || lines.find((l) => /^(?:apr[èe]s|d[èe]s|after)\s+\d{1,2}\s*[:h]\s*\d{2}$/i.test(l));
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

// ---------- several documents ----------
// The pasted text, then the text read in each file: every one is read on its own (a screenshot and a PDF are usually two
// different bookings, and the code, the price and the kind of booking belong to one document), and the steps are put one
// after the other. Returns the steps.
export function readConfirmations(texts, { trip = null, today = isoDate(new Date()) } = {}) {
  return (texts || []).flatMap((t) => parseConfirmation(t, { trip, today }));
}

// The prices read are in euros; a trip counts in its own currency. The steps with their price multiplied by `rate`
// (what 1 euro is worth there), or without price when there is no rate (a wrong currency is worse than no price).
export function inTripCurrency(steps, rate) {
  return (steps || []).map((s) => {
    if (s.price == null) return s;
    return { ...s, price: rate > 0 ? Math.round(s.price * rate * 100) / 100 : null };
  });
}

// Day of the trip a step belongs to: the index of the day with this date, or -1.
export function dayIndexForDate(trip, iso) {
  if (!iso) return -1;
  return trip.days.findIndex((d, i) => (d.date || (trip.startDate ? addDaysISO(trip.startDate, i) : null)) === iso);
}
