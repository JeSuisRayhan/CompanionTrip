// Native local notifications via expo-notifications. This is a genuine
// improvement over the web/Capacitor versions: no service-worker quirks, no
// separate native plugin to wire up — just works.
import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission() {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted" ? "granted" : "denied";
}

export async function getNotificationPermission() {
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted" ? "granted" : status === "denied" ? "denied" : "default";
}

export async function showAppNotification(title, body) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null, // fire immediately
    });
  } catch (e) {
    // Notifications unavailable — nothing more we can do.
  }
}

// ---------- Scheduled reminders tied to a specific activity ----------

export async function cancelScheduledNotification(notificationId) {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (e) {
    // already fired or invalid id — nothing to do
  }
}

// Schedules a reminder `minutesBefore` before the given date+time. Returns
// the new notification id (to store on the activity so it can be cancelled
// later), or null if the time is already in the past.
export async function scheduleActivityReminder({ dateISO, time, title, body, minutesBefore = 120 }) {
  if (!dateISO || !time) return null;
  const [h, m] = time.split(":").map(Number);
  const eventDate = new Date(dateISO + "T00:00:00");
  eventDate.setHours(h, m, 0, 0);
  const triggerDate = new Date(eventDate.getTime() - minutesBefore * 60000);
  if (triggerDate.getTime() <= Date.now()) return null;
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
    });
    return id;
  } catch (e) {
    return null;
  }
}
