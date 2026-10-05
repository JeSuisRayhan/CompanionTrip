// Which files a booking can be read from: pictures (screenshots, photos) and PDFs.
export const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/heic", "image/heif"];
const EXT_MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", bmp: "image/bmp", heic: "image/heic", heif: "image/heif", pdf: "application/pdf" };

const extOf = (uri) => String(uri || "").split("?")[0].split(".").pop().toLowerCase();

// { uri, name, mimeType } -> { uri, name, kind: "image" | "pdf", mime }, or null when it is neither a picture nor a PDF.
// The type is the one the system gave, else the one the file name says.
export function describeFile({ uri, name, mimeType }) {
  const ext = extOf(name || uri);
  const mime = String(mimeType || "").toLowerCase() || EXT_MIME[ext] || "";
  if (mime === "application/pdf") return { uri, name: name || "Document.pdf", kind: "pdf", mime };
  const image = mime === "image/jpg" ? "image/jpeg" : mime;
  if (IMAGE_MIMES.includes(image)) return { uri, name: name || "Capture", kind: "image", mime: image };
  return null;
}
