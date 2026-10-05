// The summary of a trip: what was done, how far, what it cost against what was planned. Pure functions.
import { tripRange, formatDateRange } from "./dates";
import { tripActivityTotal, expensesTotal, expensesByCategory, formatMoney } from "./budget";
import { dayLegs } from "./travelTime";

function orderedSteps(day) {
  return (day.activities || [])
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (x.a.time || "99:99").localeCompare(y.a.time || "99:99") || x.i - y.i)
    .map((x) => x.a);
}

const isParkDay = (trip, day) => trip.tripType === "park" || day.dayType === "park";

// { name, start, end, dayCount,
//   steps: { total, done },            // `done` is 0 when the person never ticked a step: then it says nothing
//   busiest: { dayNumber, title, count } | null,   // the day with most steps done (at least 2)
//   distanceKm, legCount,              // straight-line distance between consecutive steps that have a place
//   money: { currency, planned, spent, expenseCount, byCategory } | null,
//   photos }
export function tripRecap(trip) {
  const { start, end } = tripRange(trip);
  const days = trip.days || [];
  let total = 0;
  let done = 0;
  let busiest = null;
  let distanceKm = 0;
  let legCount = 0;
  days.forEach((day, index) => {
    const steps = day.activities || [];
    const doneHere = steps.filter((a) => a.done).length;
    total += steps.length;
    done += doneHere;
    if (doneHere >= 2 && (!busiest || doneHere > busiest.count)) busiest = { dayNumber: index + 1, title: day.title || `Jour ${index + 1}`, count: doneHere };
    if (!isParkDay(trip, day)) {
      dayLegs(trip, orderedSteps(day)).forEach((leg) => {
        distanceKm += leg.km;
        legCount++;
      });
    }
  });
  const expenses = trip.expenses || [];
  const planned = tripActivityTotal(trip);
  const spent = expensesTotal(trip);
  const money = planned > 0 || expenses.length > 0 ? { currency: trip.currency || "EUR", planned, spent, expenseCount: expenses.length, byCategory: expensesByCategory(trip) } : null;
  return {
    name: trip.name || "Voyage",
    start,
    end,
    dayCount: days.length,
    steps: { total, done },
    busiest,
    distanceKm: Math.round(distanceKm),
    legCount,
    money,
    photos: Array.isArray(trip.souvenirs) ? trip.souvenirs.length : 0,
  };
}

const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

// "Spent X of Y planned": the sentence under the amounts, or null when nothing was spent.
export function moneyVerdict(money) {
  if (!money || money.spent <= 0) return null;
  if (money.planned <= 0) return null;
  const diff = money.spent - money.planned;
  if (Math.abs(diff) < 0.5) return "Pile sur le prévu";
  return diff > 0 ? `Dépassé de ${formatMoney(diff, money.currency)} sur le prévu` : `${formatMoney(-diff, money.currency)} de moins que prévu`;
}

// The summary as text to send to someone: short, one line per fact.
export function recapText(recap) {
  const lines = [recap.name];
  if (recap.start) lines.push(`${formatDateRange(recap.start, recap.end)} · ${plural(recap.dayCount, "jour", "jours")}`);
  else lines.push(plural(recap.dayCount, "jour", "jours"));
  if (recap.steps.done > 0) lines.push(`${recap.steps.done} étape${recap.steps.done > 1 ? "s" : ""} sur ${recap.steps.total} faite${recap.steps.done > 1 ? "s" : ""}`);
  else if (recap.steps.total > 0) lines.push(plural(recap.steps.total, "étape", "étapes") + " au programme");
  if (recap.legCount > 0 && recap.distanceKm > 0) lines.push(`Environ ${recap.distanceKm} km entre les étapes`);
  if (recap.money && recap.money.spent > 0) {
    lines.push(`Dépensé : ${formatMoney(recap.money.spent, recap.money.currency)}${recap.money.planned > 0 ? ` (prévu : ${formatMoney(recap.money.planned, recap.money.currency)})` : ""}`);
  }
  if (recap.photos > 0) lines.push(plural(recap.photos, "photo souvenir", "photos souvenirs"));
  return lines.join("\n");
}
