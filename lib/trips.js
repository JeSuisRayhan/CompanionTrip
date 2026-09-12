// Trip CRUD helpers — same object schema as the web version, so a JSON
// backup exported there imports here unchanged (and vice versa).
import { uid, shiftTripDates } from "./dates";
import { loadTrips, saveTrips } from "./storage";
import { parseScript } from "./script";

export function buildNewTrip({ name, tripType, startDate, currency, homeCurrency, days }) {
  return {
    id: uid(),
    name: name.trim(),
    tripType: tripType || "long",
    startDate: startDate || null,
    currency: currency || "EUR",
    homeCurrency: homeCurrency || currency || "EUR",
    rate: 1,
    tzOffsetHours: 0,
    days: days && days.length ? days : [{ id: uid(), title: "Jour 1", date: null, activities: [], notes: "" }],
    packingList: [],
    departureChecklist: [],
    otherExpenses: [],
    stayNights: {},
    budgetTargets: {},
    emergencyInfo: {},
    documents: [],
    phrases: [],
  };
}

export function daysFromScript(script, startDate) {
  if (!script || !script.trim()) return null;
  return parseScript(script, startDate || null);
}

export async function createTrip(tripDraft) {
  const trips = await loadTrips();
  const next = [...trips, tripDraft];
  await saveTrips(next);
  return tripDraft;
}

export async function updateTrip(tripId, updater) {
  const trips = await loadTrips();
  const next = trips.map((t) => (t.id === tripId ? updater(t) : t));
  await saveTrips(next);
  return next.find((t) => t.id === tripId);
}

export async function deleteTrip(tripId) {
  const trips = await loadTrips();
  await saveTrips(trips.filter((t) => t.id !== tripId));
}

export async function getTrip(tripId) {
  const trips = await loadTrips();
  return trips.find((t) => t.id === tripId) || null;
}

export async function setCoverImage(tripId, coverImage) {
  return updateTrip(tripId, (trip) => ({ ...trip, coverImage }));
}

function patchDay(trip, dayId, updater) {
  return { ...trip, days: trip.days.map((d) => (d.id === dayId ? updater(d) : d)) };
}

export async function setDayLocation(tripId, dayId, location) {
  return updateTrip(tripId, (trip) => patchDay(trip, dayId, (day) => ({ ...day, location })));
}

export async function updateTripSettings(tripId, { currency, homeCurrency, rate, budgetTargets }) {
  return updateTrip(tripId, (trip) => ({
    ...trip,
    currency: currency ?? trip.currency,
    homeCurrency: homeCurrency ?? trip.homeCurrency,
    rate: rate ?? trip.rate,
    budgetTargets: budgetTargets ?? trip.budgetTargets,
  }));
}

export async function addActivity(tripId, dayId, activity) {
  return updateTrip(tripId, (trip) =>
    patchDay(trip, dayId, (day) => ({ ...day, activities: [...day.activities, { id: uid(), ...activity }] }))
  );
}

export async function editActivity(tripId, dayId, activityId, patch) {
  return updateTrip(tripId, (trip) =>
    patchDay(trip, dayId, (day) => ({
      ...day,
      activities: day.activities.map((a) => (a.id === activityId ? { ...a, ...patch } : a)),
    }))
  );
}

export async function deleteActivity(tripId, dayId, activityId) {
  return updateTrip(tripId, (trip) =>
    patchDay(trip, dayId, (day) => ({ ...day, activities: day.activities.filter((a) => a.id !== activityId) }))
  );
}

export async function toggleActivityDone(tripId, dayId, activityId) {
  return updateTrip(tripId, (trip) =>
    patchDay(trip, dayId, (day) => ({
      ...day,
      activities: day.activities.map((a) => (a.id === activityId ? { ...a, done: !a.done } : a)),
    }))
  );
}

// ---------- Checklists (packing list + departure checklist) ----------

export async function addChecklistItem(tripId, listKey, label) {
  return updateTrip(tripId, (trip) => ({
    ...trip,
    [listKey]: [...(trip[listKey] || []), { id: uid(), label: label.trim(), checked: false }],
  }));
}

export async function toggleChecklistItem(tripId, listKey, itemId) {
  return updateTrip(tripId, (trip) => ({
    ...trip,
    [listKey]: (trip[listKey] || []).map((item) => (item.id === itemId ? { ...item, checked: !item.checked } : item)),
  }));
}

export async function removeChecklistItem(tripId, listKey, itemId) {
  return updateTrip(tripId, (trip) => ({
    ...trip,
    [listKey]: (trip[listKey] || []).filter((item) => item.id !== itemId),
  }));
}

// ---------- Phrases utiles ----------

export async function addPhrase(tripId, phrase, translation) {
  return updateTrip(tripId, (trip) => ({
    ...trip,
    phrases: [...(trip.phrases || []), { id: uid(), phrase: phrase.trim(), translation: translation.trim() }],
  }));
}

export async function removePhrase(tripId, phraseId) {
  return updateTrip(tripId, (trip) => ({
    ...trip,
    phrases: (trip.phrases || []).filter((p) => p.id !== phraseId),
  }));
}

// ---------- Shift dates ----------

export async function shiftTripDatesBy(tripId, deltaDays) {
  return updateTrip(tripId, (trip) => shiftTripDates(trip, deltaDays));
}
