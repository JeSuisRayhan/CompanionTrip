// The lock code of the app (Réglages > Verrouillage par code).
//
// What is kept on the phone is a fingerprint of the code (salted, hashed many times), never the code itself: someone
// who reads the phone's storage does not read the code. A code kept in clear by an older version is replaced by its
// fingerprint the first time the app opens.
//
// Wrong codes are counted and kept (closing the app does not reset them): after five in a row, each new try has to
// wait, longer and longer. A 4-digit code has 10 000 possibilities: without the wait, trying them all is quick.
import { getSetting, setSetting, removeSetting } from "./storage";
import { stretchedHash } from "./sha256";

const LEGACY_KEY = "appPin"; // the code in clear (older versions)
const HASH_KEY = "appPinHash"; // { v, salt, rounds, hash }
const FAILS_KEY = "appPinFails"; // { count, until }
const DEVICE_KEY = "appPinDeviceAuth"; // "0" = the phone's own lock (fingerprint, face, code) may not open the app
const ROUNDS = 1200;

export const FREE_TRIES = 5;
const WAITS_MS = [30e3, 60e3, 5 * 60e3, 15 * 60e3, 60 * 60e3]; // after the 5th, 6th, 7th, 8th wrong code, then every one
export const MAX_WAIT_MS = WAITS_MS[WAITS_MS.length - 1];

// How long to wait after `count` wrong codes in a row (0: try again at once).
export function delayAfter(count) {
  if (!(count >= FREE_TRIES)) return 0;
  return WAITS_MS[Math.min(count - FREE_TRIES, WAITS_MS.length - 1)];
}

// "30 s", "5 min", "1 h": the wait as it is told.
export function waitLabel(ms) {
  const s = Math.max(1, Math.ceil(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.ceil(s / 60);
  return m < 60 ? `${m} min` : "1 h";
}

export const isValidPin = (pin) => typeof pin === "string" && /^\d{4}$/.test(pin);

function newSalt() {
  let s = "";
  for (let i = 0; i < 4; i++) s += Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
  return s + Date.now().toString(16);
}

async function readRecord() {
  try {
    const raw = await getSetting(HASH_KEY);
    const rec = raw ? JSON.parse(raw) : null;
    return rec && typeof rec.salt === "string" && typeof rec.hash === "string" && rec.rounds > 0 ? rec : null;
  } catch (e) {
    return null;
  }
}

async function writeRecord(pin) {
  const salt = newSalt();
  await setSetting(HASH_KEY, JSON.stringify({ v: 1, salt, rounds: ROUNDS, hash: stretchedHash(pin, salt, ROUNDS) }));
}

const forget = (key) => removeSetting(key).catch(() => {});

// A code kept in clear by an older version becomes a fingerprint. Safe to call at every start.
export async function migratePin() {
  try {
    const legacy = await getSetting(LEGACY_KEY);
    if (!legacy) return false;
    if (!(await readRecord())) await writeRecord(String(legacy));
    await removeSetting(LEGACY_KEY);
    return true;
  } catch (e) {
    return false;
  }
}

export async function hasPin() {
  if (await readRecord()) return true;
  return !!(await getSetting(LEGACY_KEY));
}

export async function setPin(pin) {
  if (!isValidPin(pin)) throw new Error("Le code doit contenir exactement 4 chiffres.");
  await writeRecord(pin);
  await forget(LEGACY_KEY);
  await forget(FAILS_KEY);
}

export async function clearPin() {
  await removeSetting(HASH_KEY);
  await forget(LEGACY_KEY);
  await forget(FAILS_KEY);
}

async function readFails(now) {
  try {
    const raw = await getSetting(FAILS_KEY);
    const f = raw ? JSON.parse(raw) : null;
    const count = f && f.count > 0 ? Math.floor(f.count) : 0;
    let until = f && f.until > 0 ? f.until : 0;
    // the phone's clock was moved back: the wait never exceeds the longest one
    if (until - now > MAX_WAIT_MS) until = now + MAX_WAIT_MS;
    return { count, until };
  } catch (e) {
    return { count: 0, until: 0 };
  }
}

// What the lock screen shows before a code is typed: { waitMs (0: a code can be tried), fails }.
export async function pinStatus(now = Date.now()) {
  const f = await readFails(now);
  return { waitMs: Math.max(0, f.until - now), fails: f.count };
}

// Forgets the wrong codes (the app was opened another way: the phone's own lock).
export async function clearPinFails() {
  await forget(FAILS_KEY);
}

async function matches(candidate) {
  const rec = await readRecord();
  if (rec) return stretchedHash(candidate, rec.salt, rec.rounds) === rec.hash;
  const legacy = await getSetting(LEGACY_KEY);
  return !!legacy && legacy === candidate;
}

// Tries a code: { ok, locked, waitMs, left }. `waitMs` > 0: no code is tried before that long (and when `locked` is
// true this one was not tried either); `left`: tries left before a wait.
export async function verifyPin(candidate, now = Date.now()) {
  const fails = await readFails(now);
  if (fails.until > now) return { ok: false, locked: true, waitMs: fails.until - now, left: 0 };
  if (isValidPin(candidate) && (await matches(candidate))) {
    await clearPinFails();
    return { ok: true, locked: false, waitMs: 0, left: FREE_TRIES };
  }
  const count = fails.count + 1;
  const wait = delayAfter(count);
  try {
    await setSetting(FAILS_KEY, JSON.stringify({ count, until: wait ? now + wait : 0 }));
  } catch (e) {
    // the count could not be kept: the code is still refused
  }
  return { ok: false, locked: false, waitMs: wait, left: Math.max(0, FREE_TRIES - count) };
}

// Kept for what was written before verifyPin: true when the code is the right one.
export async function checkPin(candidate) {
  return (await verifyPin(candidate)).ok;
}

// ---------- Opening the app with the phone's own lock (fingerprint, face, phone code) ----------
// On unless the person turned it off: it is also the way back in when the code is forgotten.
export async function deviceUnlockEnabled() {
  return (await getSetting(DEVICE_KEY)) !== "0";
}

export async function setDeviceUnlock(on) {
  await setSetting(DEVICE_KEY, on ? "1" : "0");
}
