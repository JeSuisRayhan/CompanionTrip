// Native local notifications via expo-notifications. This is a genuine
// improvement over the web/Capacitor versions: no service-worker quirks, no
// separate native plugin to wire up — just works.
import * as Notifications from "expo-notifications";
import { resolveDayDate } from "./dates";

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

// ---------- Daily summary + departure checklist reminder ----------
// Manually triggered (from Trip Settings) rather than auto-rescheduled on
// every edit, to keep the scheduling logic simple and predictable — both
// iOS and Android cap how many notifications an app can have pending at
// once, so we deliberately only cover a reasonable window ahead.

const MAX_DAILY_SUMMARIES = 30; // stay well under the ~64 pending-notification OS limits

export async function scheduleDailySummaries(trip) {
  const ids = [];
  let scheduled = 0;
  for (let i = 0; i < trip.days.length && scheduled < MAX_DAILY_SUMMARIES; i++) {
    const day = trip.days[i];
    const dateISO = resolveDayDate(trip, day, i);
    if (!dateISO) continue;
    const summaryDate = new Date(dateISO + "T08:00:00");
    if (summaryDate.getTime() <= Date.now()) continue; // don't schedule for the past

    const count = day.activities.length;
    const firstFew = day.activities
      .slice()
      .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"))
      .slice(0, 3)
      .map((a) => (a.time ? `${a.time} ${a.title}` : a.title))
      .join(", ");
    const body = count === 0 ? "Rien de prévu aujourd'hui." : `${count} étape${count !== 1 ? "s" : ""} : ${firstFew}${count > 3 ? "…" : ""}`;

    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: { title: `Aujourd'hui — ${day.title}`, body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: summaryDate },
      });
      ids.push(id);
      scheduled++;
    } catch (e) {
      // skip this one, keep going
    }
  }
  return ids;
}

export async function scheduleDepartureReminder(trip) {
  if (!trip.startDate) return null;
  const reminderDate = new Date(trip.startDate + "T09:00:00");
  reminderDate.setDate(reminderDate.getDate() - 3);
  if (reminderDate.getTime() <= Date.now()) return null;

  const items = trip.departureChecklist || [];
  const remaining = items.filter((i) => !i.checked).length;
  const body =
    items.length === 0
      ? "Vérifiez votre checklist avant le départ."
      : remaining === 0
      ? "Checklist avant-départ complète — bon voyage !"
      : `${remaining} élément${remaining !== 1 ? "s" : ""} restant${remaining !== 1 ? "s" : ""} sur votre checklist avant-départ.`;

  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title: "Départ dans 3 jours", body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderDate },
    });
  } catch (e) {
    return null;
  }
}
