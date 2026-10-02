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

// The three drawers of the Documents tab. "autre" is also what any older or unknown category (e.g. "other") falls into.
export const DOCUMENT_CATEGORIES = [
  { key: "hotel", label: "Hébergement", icon: "bed-outline", tone: "stamp" },
  { key: "transport", label: "Transport", icon: "airplane-outline", tone: "blue" },
  { key: "autre", label: "Autres", icon: "documents-outline", tone: "teal" },
];

export function documentCategory(doc) {
  const c = doc && doc.category;
  return c === "hotel" || c === "transport" ? c : "autre";
}

// Where a new document most likely belongs: a ticket for a flight or train day, or a scanned boarding pass, is
// transport; a title that speaks of a hotel or a rental is accommodation. The person can change it.
export function suggestDocumentCategory(trip, { title, scannedCode, dayId } = {}) {
  const day = dayId && trip ? (trip.days || []).find((d) => d.id === dayId) : null;
  if (day && day.dayType === "flight") return "transport";
  if (scannedCode) return "transport";
  if (/h[ôo]tel|airbnb|booking|logement|auberge|r[ée]sidence|ryokan/i.test(String(title || ""))) return "hotel";
  return "autre";
}

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

// dayId: the day a ticket was added for (a flight or train day), so the day can show it.
export async function addDocument(tripId, { title, category, tempUri, scannedCode, dayId }) {
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
        dayId: dayId || null,
        addedAt: new Date().toISOString(),
      },
    ],
  }));
}

export async function setDocumentCategory(tripId, documentId, category) {
  const key = category === "hotel" || category === "transport" ? category : "autre";
  return updateTrip(tripId, (t) => ({ ...t, documents: (t.documents || []).map((d) => (d.id === documentId ? { ...d, category: key } : d)) }));
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
