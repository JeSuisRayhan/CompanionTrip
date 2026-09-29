// When to remind the person to save a backup. Everything lives on the phone:
// uninstalling the app erases the trips, so a backup file is the only safety net.
//
// Due when there is at least one trip and the last backup is 14 days old, or
// there never was one and the app has been around for 3 days. "Plus tard"
// silences the reminder for 7 days.
import { getSetting, setSetting } from "./storage";

export const LAST_BACKUP_KEY = "lastBackupAt";
const SNOOZE_KEY = "backupSnoozeUntil";
const FIRST_RUN_KEY = "firstRunAt";
export const REMIND_AFTER_DAYS = 14;
const GRACE_DAYS = 3;
const SNOOZE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

async function readMs(key) {
  const n = Number(await getSetting(key));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function markBackupDone(now = Date.now()) {
  await setSetting(LAST_BACKUP_KEY, String(now));
}

export const lastBackupAt = () => readMs(LAST_BACKUP_KEY);

export async function snoozeBackupReminder(now = Date.now()) {
  await setSetting(SNOOZE_KEY, String(now + SNOOZE_DAYS * DAY_MS));
}

export const daysSince = (ms, now = Date.now()) => Math.max(0, Math.floor((now - ms) / DAY_MS));

// "jamais", "aujourd'hui", "hier", "il y a 5 jours": to finish "Dernière sauvegarde : …".
export function backupLabel(ms, now = Date.now()) {
  if (!ms) return "jamais";
  const d = daysSince(ms, now);
  return d === 0 ? "aujourd'hui" : d === 1 ? "hier" : `il y a ${d} jours`;
}

// { due, days }: days since the last backup, null when there never was one.
export async function backupReminder(tripCount, now = Date.now()) {
  const last = await readMs(LAST_BACKUP_KEY);
  let first = await readMs(FIRST_RUN_KEY);
  if (!first) {
    first = now;
    await setSetting(FIRST_RUN_KEY, String(now));
  }
  const days = last ? daysSince(last, now) : null;
  if (tripCount === 0) return { due: false, days };
  const snoozedUntil = await readMs(SNOOZE_KEY);
  if (snoozedUntil && snoozedUntil > now) return { due: false, days };
  const due = last ? now - last >= REMIND_AFTER_DAYS * DAY_MS : now - first >= GRACE_DAYS * DAY_MS;
  return { due, days };
}
