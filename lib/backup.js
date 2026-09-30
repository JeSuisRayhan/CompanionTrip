// Backup/restore — export all trips to a JSON file the user can keep or
// share, and re-import it later (or on another device). Same shape as the
// web version's backup ("trips" array), so files are interchangeable.
// Also includes saved API keys (Anthropic, Unsplash) — reinstalling the app
// wipes ALL local storage, not just trips, so folding the keys into the
// same backup means one export/import restores everything without ever
// retyping a key. The PIN lock code is deliberately NOT included, since a
// shared backup file shouldn't double as a copy of your device lock code.
//
// Document photos are embedded as base64 (not just their file:// URI) —
// a URI only makes sense on the device that created it. Without embedding
// the actual image data, restoring on a new device (or after a reinstall)
// would leave every document pointing at a photo that no longer exists.
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { loadTrips, saveTrips, getSetting, setSetting, withTripsLock } from "./storage";
import { markBackupDone } from "./backupReminder";
import { uid } from "./dates";

const BACKED_UP_SETTINGS = ["anthropicApiKey", "unsplashAccessKey"];
const DOCS_DIR = FileSystem.documentDirectory + "documents/";

async function ensureDocsDir() {
  const info = await FileSystem.getInfoAsync(DOCS_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(DOCS_DIR, { intermediates: true });
}

// Embeds each document's photo as base64 so it survives a device change.
async function embedDocuments(trip) {
  const embeddedDocuments = [];
  for (const doc of trip.documents || []) {
    try {
      const base64 = await FileSystem.readAsStringAsync(doc.uri, { encoding: FileSystem.EncodingType.Base64 });
      const ext = doc.uri.split(".").pop().split("?")[0] || "jpg";
      embeddedDocuments.push({ ...doc, uri: undefined, base64, ext });
    } catch (e) {
      // File missing/unreadable — keep the metadata but skip the image data
      // rather than failing the whole export.
      embeddedDocuments.push({ ...doc, uri: undefined, base64: null });
    }
  }
  return { ...trip, documents: embeddedDocuments };
}

async function writeAndShare(payload, fileName, dialogTitle) {
  const fileUri = FileSystem.documentDirectory + fileName;
  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(payload));
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) await Sharing.shareAsync(fileUri, { mimeType: "application/json", dialogTitle });
  return fileUri;
}

export async function exportBackup() {
  const trips = await loadTrips();
  const tripsWithEmbeddedDocs = [];
  for (const trip of trips) tripsWithEmbeddedDocs.push(await embedDocuments(trip));

  const settings = {};
  for (const key of BACKED_UP_SETTINGS) {
    const value = await getSetting(key);
    if (value) settings[key] = value;
  }
  const payload = { exportedAt: new Date().toISOString(), trips: tripsWithEmbeddedDocs, settings };
  const fileUri = await writeAndShare(payload, `compagnon-voyage-sauvegarde-${Date.now()}.json`, "Enregistrer la sauvegarde");
  await markBackupDone();
  return fileUri;
}

// One trip as a file, to send to someone who has the app (a travelling companion).
// No API keys, no other trip, and not the emergency sheet (blood type, allergies:
// it stays on this device). Documents (photos of tickets, passports…) only if asked.
// The other person gets a copy: nothing stays in sync afterwards.
export async function exportTripFile(trip, { withDocuments = true } = {}) {
  const shared = { ...(withDocuments ? await embedDocuments(trip) : { ...trip, documents: [] }), emergencyInfo: {} };
  const slug = String(trip.name || "voyage").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "voyage";
  const payload = { exportedAt: new Date().toISOString(), kind: "trip", trips: [shared] };
  return writeAndShare(payload, `voyage-${slug}-${new Date().toISOString().slice(0, 10)}.json`, "Envoyer ce voyage");
}

// Writes each embedded document's base64 back to a real file on this device
// and returns the trip with fresh, valid `uri` values.
async function rehydrateDocuments(trip) {
  const documents = trip.documents || [];
  if (documents.length === 0) return trip;
  await ensureDocsDir();
  const rehydrated = [];
  for (const doc of documents) {
    if (!doc.base64) continue; // no image data available — drop the broken entry
    const docId = uid();
    const ext = doc.ext || "jpg";
    const destUri = `${DOCS_DIR}${docId}.${ext}`;
    await FileSystem.writeAsStringAsync(destUri, doc.base64, { encoding: FileSystem.EncodingType.Base64 });
    rehydrated.push({ id: doc.id || docId, title: doc.title, category: doc.category, addedAt: doc.addedAt, uri: destUri });
  }
  return { ...trip, documents: rehydrated };
}

// Same trip, ignoring the photos: their files get new names when a file is imported.
const sameTrip = (a, b) => JSON.stringify({ ...a, documents: null }) === JSON.stringify({ ...b, documents: null });

// mode: "replace" clears existing trips first, "merge" appends (skipping
// duplicate ids already present). Settings (API keys) are always restored
// when present in the file, regardless of mode — they're not a list to
// merge, just a value to fill in if missing.
export async function importBackupFromPicker(mode = "merge") {
  const result = await DocumentPicker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true });
  if (result.canceled) return { imported: 0, cancelled: true };

  const fileUri = result.assets[0].uri;
  const raw = await FileSystem.readAsStringAsync(fileUri);
  const parsed = JSON.parse(raw);
  const incomingRaw = Array.isArray(parsed) ? parsed : parsed.trips;
  if (!Array.isArray(incomingRaw)) {
    const err = new Error("Fichier de sauvegarde invalide.");
    err.code = "INVALID_BACKUP";
    throw err;
  }

  const incoming = [];
  for (const trip of incomingRaw) {
    incoming.push(await rehydrateDocuments(trip));
  }

  let restoredSettings = 0;
  if (parsed.settings && typeof parsed.settings === "object") {
    for (const key of BACKED_UP_SETTINGS) {
      if (parsed.settings[key]) {
        await setSetting(key, parsed.settings[key]);
        restoredSettings++;
      }
    }
  }

  if (mode === "replace") {
    await withTripsLock(() => saveTrips(incoming, { force: true }));
    return { imported: incoming.length, cancelled: false, restoredSettings };
  }

  // A file made by "Partager > Fichier pour l'application" holds one trip. If that
  // trip is already here and differs, it comes in as a copy: the person's own
  // version is never touched. A backup file skips the trips already present.
  const single = parsed.kind === "trip" && incoming.length === 1;
  return withTripsLock(async () => {
    const current = await loadTrips();
    const existing = new Map(current.map((t) => [t.id, t]));
    const toAdd = [];
    let copied = 0;
    for (const trip of incoming) {
      const here = existing.get(trip.id);
      if (!here) toAdd.push(trip);
      else if (single && !sameTrip(here, trip)) {
        toAdd.push({ ...trip, id: uid(), name: `${trip.name} (copie)` });
        copied++;
      }
    }
    await saveTrips([...current, ...toAdd]);
    return { imported: toAdd.length, copied, skipped: incoming.length - toAdd.length, cancelled: false, restoredSettings };
  });
}
