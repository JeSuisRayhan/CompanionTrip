// Reminders before each step of a trip: which notifications to plan, and what to open when one is tapped.
// Pure rules, no phone calls (those are in notifications.js), so they can be tested.
import { resolveDayDate } from "./dates";
import { splitTitlePlace } from "./script";
import { directionsUrl } from "./map";

export const REMINDER_MINUTES = [15, 30, 60];
const DEFAULT_MINUTES = 30;
// Phones keep a limited number of pending notifications (iOS: 64, shared with the daily summaries):
// only the nearest steps are planned, and the plan is redone each time the app opens.
export const MAX_STEP_REMINDERS = 30;

// { on, minutes } for a trip; off unless the person turned it on.
export function reminderSettings(trip) {
  const s = (trip && trip.stepReminders) || {};
  return { on: !!s.enabled, minutes: REMINDER_MINUTES.includes(s.minutes) ? s.minutes : DEFAULT_MINUTES };
}

function atTime(dateISO, time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time || "");
  if (!dateISO || !m) return null;
  const d = new Date(dateISO + "T00:00:00");
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

// The notifications to have pending: for each trip with the reminder on, its steps with a time that are not
// done yet and whose reminder time is still ahead, the nearest `max` of them. A step that already has its own
// reminder (transport and hotel steps, set in the step editor) is left to it.
export function planStepReminders(trips, now = new Date(), { max = MAX_STEP_REMINDERS, os = "android" } = {}) {
  const plan = [];
  for (const trip of trips || []) {
    const { on, minutes } = reminderSettings(trip);
    if (!on || !Array.isArray(trip.days)) continue;
    trip.days.forEach((day, index) => {
      const dateISO = resolveDayDate(trip, day, index);
      for (const step of day.activities || []) {
        if (step.done || step.notificationId) continue;
        const event = atTime(dateISO, step.time);
        if (!event) continue;
        const at = new Date(event.getTime() - minutes * 60000);
        if (at.getTime() <= now.getTime()) continue;
        const place = step.address ? String(step.address).trim() : splitTitlePlace(step.title).place;
        const name = step.address ? step.title : splitTitlePlace(step.title).title;
        const goUrl = directionsUrl(step, os);
        plan.push({
          at,
          title: `Dans ${minutes} min : ${name}`,
          body: place ? `${step.time} · ${place}` : `${step.time} · ${trip.name}`,
          categoryIdentifier: goUrl ? "step-go" : "step",
          data: {
            kind: "step",
            tripId: trip.id,
            activityId: step.id,
            // a park trip has its own live day; every other trip opens "Aujourd'hui"
            screen: trip.tripType === "park" ? "DayDetail" : "Today",
            params: trip.tripType === "park" ? { tripId: trip.id, dayId: day.id } : { tripId: trip.id },
            goUrl,
          },
        });
      }
    });
  }
  plan.sort((a, b) => a.at - b.at);
  return plan.slice(0, max);
}

// What a tap on one of our notifications should do: open the maps app ("Y aller" button) or a screen of the app.
export function targetFromResponse(response) {
  const request = response && response.notification && response.notification.request;
  const data = request && request.content && request.content.data;
  if (!data || (data.kind !== "step" && data.kind !== "booking")) return null;
  if (data.kind === "step" && response.actionIdentifier === "go" && data.goUrl) return { type: "url", url: data.goUrl };
  if (!data.screen) return null;
  return { type: "screen", screen: data.screen, params: data.params || {} };
}
