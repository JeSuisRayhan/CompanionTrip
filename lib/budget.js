// Pure budget/money math ported directly from the web/PWA version.
import { THEME } from "./theme";

export function formatMoney(amount, code) {
  if (amount === null || amount === undefined || isNaN(amount)) return "";
  const n = Math.round(amount * 100) / 100;
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(n);
  } catch (e) {
    return `${n.toLocaleString("fr-FR")} ${code}`;
  }
}

export function convertAmount(amount, rate) {
  if (amount === null || amount === undefined || isNaN(amount)) return null;
  return amount * (rate || 1);
}

export function deriveStays(trip) {
  const entries = [];
  trip.days.forEach((day, index) => {
    day.activities.forEach((a) => {
      if (a.type === "hotel") entries.push({ dayIndex: index, dayId: day.id, dayTitle: day.title, activity: a });
    });
  });

  const stays = [];
  let current = null;
  entries.forEach((entry) => {
    const norm = entry.activity.title.trim().toLowerCase();
    if (current && current.norm === norm && entry.dayIndex === current.lastDayIndex + 1) {
      current.lastDayIndex = entry.dayIndex;
    } else {
      current = {
        anchorId: entry.activity.id,
        anchorDayId: entry.dayId,
        title: entry.activity.title,
        norm,
        firstDayIndex: entry.dayIndex,
        lastDayIndex: entry.dayIndex,
        firstDayTitle: entry.dayTitle,
        price: entry.activity.price,
      };
      stays.push(current);
    }
  });

  stays.forEach((stay, i) => {
    const next = stays[i + 1];
    const span = next ? next.firstDayIndex - stay.firstDayIndex : trip.days.length - stay.firstDayIndex;
    stay.autoNights = Math.max(1, span);
  });

  return stays;
}

export function stayNightsFor(trip, stay) {
  const override = trip.stayNights && trip.stayNights[stay.anchorId];
  return override != null ? override : stay.autoNights;
}

export function accommodationTotal(trip) {
  return deriveStays(trip).reduce((sum, s) => sum + stayNightsFor(trip, s) * (s.price || 0), 0);
}

export function transportTotal(trip) {
  let total = 0;
  trip.days.forEach((d) => d.activities.forEach((a) => { if (a.type === "transport" && a.price) total += a.price; }));
  return total;
}

export function repasTotal(trip) {
  let total = 0;
  trip.days.forEach((d) => d.activities.forEach((a) => { if (a.type === "repas" && a.price) total += a.price; }));
  return total;
}

export function otherExpensesTotal(trip) {
  return (trip.otherExpenses || []).reduce((sum, e) => sum + (e.price || 0), 0);
}

export function tripActivityTotal(trip) {
  return transportTotal(trip) + repasTotal(trip) + accommodationTotal(trip) + otherExpensesTotal(trip);
}

export function dayActivityTotal(day) {
  return day.activities.reduce((sum, a) => sum + ((a.type === "transport" || a.type === "repas") && a.price ? a.price : 0), 0);
}

export function categoryTotals(trip) {
  return {
    transport: transportTotal(trip),
    hotel: accommodationTotal(trip),
    repas: repasTotal(trip),
    other: otherExpensesTotal(trip),
  };
}

export function budgetProgressColor(pct) {
  if (pct > 100) return THEME.stamp;
  if (pct >= 90) return THEME.gold;
  return THEME.teal;
}
