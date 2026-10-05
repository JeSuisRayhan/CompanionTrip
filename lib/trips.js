// Trip CRUD helpers — same object schema as the web version, so a JSON
// backup exported there imports here unchanged (and vice versa).
import { uid, shiftTripDates, resolveDayDate, addDaysISO, formatDayLabel } from "./dates";
import { loadTrips, saveTrips, withTripsLock } from "./storage";
import { parseScript, mergeScriptIntoTrip, sameStep } from "./script";
import { parseScopedId, parkDayView, mergeParkDayView } from "./parkDay";

export const MAX_PLANNED_DAYS = 60;

// "Construire mon voyage" mode: N empty days, dated when a start date is
// known. Returns null when no usable day count was given (buildNewTrip then
// falls back to its single default day).
export function buildEmptyDays({ startDate, nbDays }) {
  const n = Math.floor(Number(nbDays));
  if (!Number.isFinite(n) || n < 1) return null;
  const count = Math.min(n, MAX_PLANNED_DAYS);
  return Array.from({ length: count }, (_, i) => ({
    id: uid(),
    title: `Jour ${i + 1}`,
    date: startDate ? addDaysISO(startDate, i) : null,
    activities: [],
    notes: "",
  }));
}

// planMode: "script" (paste a ready-made programme) or "build" (collect
// ideas, then let the app propose a schedule). Trips created before this
// existed have no planMode and behave as "script".
export function buildNewTrip({ name, tripType, startDate, currency, homeCurrency, days, planMode, defaultLocation }) {
  // The hotel stays read from a script carry their number of nights: it belongs in stayNights.
  const stayNights = {};
  const keptDays = days
    ? days.map((day) => ({
        ...day,
        activities: day.activities.map((a) => {
          if (!a.stayId || !(a.nights >= 1)) return a;
          const { nights, ...rest } = a;
          stayNights[a.id] = nights;
          return rest;
        }),
      }))
    : days;
  return {
    id: uid(),
    name: name.trim(),
    tripType: tripType || "long",
    planMode: planMode === "build" ? "build" : "script",
    defaultLocation: defaultLocation && defaultLocation.trim() ? defaultLocation.trim() : null,
    ideas: [],
    customIdeaCategories: [],
    startDate: startDate || null,
    currency: currency || "EUR",
    homeCurrency: homeCurrency || currency || "EUR",
    rate: 1,
    tzOffsetHours: 0,
    days: keptDays && keptDays.length ? keptDays : [{ id: uid(), title: "Jour 1", date: null, activities: [], notes: "" }],
    packingList: [],
    departureChecklist: [],
    otherExpenses: [],
    expenses: [],
    stayNights,
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

// A script pasted into a trip that already exists: its prices, hotel stays and missing steps are added (see
// mergeScriptIntoTrip). What was done is returned: { priced, stays, addedSteps, addedDays }.
export async function importScript(tripId, text) {
  let stats = null;
  await updateTrip(tripId, (trip) => {
    const merged = mergeScriptIntoTrip(trip, text);
    stats = merged.stats;
    return merged.trip;
  });
  return stats;
}

// Steps read from a booking confirmation (see confirmation.js), put on their day: { date | dayId, time, title, type,
// price, confirmationCode, address, nights, transportMode }. A hotel with a date becomes a stay (it shows in Hôtels
// and counts nights in the budget); the others join their day, which is created when the trip has no such date.
// What is already there (same title that day) is completed, not duplicated. Returns { added, updated, skipped,
// stays, addedDays }.
export async function addConfirmationSteps(tripId, items) {
  const stats = { added: 0, updated: 0, skipped: 0, stays: 0, addedDays: 0 };
  const list = (items || []).filter((i) => i && String(i.title || "").trim());
  const isStay = (i) => i.type === "hotel" && i.date && !i.dayId;
  const steps = list.filter((i) => !isStay(i));
  const stays = list.filter(isStay);

  if (steps.length) {
    await updateTrip(tripId, (trip) => {
      let days = trip.days.map((d) => ({ ...d, activities: [...d.activities] }));
      for (const item of steps) {
        let index = item.dayId ? days.findIndex((d) => d.id === item.dayId) : -1;
        if (index < 0 && !item.dayId && item.date) index = days.findIndex((d, i) => resolveDayDate({ ...trip, days }, d, i) === item.date);
        if (index < 0 && !item.dayId && item.date) {
          const later = days.findIndex((d) => d.date && d.date > item.date);
          const at = later === -1 ? days.length : later;
          days = [...days.slice(0, at), { id: uid(), title: formatDayLabel(item.date) || "Jour", date: item.date, activities: [], notes: "" }, ...days.slice(at)];
          index = at;
          stats.addedDays++;
        }
        if (index < 0) {
          stats.skipped++;
          continue;
        }
        const day = days[index];
        const time = item.time || null;
        // the same step by title, or a transport at the very same hour (a trip typed by hand rarely has the same words)
        const dup = day.activities.findIndex(
          (a) => (sameStep(a, item) && (!a.time || !time || a.time === time)) || (item.type === "transport" && a.type === "transport" && !!time && a.time === time)
        );
        if (dup >= 0) {
          const old = day.activities[dup];
          const next = { ...old };
          if (next.time == null && time) next.time = time;
          if (next.price == null && item.price != null) next.price = item.price;
          if (!next.confirmationCode && item.confirmationCode) next.confirmationCode = item.confirmationCode;
          if (!next.address && item.address) next.address = item.address;
          if (JSON.stringify(next) !== JSON.stringify(old)) {
            day.activities[dup] = next;
            stats.updated++;
          } else {
            stats.skipped++;
          }
          continue;
        }
        day.activities.push({
          id: uid(),
          title: String(item.title).trim(),
          time,
          type: item.type || "activite",
          price: item.price != null ? item.price : null,
          note: "",
          address: item.address || null,
          confirmationCode: item.confirmationCode || null,
          transportMode: item.type === "transport" ? item.transportMode || null : null,
          outdoor: false,
          done: false,
        });
        stats.added++;
      }
      return { ...trip, days };
    });
  }

  for (const item of stays) {
    const before = await getTrip(tripId);
    const known = (await listHotelStays(before)).find((s) => s.checkIn === item.date && sameStep({ title: s.name }, item));
    if (known) {
      const price = item.price != null ? item.price : known.pricePerNight * known.nights;
      const changed = (item.price != null && item.price !== known.pricePerNight * known.nights) || (item.address && !known.address) || (item.confirmationCode && !known.confirmationCode);
      if (!changed) {
        stats.skipped++;
        continue;
      }
      await upsertHotelStay(tripId, {
        stayId: known.stayId,
        name: known.name,
        address: known.address || item.address || "",
        checkIn: known.checkIn,
        nights: known.nights,
        totalPrice: price,
        confirmationCode: known.confirmationCode || item.confirmationCode || "",
      });
      stats.updated++;
    } else {
      await upsertHotelStay(tripId, {
        name: String(item.title).trim(),
        address: item.address || "",
        checkIn: item.date,
        nights: item.nights || 1,
        totalPrice: item.price || 0,
        confirmationCode: item.confirmationCode || "",
        time: item.time || null,
      });
      stats.stays++;
      const after = await getTrip(tripId);
      stats.addedDays += Math.max(0, after.days.length - before.days.length);
    }
  }
  return stats;
}

export function createTrip(tripDraft) {
  return withTripsLock(async () => {
    const trips = await loadTrips();
    await saveTrips([...trips, tripDraft]);
    return tripDraft;
  });
}

// `tripId` may also be the id of a park day's view ("<tripId>#<dayId>", see
// parkDay.js): the updater then works on the view and its changes are folded
// back into the real trip. What comes back is the view again.
export function updateTrip(tripId, updater) {
  const scope = parseScopedId(tripId);
  if (scope) return updateParkDay(scope, updater);
  return withTripsLock(async () => {
    const trips = await loadTrips();
    const next = trips.map((t) => (t.id === tripId ? updater(t) : t));
    await saveTrips(next);
    return next.find((t) => t.id === tripId);
  });
}

function updateParkDay({ tripId, dayId }, updater) {
  return withTripsLock(async () => {
    const trips = await loadTrips();
    let merged = null;
    const next = trips.map((t) => {
      if (t.id !== tripId) return t;
      const view = parkDayView(t, dayId);
      if (!view) return t;
      merged = mergeParkDayView(t, updater(view), dayId);
      return merged;
    });
    if (!merged) return null;
    await saveTrips(next);
    return parkDayView(merged, dayId);
  });
}

export function deleteTrip(tripId) {
  return withTripsLock(async () => {
    const trips = await loadTrips();
    await saveTrips(trips.filter((t) => t.id !== tripId));
  });
}

export async function getTrip(tripId) {
  const scope = parseScopedId(tripId);
  const trips = await loadTrips();
  if (scope) return parkDayView(trips.find((t) => t.id === scope.tripId), scope.dayId);
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

export async function setDayType(tripId, dayId, dayType, flightInfo) {
  return updateTrip(tripId, (trip) =>
    patchDay(trip, dayId, (day) => ({
      ...day,
      dayType: dayType || null,
      flightInfo: dayType === "flight" ? flightInfo || day.flightInfo || null : null,
    }))
  );
}

export async function updateTripSettings(tripId, { currency, homeCurrency, rate, budgetTargets, defaultLocation, emergencyInfo, stepReminders }) {
  return updateTrip(tripId, (trip) => ({
    ...trip,
    currency: currency ?? trip.currency,
    homeCurrency: homeCurrency ?? trip.homeCurrency,
    rate: rate ?? trip.rate,
    budgetTargets: budgetTargets ?? trip.budgetTargets,
    defaultLocation: defaultLocation !== undefined ? defaultLocation : trip.defaultLocation,
    emergencyInfo: emergencyInfo !== undefined ? emergencyInfo : trip.emergencyInfo,
    stepReminders: stepReminders !== undefined ? stepReminders : trip.stepReminders,
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
      // ideaId is dropped: an idea is placed once, the copy must not claim it too.
      activities: source.activities.map((a) => ({ ...a, id: uid(), done: false, notificationId: null, ideaId: null })),
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
          localAddress: a.localAddress || "",
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

// ideaId / lat / lng are optional: they come from a "Construire mon voyage"
// idea turned into a booked stay. On an edit the activity is re-created, so
// whatever the previous one carried is kept unless a new value is passed.
export async function upsertHotelStay(tripId, { stayId, name, address, checkIn, nights, totalPrice, confirmationCode, ideaId, lat, lng, time }) {
  const id = stayId || uid();
  const pricePerNight = nights > 0 ? totalPrice / nights : totalPrice;

  return updateTrip(tripId, (trip) => {
    let days = trip.days;
    let stayNights = { ...trip.stayNights };

    // Find (and remove) any activity already tagged with this stayId — an
    // edit re-creates it fresh on the (possibly new) check-in date, rather
    // than trying to patch it in place.
    let previousActivityId = null;
    let previous = null;
    days = days.map((day) => ({
      ...day,
      activities: day.activities.filter((a) => {
        if (a.stayId === id) {
          previousActivityId = a.id;
          previous = a;
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
      time: time !== undefined ? time : (previous && previous.time) || null, // the check-in time survives an edit of the stay
      note: "",
      type: "hotel",
      price: Math.round(pricePerNight * 100) / 100,
      address: address?.trim() || null,
      confirmationCode: confirmationCode?.trim() || null,
      stayId: id,
      done: false,
    };
    const keptIdeaId = ideaId ?? previous?.ideaId ?? null;
    // The position of the previous version only stays while the address is the same one.
    const sameAddress = previous ? (previous.address || null) === (activity.address || null) : false;
    const keptLat = lat ?? (sameAddress ? previous.lat : null) ?? null;
    const keptLng = lng ?? (sameAddress ? previous.lng : null) ?? null;
    if (keptIdeaId) activity.ideaId = keptIdeaId;
    if (previous && previous.localAddress) activity.localAddress = previous.localAddress; // typed in the step editor
    if (keptLat != null && keptLng != null) {
      activity.lat = keptLat;
      activity.lng = keptLng;
    }

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

// ---------- Expenses: what was really spent ----------

// label, amount (in the trip's currency), category ("repas" | "transport" | "hotel" | "other"), date (ISO)
export async function addExpense(tripId, { label, amount, category, date }) {
  const expense = { id: uid(), label: String(label || "").trim() || "Dépense", amount: Math.round(Number(amount) * 100) / 100, category: category || "other", date: date || null };
  await updateTrip(tripId, (trip) => ({ ...trip, expenses: [...(trip.expenses || []), expense] }));
  return expense;
}

export async function updateExpense(tripId, expenseId, patch) {
  return updateTrip(tripId, (trip) => ({
    ...trip,
    expenses: (trip.expenses || []).map((e) => {
      if (e.id !== expenseId) return e;
      const next = { ...e, ...patch };
      if (patch.label != null) next.label = String(patch.label).trim() || e.label;
      if (patch.amount != null) next.amount = Math.round(Number(patch.amount) * 100) / 100;
      return next;
    }),
  }));
}

export async function removeExpense(tripId, expenseId) {
  return updateTrip(tripId, (trip) => ({ ...trip, expenses: (trip.expenses || []).filter((e) => e.id !== expenseId) }));
}

// ---------- Checklists (packing list + departure checklist) ----------

export async function addChecklistItem(tripId, listKey, label) {
  return updateTrip(tripId, (trip) => ({
    ...trip,
    [listKey]: [...(trip[listKey] || []), { id: uid(), label: label.trim(), checked: false }],
  }));
}

// Several items at once (the starter list of an empty checklist).
export async function addChecklistItems(tripId, listKey, labels) {
  return updateTrip(tripId, (trip) => ({
    ...trip,
    [listKey]: [...(trip[listKey] || []), ...labels.map((label) => ({ id: uid(), label: label.trim(), checked: false }))],
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
