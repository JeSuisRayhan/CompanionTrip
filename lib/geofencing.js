// Geofencing: when the user physically approaches a hotel's address (a
// real "native app" capability a website could never offer), fire a local
// notification with its check-in details and confirmation code.
//
// Background geofencing tasks run in a stripped-down JS context — they
// can't receive the full trip object as a closure variable, so the
// geofenced regions' display info (title + code) is saved to AsyncStorage
// under its own key, looked up by region identifier when a Enter event
// fires.
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import { getSetting, setSetting } from "./storage";
import { searchPlacesWithFallback } from "./geocode";

const TASK_NAME = "hotel-proximity-task";
const REGION_INFO_KEY = "geofenceRegionInfo";
const GEOFENCE_RADIUS_METERS = 350;

TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
  if (error || !data) return;
  const { eventType, region } = data;
  if (eventType !== Location.GeofencingEventType.Enter) return;
  try {
    const raw = await getSetting(REGION_INFO_KEY);
    const infoByRegion = raw ? JSON.parse(raw) : {};
    const info = infoByRegion[region.identifier];
    if (!info) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Vous approchez de ${info.title}`,
        body: info.confirmationCode ? `Code de réservation : ${info.confirmationCode}` : "Bon séjour !",
      },
      trigger: null,
    });
  } catch (e) {
    // best-effort — a background task throwing would just get silently retried by the OS
  }
});

export async function requestGeofencingPermissions() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") return false;
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.status === "granted";
}

export async function getGeofencingPermissionStatus() {
  const fg = await Location.getForegroundPermissionsAsync();
  const bg = await Location.getBackgroundPermissionsAsync();
  return fg.status === "granted" && bg.status === "granted" ? "granted" : "denied";
}

// The hotel steps that can be watched: an address to look up, or a position already known.
export function hotelStops(trip) {
  const list = [];
  for (const day of trip.days || []) {
    for (const activity of day.activities || []) {
      if (activity.type !== "hotel") continue;
      if ((activity.address && String(activity.address).trim()) || (Number.isFinite(activity.lat) && Number.isFinite(activity.lng))) list.push(activity);
    }
  }
  return list;
}

// Where a hotel is: the position the step already has (from the map or the idea),
// else its address looked up on OpenStreetMap. An approximate hit (only the
// district) is no use for a 350 m circle, so it counts as not found.
export async function hotelPosition(activity) {
  if (Number.isFinite(activity.lat) && Number.isFinite(activity.lng)) return { lat: activity.lat, lng: activity.lng };
  try {
    const { results, approximate } = await searchPlacesWithFallback({ name: activity.title, address: activity.address }, { limit: 1, loose: true });
    if (!results.length || approximate) return null;
    return { lat: results[0].lat, lng: results[0].lng };
  } catch (e) {
    return null;
  }
}

// Registers a geofence around every hotel check-in that has an address,
// across the whole trip. Replaces any previously-registered regions for
// this feature (geofencing only supports one active set of regions at a
// time per task name).
export async function scheduleHotelProximityAlerts(trip) {
  const regions = [];
  const infoByRegion = {};

  for (const activity of hotelStops(trip)) {
    const coords = await hotelPosition(activity);
    if (!coords) continue;
    regions.push({
      identifier: activity.id,
      latitude: coords.lat,
      longitude: coords.lng,
      radius: GEOFENCE_RADIUS_METERS,
      notifyOnEnter: true,
      notifyOnExit: false,
    });
    infoByRegion[activity.id] = { title: activity.title, confirmationCode: activity.confirmationCode || null };
  }

  await setSetting(REGION_INFO_KEY, JSON.stringify(infoByRegion));

  if (regions.length === 0) {
    await stopHotelProximityAlerts();
    return 0;
  }
  await Location.startGeofencingAsync(TASK_NAME, regions);
  // Only one trip's hotels can be actively geofenced at a time (both the OS
  // region-count limits and a single shared task name make per-trip
  // parallel tracking impractical) — remember which trip this is, so other
  // trips' settings screens can show the correct on/off state.
  await setSetting("geofenceActiveTripId", trip.id);
  return regions.length;
}

export async function stopHotelProximityAlerts() {
  try {
    const started = await Location.hasStartedGeofencingAsync(TASK_NAME);
    if (started) await Location.stopGeofencingAsync(TASK_NAME);
  } catch (e) {
    // nothing was running — fine
  }
  await setSetting("geofenceActiveTripId", "");
}

export async function isHotelProximityActiveForTrip(tripId) {
  const activeTripId = await getSetting("geofenceActiveTripId");
  return activeTripId === tripId;
}
