// The places of a trip as a KML file (Google My Maps, Organic Maps, Google Earth…), and the link that opens one
// place in Organic Maps.
import { Linking } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { buildMapModel } from "./map";

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function placemark(pin, label) {
  const desc = [pin.time, pin.categoryLabel, pin.address].filter(Boolean).join(" · ");
  return `    <Placemark>
      <name>${esc(label)}</name>${desc ? `\n      <description>${esc(desc)}</description>` : ""}
      <Point><coordinates>${pin.lng},${pin.lat}</coordinates></Point>
    </Placemark>`;
}

// One folder per day (its places numbered as on the day screen), then the ideas not placed yet.
// Returns { kml, count }.
export function buildTripKML(trip) {
  const model = buildMapModel(trip);
  const folders = [];
  let count = 0;
  const used = new Set();
  for (const day of model.days) {
    if (!day.pins.length) continue;
    const marks = day.pins.map((p) => {
      used.add(p.id);
      count++;
      return placemark(p, `${day.dayIndex + 1}.${p.order} ${p.name}`);
    });
    folders.push(`  <Folder>\n    <name>${esc(`Jour ${day.dayIndex + 1} — ${day.title}`)}</name>\n${marks.join("\n")}\n  </Folder>`);
  }
  const rest = model.pins.filter((p) => !used.has(p.id));
  if (rest.length) {
    count += rest.length;
    folders.push(`  <Folder>\n    <name>Autres lieux</name>\n${rest.map((p) => placemark(p, p.name)).join("\n")}\n  </Folder>`);
  }
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${esc(trip.name)}</name>
${folders.join("\n")}
</Document>
</kml>
`;
  return { kml, count };
}

// Writes the file and opens the share menu (Drive, Organic Maps, e-mail…). Returns how many places it holds.
export async function shareTripAsKML(trip) {
  const { kml, count } = buildTripKML(trip);
  if (!count) return 0;
  const dir = FileSystem.cacheDirectory + "exports/";
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const slug = String(trip.name || "voyage").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "voyage";
  const uri = `${dir}${slug}-lieux.kml`;
  await FileSystem.writeAsStringAsync(uri, kml);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/vnd.google-earth.kml+xml", dialogTitle: "Exporter les lieux" });
  return count;
}

export const ORGANIC_MAPS_STORE = "market://details?id=app.organicmaps";

// Organic Maps' own link: the place shown with its name.
export function organicMapsUrl(pin) {
  return `om://map?v=1&ll=${pin.lat},${pin.lng}&n=${encodeURIComponent(pin.name || "Lieu")}`;
}

// Opens the place in Organic Maps. Without the app: "no" means the store page was offered.
export async function openInOrganicMaps(pin) {
  try {
    await Linking.openURL(organicMapsUrl(pin));
    return "ok";
  } catch (e) {
    return "missing";
  }
}
