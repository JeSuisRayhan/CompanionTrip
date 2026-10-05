// Souvenir photos of a trip. Kept apart from the documents (tickets, passports…): they are not papers to show
// at a desk, and they must not end up in the Documents tab. Same storage as documents: the picked photo is
// copied into the app's own folder and only its path is saved in the trip; the backup embeds the files.
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { uid } from "./dates";
import { updateTrip, getTrip } from "./trips";
import { requestImagePermission } from "./documents";

const DIR = FileSystem.documentDirectory + "souvenirs/";
// A backup holds every photo as text: a limit keeps the file (and the phone's memory) reasonable.
export const MAX_SOUVENIRS = 30;

export function souvenirsOf(trip) {
  return Array.isArray(trip && trip.souvenirs) ? trip.souvenirs : [];
}

export function souvenirsLeft(trip) {
  return Math.max(0, MAX_SOUVENIRS - souvenirsOf(trip).length);
}

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
}

// The photos picked, already compressed: the gallery lets several be chosen at once, the camera takes one.
// Returns the temporary URIs ([] when cancelled); throws PERMISSION_DENIED.
export async function pickSouvenirs(source, max = MAX_SOUVENIRS) {
  if (!(await requestImagePermission(source))) {
    const err = new Error("PERMISSION_DENIED");
    err.code = "PERMISSION_DENIED";
    throw err;
  }
  if (source === "camera") {
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
    return result.canceled || !result.assets ? [] : result.assets.map((a) => a.uri).slice(0, 1);
  }
  const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, allowsEditing: false, allowsMultipleSelection: true, selectionLimit: Math.max(1, max) });
  return result.canceled || !result.assets ? [] : result.assets.map((a) => a.uri).slice(0, max);
}

// Adds the photos (at most what is left of the limit). Returns { trip, added, skipped }.
export async function addSouvenirs(tripId, tempUris) {
  const wanted = (tempUris || []).filter(Boolean);
  await ensureDir();
  let added = 0;
  const current = await getTrip(tripId); // to know what is left of the limit
  const room = current ? souvenirsLeft(current) : 0;
  const entries = [];
  for (const tempUri of wanted.slice(0, room)) {
    const id = uid();
    const rawExt = tempUri.split("?")[0].split(".").pop();
    const ext = /^(jpe?g|png|heic|webp|gif)$/i.test(rawExt) ? rawExt : "jpg"; // a content:// URI has no real extension
    const uri = `${DIR}${id}.${ext}`;
    try {
      await FileSystem.copyAsync({ from: tempUri, to: uri });
      entries.push({ id, uri, addedAt: new Date().toISOString() });
      added++;
    } catch (e) {
      // this photo cannot be read: the others still go in
    }
  }
  const updated = await updateTrip(tripId, (t) => ({ ...t, souvenirs: [...souvenirsOf(t), ...entries].slice(0, MAX_SOUVENIRS) }));
  return { trip: updated, added, skipped: wanted.length - added };
}

export async function removeSouvenir(tripId, souvenirId) {
  return updateTrip(tripId, (t) => {
    const photo = souvenirsOf(t).find((s) => s.id === souvenirId);
    if (photo) FileSystem.deleteAsync(photo.uri, { idempotent: true }).catch(() => {}); // fire and forget
    return { ...t, souvenirs: souvenirsOf(t).filter((s) => s.id !== souvenirId) };
  });
}
