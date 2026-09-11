// Backup/restore — export all trips to a JSON file the user can keep or
// share, and re-import it later (or on another device). Same shape as the
// web version's backup ("trips" array), so files are interchangeable.
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { loadTrips, saveTrips } from "./storage";

export async function exportBackup() {
  const trips = await loadTrips();
  const payload = { exportedAt: new Date().toISOString(), trips };
  const fileUri = FileSystem.documentDirectory + `compagnon-voyage-sauvegarde-${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(payload, null, 2));
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(fileUri, { mimeType: "application/json", dialogTitle: "Enregistrer la sauvegarde" });
  }
  return fileUri;
}

// mode: "replace" clears existing trips first, "merge" appends (skipping
// duplicate ids already present).
export async function importBackupFromPicker(mode = "merge") {
  const result = await DocumentPicker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true });
  if (result.canceled) return { imported: 0, cancelled: true };

  const fileUri = result.assets[0].uri;
  const raw = await FileSystem.readAsStringAsync(fileUri);
  const parsed = JSON.parse(raw);
  const incoming = Array.isArray(parsed) ? parsed : parsed.trips;
  if (!Array.isArray(incoming)) {
    const err = new Error("Fichier de sauvegarde invalide.");
    err.code = "INVALID_BACKUP";
    throw err;
  }

  if (mode === "replace") {
    await saveTrips(incoming);
    return { imported: incoming.length, cancelled: false };
  }

  const current = await loadTrips();
  const existingIds = new Set(current.map((t) => t.id));
  const toAdd = incoming.filter((t) => !existingIds.has(t.id));
  await saveTrips([...current, ...toAdd]);
  return { imported: toAdd.length, skipped: incoming.length - toAdd.length, cancelled: false };
}
