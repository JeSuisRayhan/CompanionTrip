// Native local notifications via expo-notifications. This is a genuine
// improvement over the web/Capacitor versions: no service-worker quirks, no
// separate native plugin to wire up — just works.
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { resolveDayDate } from "./dates";
import { loadTrips } from "./storage";
import { planStepReminders } from "./stepReminders";
import { planBookingReminders } from "./booking";

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

// ---------- Reminder before each step, and for what is still to book ----------
// The reminders of every trip that has them on are planned again from scratch each time the trips change or
// the app opens: our own pending notifications are cancelled, then the nearest steps are scheduled. Nothing
// to store, nothing to keep in step with edits. The reminders to book a step ("À réserver", with a deadline)
// follow the same plan and do not depend on the step-reminder switch of the trip.

let categoriesSet = false;
async function ensureStepCategories() {
  if (categoriesSet) return;
  try {
    await Notifications.setNotificationCategoryAsync("step", []);
    await Notifications.setNotificationCategoryAsync("step-go", [{ identifier: "go", buttonTitle: "Y aller", options: { opensAppToForeground: true } }]);
    categoriesSet = true;
  } catch (e) {
    // no categories: the notification simply has no button
  }
}

export async function syncStepReminders(trips, now = new Date()) {
  let planned = 0;
  try {
    const pending = (await Notifications.getAllScheduledNotificationsAsync()) || [];
    for (const n of pending) {
      const data = n && n.content && n.content.data;
      if (data && (data.kind === "step" || data.kind === "booking")) await cancelScheduledNotification(n.identifier);
    }
    const plan = planStepReminders(trips, now, { os: Platform.OS });
    if (plan.length) await ensureStepCategories();
    for (const item of plan) {
      try {
        await Notifications.scheduleNotificationAsync({
          content: { title: item.title, body: item.body, data: item.data, categoryIdentifier: item.categoryIdentifier },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.at },
        });
        planned++;
      } catch (e) {
        // skip this one, keep going
      }
    }
    // the steps still to book, with a deadline ahead
    for (const item of planBookingReminders(trips, now)) {
      try {
        await Notifications.scheduleNotificationAsync({
          content: { title: item.title, body: item.body, data: item.data },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.at },
        });
        planned++;
      } catch (e) {
        // skip this one, keep going
      }
    }
  } catch (e) {
    // notifications unavailable (permission, old build): nothing to do
  }
  return planned;
}

// Follows the trips as they change: waits a moment so a burst of edits plans once.
let syncTimer = null;
export function scheduleStepReminderSync(delayMs = 1500) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    syncTimer = null;
    try {
      await syncStepReminders(await loadTrips());
    } catch (e) {
      // best effort
    }
  }, delayMs);
}
