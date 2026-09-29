// "Construire mon voyage": the idea notebook.
//
// An idea is a place the traveller wants to do/see/eat, collected before the
// programme exists. Ideas live on the trip (trip.ideas) and are turned into
// real programme steps by placing them on a day.
//
// Placement is never stored on the idea. The placed activity carries
// `ideaId`, and "where is this idea?" is answered by looking at the days.
// So deleting the step from the day screen, moving a day, etc. can never
// leave an idea claiming a place it no longer has.
import { THEME } from "./theme";
import { uid } from "./dates";
import { updateTrip } from "./trips";

export const DEFAULT_IDEA_CATEGORIES = [
  { id: "hotel", label: "Hôtels", icon: "bed", color: THEME.stamp, dim: THEME.stampDim, activityType: "hotel", durationMin: 0 },
  { id: "activite", label: "Activités", icon: "location", color: THEME.teal, dim: THEME.tealDim, activityType: "activite", durationMin: 90 },
  { id: "repas", label: "Repas", icon: "restaurant", color: THEME.gold, dim: THEME.goldDim, activityType: "repas", durationMin: 75 },
  { id: "shopping", label: "Shopping", icon: "bag-handle", color: THEME.pink, dim: THEME.pinkDim, activityType: "activite", durationMin: 60 },
  { id: "nature", label: "Nature", icon: "leaf", color: THEME.nature, dim: THEME.natureDim, activityType: "activite", durationMin: 120, outdoor: true },
];

const CUSTOM_PALETTE = [
  { color: THEME.blue, dim: THEME.blueDim },
  { color: THEME.coral, dim: THEME.coralDim },
  { color: THEME.violet, dim: THEME.violetDim },
  { color: THEME.sand, dim: THEME.sandDim },
];

export const CUSTOM_CATEGORY_ICONS = ["star", "heart", "camera", "wine", "cafe", "musical-notes", "ticket", "walk", "boat", "business"];

export const IDEA_PRIORITIES = [
  { key: "must", label: "Indispensable", color: THEME.stamp },
  { key: "want", label: "J'ai envie", color: THEME.gold },
  { key: "maybe", label: "Si le temps", color: THEME.inkMuted },
];

export const MEAL_SLOTS = [
  { key: "lunch", label: "Midi" },
  { key: "dinner", label: "Soir" },
  { key: "any", label: "Peu importe" },
];

export const DURATION_CHOICES = [30, 60, 90, 120, 180, 240, 360];

const PRIORITY_RANK = { must: 0, want: 1, maybe: 2 };

// ---------- Categories ----------

export function getIdeaCategories(trip) {
  const custom = (trip.customIdeaCategories || []).map((c) => ({ activityType: "activite", durationMin: 90, ...c }));
  return [...DEFAULT_IDEA_CATEGORIES, ...custom];
}

export function getIdeaCategory(trip, categoryId) {
  const all = getIdeaCategories(trip);
  return all.find((c) => c.id === categoryId) || all.find((c) => c.id === "activite");
}

export function priorityMeta(key) {
  return IDEA_PRIORITIES.find((p) => p.key === key) || IDEA_PRIORITIES[1];
}

// ---------- Pure helpers ----------

function finiteOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function parsePrice(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function cleanString(v) {
  const s = (v == null ? "" : String(v)).trim();
  return s || null;
}

// Builds a clean idea from loose form input. Also used for edits: the editor
// sends the full field set and the result replaces the stored idea.
export function makeIdea(input, trip) {
  const cat = getIdeaCategory(trip, input.categoryId);
  const duration = finiteOrNull(input.durationMin);
  return {
    id: uid(),
    categoryId: cat.id,
    name: (input.name || "").trim(),
    address: cleanString(input.address),
    city: cleanString(input.city),
    lat: finiteOrNull(input.lat),
    lng: finiteOrNull(input.lng),
    durationMin: duration != null && duration >= 0 ? Math.round(duration) : cat.durationMin,
    price: cat.activityType === "hotel" ? null : parsePrice(input.price),
    priority: PRIORITY_RANK[input.priority] !== undefined ? input.priority : "want",
    mealSlot: cat.activityType === "repas" ? (MEAL_SLOTS.some((m) => m.key === input.mealSlot) ? input.mealSlot : "any") : null,
    openingHours: cleanString(input.openingHours),
    sourceUrl: cleanString(input.sourceUrl),
    note: cleanString(input.note) || "",
    createdAt: Date.now(),
  };
}

export function hasPosition(idea) {
  return Number.isFinite(idea.lat) && Number.isFinite(idea.lng);
}

// One display line: "address, city" without repeating the city when the
// address already contains it.
export function ideaAddressLine(idea) {
  const address = idea.address || "";
  const city = idea.city || "";
  if (!address) return city;
  if (!city) return address;
  return address.toLowerCase().includes(city.toLowerCase()) ? address : `${address}, ${city}`;
}

export function sortIdeas(ideas) {
  return [...ideas].sort((a, b) => {
    const p = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
    if (p !== 0) return p;
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
}

export function formatIdeaDuration(min) {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

// Map ideaId -> { day, dayIndex, activity } for every idea currently placed.
export function placementIndex(trip) {
  const index = new Map();
  (trip.days || []).forEach((day, dayIndex) => {
    (day.activities || []).forEach((activity) => {
      if (activity.ideaId && !index.has(activity.ideaId)) index.set(activity.ideaId, { day, dayIndex, activity });
    });
  });
  return index;
}

export function ideaStats(trip) {
  const ideas = trip.ideas || [];
  const placed = placementIndex(trip);
  return {
    total: ideas.length,
    placed: ideas.filter((i) => placed.has(i.id)).length,
    mustUnplaced: ideas.filter((i) => i.priority === "must" && !placed.has(i.id)).length,
  };
}

function activityFromIdea(idea, cat, time) {
  const activity = {
    id: uid(),
    title: idea.name,
    time: time || null,
    type: cat.activityType,
    price: idea.price,
    note: idea.note || "",
    address: ideaAddressLine(idea) || null,
    ideaId: idea.id,
    outdoor: !!cat.outdoor,
    done: false,
  };
  if (hasPosition(idea)) {
    activity.lat = idea.lat;
    activity.lng = idea.lng;
  }
  return activity;
}

// ---------- Ideas: create / edit / delete ----------

export async function addIdea(tripId, input) {
  let created = null;
  await updateTrip(tripId, (trip) => {
    created = makeIdea(input, trip);
    return { ...trip, ideas: [...(trip.ideas || []), created] };
  });
  return created;
}

export async function editIdea(tripId, ideaId, patch) {
  return updateTrip(tripId, (trip) => {
    const existing = (trip.ideas || []).find((i) => i.id === ideaId);
    if (!existing) return trip;
    const next = { ...makeIdea({ ...existing, ...patch }, trip), id: existing.id, createdAt: existing.createdAt };
    const cat = getIdeaCategory(trip, next.categoryId);

    // Factual fields follow into the placed step (not the time, not the note:
    // those may have been adjusted by hand on the day). A booked hotel stay is
    // managed from the Hôtels screen, so it is left alone.
    const days =
      cat.activityType === "hotel"
        ? trip.days
        : trip.days.map((day) => ({
            ...day,
            activities: day.activities.map((a) => {
              if (a.ideaId !== ideaId) return a;
              const synced = { ...a, title: next.name, price: next.price, address: ideaAddressLine(next) || null, type: cat.activityType };
              if (hasPosition(next)) {
                synced.lat = next.lat;
                synced.lng = next.lng;
              } else {
                delete synced.lat;
                delete synced.lng;
              }
              return synced;
            }),
          }));

    return { ...trip, days, ideas: trip.ideas.map((i) => (i.id === ideaId ? next : i)) };
  });
}

// removeActivity = also take the placed step out of the programme. Booked
// hotel stays are never removed from here (Hôtels screen owns them): the link
// is just cut.
export async function deleteIdea(tripId, ideaId, { removeActivity = false } = {}) {
  return updateTrip(tripId, (trip) => {
    const idea = (trip.ideas || []).find((i) => i.id === ideaId);
    if (!idea) return trip;
    const isHotel = getIdeaCategory(trip, idea.categoryId).activityType === "hotel";
    const days = trip.days.map((day) => ({
      ...day,
      activities:
        removeActivity && !isHotel
          ? day.activities.filter((a) => a.ideaId !== ideaId)
          : day.activities.map((a) => (a.ideaId === ideaId ? { ...a, ideaId: null } : a)),
    }));
    return { ...trip, days, ideas: trip.ideas.filter((i) => i.id !== ideaId) };
  });
}

// ---------- Placement ----------

// Puts the idea on a day as a real programme step. If it is already placed
// elsewhere it moves (keeping the time it had). Hotels are not placed like
// this: they become a stay from the Hôtels screen.
export async function placeIdeaOnDay(tripId, ideaId, dayId) {
  return updateTrip(tripId, (trip) => {
    const idea = (trip.ideas || []).find((i) => i.id === ideaId);
    const target = trip.days.find((d) => d.id === dayId);
    if (!idea || !target) return trip;
    const cat = getIdeaCategory(trip, idea.categoryId);
    if (cat.activityType === "hotel") return trip;

    let keptTime = null;
    const cleared = trip.days.map((day) => ({
      ...day,
      activities: day.activities.filter((a) => {
        if (a.ideaId === ideaId) {
          keptTime = a.time || null;
          return false;
        }
        return true;
      }),
    }));
    const activity = activityFromIdea(idea, cat, keptTime);
    return { ...trip, days: cleared.map((d) => (d.id === dayId ? { ...d, activities: [...d.activities, activity] } : d)) };
  });
}

export async function unplaceIdea(tripId, ideaId) {
  return updateTrip(tripId, (trip) => {
    const idea = (trip.ideas || []).find((i) => i.id === ideaId);
    if (!idea) return trip;
    if (getIdeaCategory(trip, idea.categoryId).activityType === "hotel") return trip;
    return {
      ...trip,
      days: trip.days.map((day) => ({ ...day, activities: day.activities.filter((a) => a.ideaId !== ideaId) })),
    };
  });
}

// ---------- Custom categories ----------

export async function addIdeaCategory(tripId, { name, icon }) {
  let created = null;
  await updateTrip(tripId, (trip) => {
    const existing = trip.customIdeaCategories || [];
    const palette = CUSTOM_PALETTE[existing.length % CUSTOM_PALETTE.length];
    created = {
      id: `c_${uid()}`,
      label: name.trim(),
      icon: CUSTOM_CATEGORY_ICONS.includes(icon) ? icon : "star",
      color: palette.color,
      dim: palette.dim,
      activityType: "activite",
      durationMin: 90,
    };
    return { ...trip, customIdeaCategories: [...existing, created] };
  });
  return created;
}

// Ideas of a deleted category fall back to "Activités". Built-in categories
// cannot be deleted.
export async function deleteIdeaCategory(tripId, categoryId) {
  return updateTrip(tripId, (trip) => {
    const existing = trip.customIdeaCategories || [];
    if (!existing.some((c) => c.id === categoryId)) return trip;
    return {
      ...trip,
      customIdeaCategories: existing.filter((c) => c.id !== categoryId),
      ideas: (trip.ideas || []).map((i) => (i.categoryId === categoryId ? { ...i, categoryId: "activite" } : i)),
    };
  });
}
