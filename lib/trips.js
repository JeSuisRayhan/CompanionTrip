// Trip CRUD helpers — same object schema as the web version, so a JSON
// backup exported there imports here unchanged (and vice versa).
import { uid, shiftTripDates, resolveDayDate } from "./dates";
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

export async function updateTripSettings(tripId, { currency, homeCurrency, rate, budgetTargets, defaultLocation, emergencyInfo }) {
  return updateTrip(tripId, (trip) => ({
    ...trip,
    currency: currency ?? trip.currency,
    homeCurrency: homeCurrency ?? trip.homeCurrency,
    rate: rate ?? trip.rate,
    budgetTargets: budgetTargets ?? trip.budgetTargets,
    defaultLocation: defaultLocation !== undefined ? defaultLocation : trip.defaultLocation,
    emergencyInfo: emergencyInfo !== undefined ? emergencyInfo : trip.emergencyInfo,
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

export async function duplicateDay(tripId, dayId) {
  return updateTrip(tripId, (trip) => {
    const index = trip.days.findIndex((d) => d.id === dayId);
    if (index === -1) return trip;
    const source = trip.days[index];
    const copy = {
      ...source,
      id: uid(),
      title: `${source.title} (copie)`,
      date: null, // avoid an accidental duplicate date on the calendar
      activities: source.activities.map((a) => ({ ...a, id: uid(), done: false, notificationId: null })),
    };
    const days = [...trip.days];
    days.splice(index + 1, 0, copy);
    return { ...trip, days };
  });
}

export async function moveDay(tripId, dayId, direction) {
  return updateTrip(tripId, (trip) => {
    const index = trip.days.findIndex((d) => d.id === dayId);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || targetIndex < 0 || targetIndex >= trip.days.length) return trip;
    const days = [...trip.days];
    [days[index], days[targetIndex]] = [days[targetIndex], days[index]];
    return { ...trip, days };
  });
}

// Inserts a brand-new day at the right chronological position among the
// days that already have an explicit date. Falls back to appending at the
// end when no dated days exist to compare against.
export async function addDay(tripId, { title, date }) {
  return updateTrip(tripId, (trip) => {
    const newDay = { id: uid(), title, date: date || null, activities: [], notes: "" };
    const days = [...trip.days];
    let insertAt = days.length;
    if (date) {
      const firstLaterIndex = days.findIndex((d) => d.date && d.date > date);
      if (firstLaterIndex !== -1) insertAt = firstLaterIndex;
    }
    days.splice(insertAt, 0, newDay);
    return { ...trip, days };
  });
}

// ---------- Centralized hotel stays ----------
// One entry here = one hotel booking (name, address, dates, total price).
// It creates (or updates) a single "hotel" activity on the check-in day,
// tagged with `stayId` so it can be found and edited again later, and sets
// an explicit night-count override so the budget total is exact regardless
// of how the rest of the itinerary is laid out.

function nightsBetween(checkIn, checkOut) {
  const a = new Date(checkIn + "T00:00:00");
  const b = new Date(checkOut + "T00:00:00");
  return Math.max(1, Math.round((b - a) / 86400000));
}

export async function listHotelStays(trip) {
  const stays = [];
  trip.days.forEach((day, index) => {
    day.activities.forEach((a) => {
      if (a.type === "hotel" && a.stayId) {
        stays.push({
          stayId: a.stayId,
          activityId: a.id,
          dayId: day.id,
          name: a.title,
          address: a.address || "",
          confirmationCode: a.confirmationCode || "",
          checkIn: resolveDayDate(trip, day, index),
          nights: trip.stayNights?.[a.id] || 1,
          pricePerNight: a.price || 0,
        });
      }
    });
  });
  return stays;
}

export async function upsertHotelStay(tripId, { stayId, name, address, checkIn, nights, totalPrice, confirmationCode }) {
  const id = stayId || uid();
  const pricePerNight = nights > 0 ? totalPrice / nights : totalPrice;

  return updateTrip(tripId, (trip) => {
    let days = trip.days;
    let stayNights = { ...trip.stayNights };

    // Find (and remove) any activity already tagged with this stayId — an
    // edit re-creates it fresh on the (possibly new) check-in date, rather
    // than trying to patch it in place.
    let previousActivityId = null;
    days = days.map((day) => ({
      ...day,
      activities: day.activities.filter((a) => {
        if (a.stayId === id) {
          previousActivityId = a.id;
          return false;
        }
        return true;
      }),
    }));
    if (previousActivityId) delete stayNights[previousActivityId];

    let dayIndex = days.findIndex((d, i) => resolveDayDate({ ...trip, days }, d, i) === checkIn);
    const activityId = uid();
    const activity = {
      id: activityId,
      title: name.trim(),
      time: null,
      note: "",
      type: "hotel",
      price: Math.round(pricePerNight * 100) / 100,
      address: address?.trim() || null,
      confirmationCode: confirmationCode?.trim() || null,
      stayId: id,
      done: false,
    };

    if (dayIndex === -1) {
      // No day exists yet for the check-in date — create one.
      const newDay = { id: uid(), title: name.trim(), date: checkIn, activities: [activity], notes: "" };
      let insertAt = days.length;
      const firstLaterIndex = days.findIndex((d) => d.date && d.date > checkIn);
      if (firstLaterIndex !== -1) insertAt = firstLaterIndex;
      days = [...days.slice(0, insertAt), newDay, ...days.slice(insertAt)];
    } else {
      days = days.map((d, i) => (i === dayIndex ? { ...d, activities: [...d.activities, activity] } : d));
    }

    stayNights[activityId] = nights;
    return { ...trip, days, stayNights };
  });
}

export async function removeHotelStay(tripId, stayId) {
  return updateTrip(tripId, (trip) => {
    let removedActivityId = null;
    const days = trip.days.map((day) => ({
      ...day,
      activities: day.activities.filter((a) => {
        if (a.stayId === stayId) {
          removedActivityId = a.id;
          return false;
        }
        return true;
      }),
    }));
    const stayNights = { ...trip.stayNights };
    if (removedActivityId) delete stayNights[removedActivityId];
    return { ...trip, days, stayNights };
  });
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
