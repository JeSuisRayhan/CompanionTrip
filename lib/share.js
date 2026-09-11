import { Share } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { resolveDayDate, formatDateLabel } from "./dates";
import { buildTripICS } from "./ics";

export function tripToText(trip) {
  const lines = [trip.name, ""];
  trip.days.forEach((day, index) => {
    const dateISO = resolveDayDate(trip, day, index);
    lines.push(`${day.title}${dateISO ? " — " + formatDateLabel(dateISO) : ""}`);
    const sorted = [...day.activities].sort((a, b) => {
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });
    sorted.forEach((a) => {
      lines.push(`  ${a.time ? a.time + " " : ""}${a.title}`);
    });
    lines.push("");
  });
  return lines.join("\n");
}

export async function shareTripAsText(trip) {
  await Share.share({ message: tripToText(trip), title: trip.name });
}

export async function shareTripAsICS(trip) {
  const ics = buildTripICS(trip);
  const uri = FileSystem.cacheDirectory + `${trip.name.replace(/[^a-z0-9]+/gi, "_")}.ics`;
  await FileSystem.writeAsStringAsync(uri, ics);
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, { mimeType: "text/calendar", dialogTitle: "Exporter le calendrier" });
  }
  return uri;
}
