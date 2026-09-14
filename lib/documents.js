// Document photos — picked via camera or library, compressed at pick time,
// and copied into a persistent app folder (not just the OS temp/cache dir
// the picker returns, which can be cleared at any time). Only the resulting
// file URI + metadata is stored in the trip object (AsyncStorage has a much
// smaller practical size limit than the web version's localStorage, so we
// never embed base64 image data directly in the JSON).
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { uid } from "./dates";
import { updateTrip } from "./trips";

const DOCS_DIR = FileSystem.documentDirectory + "documents/";

async function ensureDocsDir() {
  const info = await FileSystem.getInfoAsync(DOCS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DOCS_DIR, { intermediates: true });
  }
}

export async function requestImagePermission(source) {
  if (source === "camera") {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status === "granted";
  }
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === "granted";
}

// Returns the temporary picked URI, already compressed (quality 0.6, and
// resized so the longest side is at most ~1600px) — or null if cancelled.
export async function pickImage(source) {
  const granted = await requestImagePermission(source);
  if (!granted) {
    const err = new Error("PERMISSION_DENIED");
    err.code = "PERMISSION_DENIED";
    throw err;
  }
  const options = { quality: 0.6, allowsEditing: false };
  const result =
    source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  return result.assets[0].uri;
}

export async function addDocument(tripId, { title, category, tempUri, scannedCode }) {
  await ensureDocsDir();
  const docId = uid();
  // On Android, gallery picks can return a content:// URI with no real file
  // extension in it — guessing ".jpg" from garbage text used to break the
  // copy entirely. Only trust what we extract if it actually looks like a
  // real image extension; otherwise fall back to a safe default.
  const rawExt = tempUri.split("?")[0].split(".").pop();
  const ext = /^(jpe?g|png|heic|webp|gif)$/i.test(rawExt) ? rawExt : "jpg";
  const destUri = `${DOCS_DIR}${docId}.${ext}`;
  await FileSystem.copyAsync({ from: tempUri, to: destUri });

  return updateTrip(tripId, (trip) => ({
    ...trip,
    documents: [
      ...(trip.documents || []),
      {
        id: docId,
        title: title.trim() || "Document",
        category: category || "autre",
        uri: destUri,
        scannedCode: scannedCode || null,
        addedAt: new Date().toISOString(),
      },
    ],
  }));
}

export async function removeDocument(tripId, documentId) {
  const trip = await updateTrip(tripId, (t) => {
    const doc = (t.documents || []).find((d) => d.id === documentId);
    if (doc) {
      // fire-and-forget file cleanup — don't block the state update on it
      FileSystem.deleteAsync(doc.uri, { idempotent: true }).catch(() => {});
    }
    return { ...t, documents: (t.documents || []).filter((d) => d.id !== documentId) };
  });
  return trip;
}
