// AsyncStorage-backed persistence — the React Native equivalent of the
// window.storage wrapper used in the web/PWA version. Same trips:all key so
// a JSON backup exported from the web app can be re-imported here unchanged.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEY } from "./constants";

// ---------- Trips: never overwrite what could not be read ----------
//
// All trips live in one value. If reading it fails and the app treats that as
// "no trips", the next save writes an empty list over everything. So:
//  - a value that is there but not valid JSON is kept aside (TRIPS_CORRUPT_KEY)
//    and the safe copy is used instead;
//  - a read that throws (twice) blocks saving, so nothing is overwritten, until
//    a read works again;
//  - a safe copy (TRIPS_SAFE_KEY) is refreshed after saves, at most every 10 minutes.
export const TRIPS_SAFE_KEY = "trips:safe";
export const TRIPS_CORRUPT_KEY = "trips:corrupt";
const SAFE_EVERY_MS = 10 * 60 * 1000;
const RETRY_MS = 150;

let blocked = false; // the trips could not be read: saving is refused
let recoveredAt = null; // the safe copy replaced an unreadable value
let safeWrittenAt = 0;

const parseTrips = (raw) => {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
};

async function readTripsValue() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return { raw: await AsyncStorage.getItem(STORAGE_KEY) };
    } catch (e) {
      if (attempt === 0) await new Promise((r) => setTimeout(r, RETRY_MS));
    }
  }
  return { failed: true };
}

async function readSafeCopy() {
  try {
    const raw = await AsyncStorage.getItem(TRIPS_SAFE_KEY);
    return raw ? parseTrips(raw) : null;
  } catch (e) {
    return null;
  }
}

export async function loadTrips() {
  const { raw, failed } = await readTripsValue();
  if (failed) {
    blocked = true;
    return (await readSafeCopy()) || [];
  }
  if (raw == null) {
    blocked = false;
    return [];
  }
  const trips = parseTrips(raw);
  if (trips) {
    blocked = false;
    return trips;
  }
  // There is a value but it is not a list of trips: keep it, use the safe copy.
  blocked = false;
  try {
    await AsyncStorage.setItem(TRIPS_CORRUPT_KEY, raw);
  } catch (e) {
    // nothing more can be done
  }
  const safe = await readSafeCopy();
  if (safe) recoveredAt = Date.now();
  return safe || [];
}

// `force` is for restoring a backup file on purpose: the person is choosing
// what replaces the trips, so an unreadable value no longer blocks the save.
// Something that wants to follow every change of the trips (the step reminders): called after a save, never allowed to fail it.
let afterSave = null;
export function onTripsSaved(fn) {
  afterSave = fn;
}

export async function saveTrips(trips, { force = false } = {}) {
  if (force) blocked = false;
  if (blocked) {
    const e = new Error("Les voyages n'ont pas pu être lus : rien n'est enregistré pour ne pas les écraser. Fermez puis rouvrez l'application.");
    e.code = "STORAGE_UNREADABLE";
    throw e;
  }
  const json = JSON.stringify(trips);
  await AsyncStorage.setItem(STORAGE_KEY, json);
  if (trips.length > 0 && Date.now() - safeWrittenAt > SAFE_EVERY_MS) {
    safeWrittenAt = Date.now();
    try {
      await AsyncStorage.setItem(TRIPS_SAFE_KEY, json);
    } catch (e) {
      safeWrittenAt = 0; // try again on the next save
    }
  }
  if (afterSave) {
    try {
      afterSave();
    } catch (e) {
      // the follower's problem, not the save's
    }
  }
}

// What the home screen tells the person: { blocked, recoveredAt }.
export function storageStatus() {
  return { blocked, recoveredAt };
}

export function acknowledgeRecovery() {
  recoveredAt = null;
}

// Loads and saves go one after the other, so that two quick changes (a refresh
// finishing while a checkbox is ticked) cannot both start from the same list
// and lose one of them.
let chain = Promise.resolve();
export function withTripsLock(job) {
  const run = chain.then(job);
  chain = run.catch(() => {});
  return run;
}

export async function getSetting(key) {
  try {
    return await AsyncStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

export async function setSetting(key, value) {
  await AsyncStorage.setItem(key, value);
}

export async function removeSetting(key) {
  await AsyncStorage.removeItem(key);
}
