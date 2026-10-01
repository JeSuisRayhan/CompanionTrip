// A park day inside a normal trip.
//
// The attraction screens (list, plan, live day, map) are written for a park
// trip: they read `trip.park` and `trip.ideas` and write through
// updateTrip(tripId, …). To give a single "park day" of a normal trip the same
// tools without rewriting them, such a day is opened as a *view* of the trip:
//
//   id "<tripId>#<dayId>"  ->  the same trip, as if it were a park trip whose
//                              park is the day's park and whose attractions
//                              are the list kept for that park.
//
// getTrip / updateTrip (lib/trips.js) understand that id: they build the view
// to read it, and fold what a screen changed back into the real trip.
//
// What is stored in the real trip:
//   day.park               the park of this day { qtId, name, country, lat, lng, timezone }
//   trip.parkLists         { [qtId]: [attraction, …] }, one list per park, shared by
//                          the days spent in the same park
//   trip.parkMinHeightCm   height of the smallest of the group, for the whole trip
// `trip.ideas` (the idea notebook of a "build" trip) is left alone.

const SEP = "#";

export function scopedId(tripId, dayId) {
  return `${tripId}${SEP}${dayId}`;
}

// "abc#def" -> { tripId: "abc", dayId: "def" }; a plain trip id -> null.
export function parseScopedId(id) {
  if (typeof id !== "string") return null;
  const at = id.indexOf(SEP);
  if (at <= 0 || at === id.length - 1) return null;
  return { tripId: id.slice(0, at), dayId: id.slice(at + 1) };
}

// The real trip id behind an id that may be a view's.
export function realTripId(id) {
  const s = parseScopedId(id);
  return s ? s.tripId : id;
}

// The park kept on a day, without the settings that belong to the traveller.
function cleanPark(park) {
  if (!park || park.qtId == null) return null;
  return {
    qtId: park.qtId,
    name: park.name,
    country: park.country || null,
    lat: Number.isFinite(park.lat) ? park.lat : null,
    lng: Number.isFinite(park.lng) ? park.lng : null,
    timezone: park.timezone || null,
  };
}

// The trip as the park screens expect it, for one day. null when the day is gone.
export function parkDayView(trip, dayId) {
  if (!trip || !Array.isArray(trip.days)) return null;
  const day = trip.days.find((d) => d.id === dayId);
  if (!day) return null;
  const park = cleanPark(day.park);
  return {
    ...trip,
    id: scopedId(trip.id, dayId),
    tripType: "park",
    park: park ? { ...park, minHeightCm: trip.parkMinHeightCm != null ? trip.parkMinHeightCm : null } : null,
    ideas: park ? (trip.parkLists && trip.parkLists[park.qtId]) || [] : [],
    scope: { tripId: trip.id, dayId },
  };
}

// Folds what an updater changed in a view back into the real trip. Only the
// park of the day, the attractions of that park, the height and the days are
// taken from the view: nothing else a park screen does can leak elsewhere.
export function mergeParkDayView(real, view, dayId) {
  const before = real.days.find((d) => d.id === dayId);
  const oldPark = cleanPark(before && before.park);
  const newPark = cleanPark(view.park);

  const next = { ...real };

  // The attractions go back to the list that was shown. When the park changed,
  // that list is the old park's, still untouched: the new park keeps its own.
  if (oldPark && Array.isArray(view.ideas)) {
    next.parkLists = { ...(real.parkLists || {}), [oldPark.qtId]: view.ideas };
  }
  // The height is only read when the day already had a park: a view without
  // park carries none, and choosing the first park must not reset the trip's.
  if (oldPark && view.park && view.park.minHeightCm !== undefined) {
    next.parkMinHeightCm = view.park.minHeightCm;
  }

  const days = Array.isArray(view.days) ? view.days : real.days;
  next.days = days.map((d) => {
    if (d.id !== dayId) return d;
    const copy = { ...d };
    delete copy.park;
    return newPark ? { ...copy, park: newPark } : copy;
  });
  return next;
}
