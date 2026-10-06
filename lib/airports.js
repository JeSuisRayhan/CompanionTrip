// The airport a place names, for the address and the position of the steps of a flight. The table (airportData.js) holds
// the airports with scheduled flights; nothing here goes on the network.
import { AIRPORT_DATA } from "./airportData";

const plain = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

// The words that say "airport" or only link the words of its name: "Aéroport de Paris-Orly T3" and "Paris Orly" are one airport.
const NOISE = new Set(["aeroport", "airport", "aeropuerto", "aeroporto", "flughafen", "international", "internacional", "internazionale", "intl", "de", "du", "des", "di", "da", "la", "le", "les", "l", "d", "the"]);

function words(text) {
  return plain(text)
    .replace(/\bterminal\s*\w{0,2}\b/g, " ")
    .replace(/\bt\d[a-z]?\b/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !NOISE.has(w));
}

let table = null; // code -> { code, name, city, aero, lat, lng }
let names = null; // [{ key, code }] the airports by the words of their name

function load() {
  if (table) return;
  table = new Map();
  names = [];
  for (const line of AIRPORT_DATA.split("\n")) {
    const [code, name, city, aero, lat, lng] = line.split("|");
    if (!code || !name) continue;
    table.set(code, { code, name, city: city || "", aero: aero === "1", lat: Number(lat), lng: Number(lng) });
    const key = words(name).join(" ");
    if (key) names.push({ key, code });
  }
}

export function airportByCode(code) {
  load();
  const a = table.get(String(code || "").toUpperCase());
  return a ? withAddress(a) : null;
}

// "Aéroport Paris-Orly (ORY)", "Aéroport Djerba Zarzis (DJE), Mellita": what a person or a driver can read, with the town
// when the name does not say it.
function withAddress(a) {
  const base = a.aero ? `Aéroport ${a.name}` : a.name;
  const town = a.city && !plain(a.name).includes(plain(a.city)) ? `, ${a.city}` : "";
  return { code: a.code, name: a.name, city: a.city, lat: a.lat, lng: a.lng, address: `${base} (${a.code})${town}` };
}

// The airport a text names, or null: its code in brackets ("Paris (ORY)"), the code alone ("ORY"), or its name
// ("Aéroport de Paris-Orly T3", "Paris Charles de Gaulle"). A name is only taken when it says enough to be this airport.
export function airportOf(text) {
  load();
  const s = String(text || "").trim();
  if (!s) return null;
  const bracket = /\(([A-Z]{3})\)/.exec(s);
  if (bracket && table.has(bracket[1])) return withAddress(table.get(bracket[1]));
  if (/^[A-Z]{3}$/.test(s) && table.has(s)) return withAddress(table.get(s));
  const key = words(s).join(" ");
  if (!key) return null;
  const exact = names.find((n) => n.key === key);
  if (exact) return withAddress(table.get(exact.code));
  if (key.split(" ").length <= 6) {
    const inside = names.filter((n) => n.key.includes(" ") && n.key.length >= 8 && (" " + key + " ").includes(" " + n.key + " "));
    if (inside.length) {
      inside.sort((a, b) => b.key.length - a.key.length);
      return withAddress(table.get(inside[0].code));
    }
  }
  return null;
}

// How a place is named in a title: the text as it was read, or the airport's name when only its code was read.
export function placeLabel(text) {
  const s = String(text || "").trim();
  const a = /^[A-Z]{3}$/.test(s) ? airportOf(s) : null;
  return a ? `${a.name} (${a.code})` : s;
}
