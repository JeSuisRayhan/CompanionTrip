// Decodes the mandatory fixed-length section of an IATA BCBP boarding pass
// barcode (IATA Resolution 792) — the standard used by every airline
// worldwide, whether printed (PDF417) or on a phone (Aztec/QR/Data Matrix).
// Field positions verified against two independently-published real
// example strings (cross-checked: field lengths, Julian-date month/day
// math, and the known 60-character mandatory section length all agree).
//
// Deliberately free and local — no API call, no cost. What it CANNOT give
// you: real-time gate number or boarding time (those aren't in the
// barcode at all, they're looked up from the airline's live systems).

const FIELDS = {
  formatCode: [0, 1],
  numLegs: [1, 1],
  passengerName: [2, 20],
  eTicketIndicator: [22, 1],
  pnr: [23, 7],
  origin: [30, 3],
  destination: [33, 3],
  carrier: [36, 3],
  flightNumber: [39, 5],
  julianDate: [44, 3],
  compartment: [47, 1],
  seat: [48, 4],
  checkinSequence: [52, 5],
  passengerStatus: [57, 1],
};
const MANDATORY_LENGTH = 60;

function slice(raw, [start, length]) {
  return raw.substring(start, start + length).trim();
}

// Returns null if the string doesn't look like a BCBP boarding pass at
// all (most QR/barcodes scanned day to day won't be — this should fail
// quietly and let the caller fall back to treating it as a plain document).
export function decodeBoardingPass(raw) {
  if (!raw || raw.length < MANDATORY_LENGTH) return null;
  const formatCode = raw[0];
  if (formatCode !== "M" && formatCode !== "S") return null;
  const numLegs = parseInt(raw[1], 10);
  if (!(numLegs >= 1 && numLegs <= 4)) return null;

  const julianRaw = slice(raw, FIELDS.julianDate);
  if (!/^\d{3}$/.test(julianRaw)) return null;

  const nameRaw = slice(raw, FIELDS.passengerName);
  const [lastName, firstNameWithTitle] = nameRaw.split("/");

  return {
    passengerName: nameRaw.replace("/", " ").trim(),
    pnr: slice(raw, FIELDS.pnr),
    origin: slice(raw, FIELDS.origin),
    destination: slice(raw, FIELDS.destination),
    carrier: slice(raw, FIELDS.carrier),
    flightNumber: `${slice(raw, FIELDS.carrier)} ${slice(raw, FIELDS.flightNumber)}`.trim(),
    julianDay: parseInt(julianRaw, 10),
    compartment: slice(raw, FIELDS.compartment) || null,
    seat: slice(raw, FIELDS.seat) || null,
    checkinSequence: slice(raw, FIELDS.checkinSequence) || null,
  };
}

// The barcode only encodes a day-of-year (1-366), never the year — pick
// whichever of "this year" / "next year" lands closest to referenceISO
// (defaults to today), since boarding passes are almost always scanned
// close to the actual flight date rather than long after it.
export function resolveJulianDate(julianDay, referenceISO) {
  const reference = referenceISO ? new Date(referenceISO + "T00:00:00") : new Date();
  const candidates = [reference.getFullYear() - 1, reference.getFullYear(), reference.getFullYear() + 1];
  let best = null;
  let bestDiff = Infinity;
  for (const year of candidates) {
    const d = new Date(year, 0, julianDay);
    const diff = Math.abs(d.getTime() - reference.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      best = d;
    }
  }
  return `${best.getFullYear()}-${String(best.getMonth() + 1).padStart(2, "0")}-${String(best.getDate()).padStart(2, "0")}`;
}
