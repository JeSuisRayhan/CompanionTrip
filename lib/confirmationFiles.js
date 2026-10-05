// The files a booking can be read from: screenshots of an email or of an app, and PDFs (an e-ticket, a hotel voucher).
// They stay on the phone as files until the moment they are read (then they go to the AI as base64).
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { requestImagePermission } from "./documents";
import { describeFile } from "./fileKinds";

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 8 * 1024 * 1024; // one file
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024; // all of them (the AI takes at most 32 Mo per request, and base64 adds a third)

export { describeFile };

function failure(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// Opens the gallery: up to `max` screenshots. [] when cancelled.
export async function pickScreenshots(max = MAX_FILES) {
  if (!(await requestImagePermission("library"))) throw failure("PERMISSION_DENIED", "PERMISSION_DENIED");
  const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: false, allowsMultipleSelection: true, selectionLimit: Math.max(1, max) });
  if (result.canceled || !result.assets) return [];
  const picked = result.assets.map((a) => describeFile({ uri: a.uri, name: a.fileName, mimeType: a.mimeType })).filter(Boolean);
  if (!picked.length && result.assets.length) throw failure("UNSUPPORTED", "Format d'image non pris en charge : utilisez une capture d'écran (PNG ou JPEG).");
  return picked;
}

// Opens the file picker for a PDF. null when cancelled.
export async function pickPdf() {
  const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
  if (result.canceled || !result.assets || !result.assets.length) return null;
  const a = result.assets[0];
  return describeFile({ uri: a.uri, name: a.name, mimeType: a.mimeType || "application/pdf" });
}

// The files with their content, ready for the AI: [{ ...file, base64 }]. Throws when one is too heavy or cannot be read.
export async function loadFiles(files) {
  const out = [];
  let total = 0;
  for (const f of files) {
    let size = null;
    try {
      const info = await FileSystem.getInfoAsync(f.uri, { size: true });
      size = info && info.exists ? info.size : null;
    } catch (e) {
      size = null;
    }
    if (size != null && size > MAX_FILE_BYTES) throw failure("TOO_BIG", `« ${f.name} » est trop lourd (${Math.round(MAX_FILE_BYTES / 1048576)} Mo au plus).`);
    total += size || 0;
    if (total > MAX_TOTAL_BYTES) throw failure("TOO_BIG", "Ces fichiers sont trop lourds ensemble : lisez-les en deux fois.");
    let base64;
    try {
      base64 = await FileSystem.readAsStringAsync(f.uri, { encoding: FileSystem.EncodingType.Base64 });
    } catch (e) {
      throw failure("UNREADABLE", `« ${f.name} » n'a pas pu être ouvert.`);
    }
    if (!base64) throw failure("UNREADABLE", `« ${f.name} » est vide.`);
    out.push({ ...f, base64 });
  }
  return out;
}
