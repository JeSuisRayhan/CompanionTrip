// What a booking says about the day it lands on.
//   - a transport (flight, train, bus, boat) makes its day a travel day ("Jour de vol ou de train"), with the route
//     read from the step's title;
//   - a theme-park ticket makes its day a park day, with the park already chosen when the ticket names it.
// A day that already has a special type keeps it: nothing the person set is replaced.
import { cleanPark } from "./parkDay";

// ---------- the route of a transport ----------

const MODE_WORD = /^(?:vol|train|bus|car|ferry|bateau|travers[ée]e|navette)\s+/i;
// "TO 8602", "AF274", "U2 8123"
const FLIGHT_NUMBER = /^([A-Z][A-Z0-9]|[A-Z0-9][A-Z])\s?(\d{1,4})\s+/;

// "Paris (ORY)" -> "ORY"; "CDG" -> "CDG"; "Lyon Part-Dieu" -> "Lyon Part-Dieu" (16 letters at most: the field of the day's route)
function placeOf(text) {
  const s = String(text || "").trim();
  const code = /\(([A-Z]{3})\)/.exec(s);
  if (code) return code[1];
  return s.slice(0, 16).trim();
}

// "Vol TO 8602 Paris (ORY) → Djerba (DJE)" -> { origin: "ORY", destination: "DJE", flightNumber: "TO 8602", seat: "" }
// "Train Paris → Lyon" -> { origin: "Paris", destination: "Lyon", flightNumber: "", seat: "" }. null when the title has no route.
export function routeOfTransport(step) {
  const title = String((step && step.title) || "");
  const m = /^(.*?)\s*→\s*(.+)$/.exec(title);
  if (!m) return null;
  let left = m[1].trim();
  const isFlight = /^vol\s/i.test(left);
  left = left.replace(MODE_WORD, "");
  let flightNumber = "";
  if (isFlight) {
    const n = FLIGHT_NUMBER.exec(left + " ");
    if (n) {
      flightNumber = `${n[1]} ${n[2]}`;
      left = left.slice(n[0].length - 1).trim();
    }
  }
  const origin = placeOf(left);
  const destination = placeOf(m[2]);
  if (!origin && !destination) return null;
  return { origin, destination, flightNumber, seat: "" };
}

// ---------- theme-park tickets ----------

// Words that say "theme park" by themselves, when the list of parks is not at hand.
const PARK_WORDS = /parc d['’\s]?attractions?|theme ?park|amusement park|disney|ast[ée]rix|walibi|europa[- ]?park|efteling|futuroscope|puy du fou|legoland|phantasialand|port ?aventura|gardaland|universal studios|six flags|alton towers|toverland|plopsaland/i;

// "Astérix" -> "asterix" (this file is read by trips.js: it keeps clear of planner.js, which reads trips.js)
const plain = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const FILLER = new Set(["park", "parc", "parque", "parco", "de", "du", "des", "la", "le", "les", "the", "d", "l"]);

// The words that tell a park by its name: "Disneyland Park Paris" -> ["disneyland", "paris"]
function nameWords(name) {
  return plain(name)
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !FILLER.has(w));
}

// The park of the list a ticket names, or null: every word of the park's name must be in the title, the one that says
// the most wins, and a name that is only part of other parks' names ("Disneyland" alone) does not choose between them.
// parks: [{ qtId, name, country, lat, lng, timezone }] (see queueTimes.parseParks)
export function matchPark(title, parks) {
  if (!Array.isArray(parks) || !parks.length) return null;
  const wanted = new Set(nameWords(title));
  const hits = parks.map((p) => ({ p, words: nameWords(p.name) })).filter((x) => x.words.length && x.words.join("").length >= 5 && x.words.every((w) => wanted.has(w)));
  if (!hits.length) return null;
  const most = Math.max(...hits.map((x) => x.words.length));
  const best = hits.filter((x) => x.words.length === most);
  if (best.length !== 1) return null;
  const { p, words } = best[0];
  const shared = parks.some((other) => other !== p && words.every((w) => nameWords(other.name).includes(w)));
  return shared ? null : p;
}

// A step that is a ticket for a theme park: not a transport, a stay or a meal, and it names a park (or says so).
export function isThemeParkTicket(step, parks) {
  if (!step || step.type !== "activite") return false;
  const title = String(step.title || "");
  return PARK_WORDS.test(title) || !!matchPark(title, parks);
}

// ---------- the days ----------

// `days`: the days after the steps were put on them. `touched`: [{ dayId, item }], the day of each step read.
// Returns { days, park, travel, parks }: the days, the park to give a park trip that has none (or null), and how many
// days became travel days / park days.
export function withSpecialDays(trip, days, touched, parks) {
  const result = { days, park: null, travel: 0, parks: 0 };
  if (!touched.length) return result;
  const parkTrip = trip.tripType === "park";
  const byDay = new Map();
  for (const t of touched) byDay.set(t.dayId, [...(byDay.get(t.dayId) || []), t.item]);

  result.days = days.map((day) => {
    const items = byDay.get(day.id);
    if (!items) return day;
    const ticket = items.find((i) => isThemeParkTicket(i, parks));
    const ride = items.find((i) => i.type === "transport");

    if (ticket) {
      const park = matchPark(ticket.title, parks);
      if (parkTrip) {
        if (park && !trip.park && !result.park) result.park = park;
        return day;
      }
      if (!day.dayType || day.dayType === "park") {
        const clean = park && !day.park ? cleanPark(park) : null;
        if (day.dayType !== "park" || clean) result.parks++;
        return { ...day, dayType: "park", ...(clean ? { park: clean } : {}) };
      }
      return day;
    }

    if (ride && !parkTrip) {
      const route = routeOfTransport(ride);
      if (!day.dayType) {
        result.travel++;
        return { ...day, dayType: "flight", flightInfo: day.flightInfo || route || null };
      }
      if (day.dayType === "flight" && !day.flightInfo && route) return { ...day, flightInfo: route };
    }
    return day;
  });
  return result;
}
