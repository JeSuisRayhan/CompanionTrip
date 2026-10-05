// The files a booking can be read from: screenshots of an email or of an app, and PDFs (an e-ticket, a hotel voucher).
// They are read on the phone, nothing leaves it: a picture goes through the phone's text recognition, a PDF gives its
// own text. The text is then read like a pasted one (lib/confirmation.js).
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { requestImagePermission } from "./documents";
import { describeFile } from "./fileKinds";

// The two readers are native pieces, only in the builds made after they were added: in an older build they are missing
// and reading a file says so, instead of breaking the app.
let Recognition = null;
let PdfText = null;
try {
  Recognition = require("expo-text-extractor");
} catch (e) {
  Recognition = null;
}
try {
  PdfText = require("expo-pdf-text-extract");
} catch (e) {
  PdfText = null;
}

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_TEXT_CHARS = 12000; // of one file: a ticket is on its first pages, the conditions that follow only add noise

export { describeFile };

function failure(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// Opens the gallery: up to `max` screenshots. [] when cancelled.
export async function pickScreenshots(max = MAX_FILES) {
  if (!(await requestImagePermission("library"))) throw failure("PERMISSION_DENIED", "PERMISSION_DENIED");
  const result = await ImagePicker.launchImageLibraryAsync({ quality: 1, allowsEditing: false, allowsMultipleSelection: true, selectionLimit: Math.max(1, max) });
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

// The readers want a path, not an address: "file:///a/b%20c.pdf" -> "/a/b c.pdf". A content:// address stays as it is.
export function localPath(uri) {
  const raw = String(uri || "");
  if (!raw.startsWith("file://")) return raw;
  const path = raw.slice("file://".length);
  try {
    return decodeURI(path);
  } catch (e) {
    return path;
  }
}

const clip = (text) => String(text || "").replace(/\r/g, "").trim().slice(0, MAX_TEXT_CHARS);

async function textOfPdf(file) {
  if (!PdfText || !PdfText.isAvailable()) throw failure("NO_READER", "Ce build de l'application ne sait pas encore lire les PDF : installez la dernière version.");
  try {
    return clip(await PdfText.extractText(localPath(file.uri)));
  } catch (e) {
    if (e && (e.code === "PASSWORD_REQUIRED" || e.code === "INCORRECT_PASSWORD")) {
      throw failure("PDF_LOCKED", `« ${file.name} » est protégé par un mot de passe : ouvrez-le, puis partagez ou choisissez une capture d'écran.`);
    }
    throw failure("UNREADABLE", `« ${file.name} » n'a pas pu être ouvert.`);
  }
}

async function textOfImage(file) {
  if (!Recognition || !Recognition.isSupported) throw failure("NO_READER", "Ce build de l'application ne sait pas encore lire les captures : installez la dernière version.");
  try {
    const blocks = await Recognition.extractTextFromImage(localPath(file.uri));
    return clip((blocks || []).join("\n"));
  } catch (e) {
    // the text reader of the phone (Google) downloads its model the first time it is used
    if (/download|model|module|play services|gms/i.test(String((e && e.message) || ""))) {
      throw failure("READER_NOT_READY", "Le lecteur de texte du téléphone n'est pas encore prêt : connectez-vous à Internet une fois, patientez un instant et réessayez.");
    }
    throw failure("UNREADABLE", `« ${file.name} » n'a pas pu être lu.`);
  }
}

// The text of each file, read on the phone: [{ ...file, text }]. A text can be empty (a PDF that is a scan, a picture with
// no writing): the screen tells the person which one. Throws, with a code, when a file cannot be read at all.
export async function readFiles(files) {
  const out = [];
  for (const f of files) {
    let size = null;
    try {
      const info = await FileSystem.getInfoAsync(f.uri, { size: true });
      size = info && info.exists ? info.size : null;
    } catch (e) {
      size = null;
    }
    if (size != null && size > MAX_FILE_BYTES) throw failure("TOO_BIG", `« ${f.name} » est trop lourd (${Math.round(MAX_FILE_BYTES / 1048576)} Mo au plus).`);
    out.push({ ...f, text: f.kind === "pdf" ? await textOfPdf(f) : await textOfImage(f) });
  }
  return out;
}
