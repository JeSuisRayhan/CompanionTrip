// The phone side of the park alerts: a background task that wakes the app now
// and then (Android WorkManager, at best every 15 minutes, at the system's
// discretion: it slows down in battery saver and when the app was force-stopped),
// and the few calls the screens make. The rules themselves are in parkAlerts.js.
import * as TaskManager from "expo-task-manager";
import * as BackgroundTask from "expo-background-task";
import { loadTrips } from "./storage";
import { showAppNotification, requestNotificationPermission } from "./notifications";
import { alertSettings, runParkAlerts, checkTripAlerts } from "./parkAlerts";
import { logError } from "./errorLog";

export const PARK_ALERT_TASK = "park-queue-alerts";
const CHECK_EVERY_MIN = 15; // the smallest interval Android allows

// No signal or a slow answer in the background is normal (metro, park corner);
// anything else is worth a line in the journal.
const worthLogging = (e) => !(e && (e.code === "NETWORK" || e.code === "TIMEOUT"));

TaskManager.defineTask(PARK_ALERT_TASK, async () => {
  try {
    const res = await runParkAlerts({ notify: showAppNotification });
    res.errors.filter(worthLogging).forEach((e) => logError(e, { source: "Alertes de file" }));
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    logError(e, { source: "Alertes de file" });
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

// Registered while at least one trip has its alert on, removed otherwise.
export async function syncParkAlertTask() {
  try {
    const trips = await loadTrips();
    const wanted = trips.some((t) => t.tripType === "park" && t.park && t.park.qtId != null && alertSettings(t).on);
    const registered = await TaskManager.isTaskRegisteredAsync(PARK_ALERT_TASK);
    if (wanted && !registered) await BackgroundTask.registerTaskAsync(PARK_ALERT_TASK, { minimumInterval: CHECK_EVERY_MIN });
    else if (!wanted && registered) await BackgroundTask.unregisterTaskAsync(PARK_ALERT_TASK);
    return wanted;
  } catch (e) {
    logError(e, { source: "Alertes de file" });
    return false;
  }
}

// After a refresh of the live queues on screen.
export function checkAlertsOnScreen(trip, data) {
  return checkTripAlerts(trip, data, { notify: showAppNotification }).catch((e) => {
    logError(e, { source: "Alertes de file" });
    return [];
  });
}

export { requestNotificationPermission };
