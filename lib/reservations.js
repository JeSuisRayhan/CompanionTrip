// The bookings of a trip as the lines of its overview: the journeys by mode, then the stays. Pure rules.
import { reservedItems } from "./budget";
import { resolveDayDate, formatShortDate } from "./dates";

const MODES = {
  avion: { icon: "airplane", tone: "blue", one: "Vol", many: "Vols", unit: "vol" },
  train: { icon: "train", tone: "blue", one: "Train", many: "Trains", unit: "train" },
  bateau: { icon: "boat", tone: "blue", one: "Bateau", many: "Bateaux", unit: "traversée" },
  autre: { icon: "car", tone: "blue", one: "Transport", many: "Transports", unit: "trajet" },
};

// "4 janv." · "4 et 8 janv." · "4 janv. – 8 févr." — the days a booking falls on.
export function listDates(dates) {
  const list = [...new Set(dates.filter(Boolean))].sort();
  if (!list.length) return "";
  const d = (iso) => formatShortDate(iso, false);
  if (list.length === 1) return d(list[0]);
  const first = new Date(list[0] + "T00:00:00");
  const last = new Date(list[list.length - 1] + "T00:00:00");
  const sameMonth = first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear();
  if (list.length === 2) return sameMonth ? `${first.getDate()} et ${d(list[1])}` : `${d(list[0])} et ${d(list[1])}`;
  return `${d(list[0])} – ${d(list[list.length - 1])}`;
}

// [{ key, kind, icon, tone, title, subtitle, amount, dayId, stepId }]; amount in the local currency (0 when unknown).
export function reservationRows(trip) {
  const items = reservedItems(trip);
  const dateOf = (item) => {
    const day = trip.days[item.dayIndex];
    return day ? resolveDayDate(trip, day, item.dayIndex) : null;
  };
  const rows = [];

  // Journeys: one line per mode (all the flights together), in the order of the trip.
  const journeyKinds = ["avion", "train", "bateau", "autre"];
  journeyKinds.forEach((kind) => {
    const group = items.filter((i) => i.kind === kind);
    if (!group.length) return;
    const m = MODES[kind];
    const dates = listDates(group.map(dateOf));
    const amount = group.reduce((sum, i) => sum + i.amount, 0);
    const alone = group.length === 1;
    const roundTrip = kind === "avion" && group.length === 2;
    rows.push({
      key: `mode-${kind}`,
      kind,
      icon: m.icon,
      tone: m.tone,
      title: alone ? group[0].title : roundTrip ? "Vols aller-retour" : `${m.many} réservés`,
      subtitle: alone ? dates : `${group.length} ${m.unit}${group.length > 1 && kind !== "bateau" ? "s" : ""}${kind === "bateau" && group.length > 1 ? "s" : ""} · ${dates}`,
      amount,
      dayId: group[0].dayId,
      dayIndex: group[0].dayIndex,
      first: dateOf(group[0]),
    });
  });

  // The stays and the other booked steps, each on its own line.
  items
    .filter((i) => i.kind === "stay")
    .forEach((i) => {
      const day = trip.days[i.dayIndex];
      const step = day && day.activities.find((a) => a.id === i.id);
      const where = step && step.address ? String(step.address).split(",")[0].trim() : null;
      rows.push({
        key: `stay-${i.id}`,
        kind: "stay",
        icon: "bed",
        tone: "stamp",
        title: i.title,
        subtitle: [where, `${i.nights} nuit${i.nights > 1 ? "s" : ""}`].filter(Boolean).join(" · "),
        amount: i.amount,
        dayId: i.dayId,
        dayIndex: i.dayIndex,
        first: dateOf(i),
      });
    });
  items
    .filter((i) => !["stay", ...journeyKinds].includes(i.kind))
    .forEach((i) => {
      rows.push({
        key: `step-${i.id}`,
        kind: i.kind,
        icon: i.kind === "repas" ? "restaurant" : "ticket",
        tone: i.kind === "repas" ? "gold" : "teal",
        title: i.title,
        subtitle: listDates([dateOf(i)]),
        amount: i.amount,
        dayId: i.dayId,
        dayIndex: i.dayIndex,
        first: dateOf(i),
      });
    });

  // In the order of the trip.
  return rows.sort((a, b) => (a.first || "9").localeCompare(b.first || "9") || a.dayIndex - b.dayIndex);
}
