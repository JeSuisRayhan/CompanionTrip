// Pure budget/money math ported directly from the web/PWA version.
import { THEME } from "./theme";
import { tripDates, tripStatus } from "./dates";
import { legPrice } from "./leg";

export function formatMoney(amount, code) {
  if (amount === null || amount === undefined || isNaN(amount)) return "";
  const n = Math.round(amount * 100) / 100;
  try {
    // Whole amounts without ",00": "1 200 €" reads faster than "1 200,00 €".
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: code, minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n);
  } catch (e) {
    return `${n.toLocaleString("fr-FR")} ${code}`;
  }
}

// "€", "$", "TND"…: the sign a currency is written with, for a big figure that carries it apart.
export function currencySymbol(code) {
  try {
    const part = new Intl.NumberFormat("fr-FR", { style: "currency", currency: code }).formatToParts(0).find((p) => p.type === "currency");
    return part ? part.value : code;
  } catch (e) {
    return code;
  }
}

// "euros", "dinars": the name of the money a trip is counted in (the code when unknown).
export function currencyName(code) {
  try {
    const name = new Intl.DisplayNames(["fr"], { type: "currency" }).of(code);
    return name ? name.replace(/^dinar tunisien$/i, "dinars").replace(/^euro$/i, "euros") : code;
  } catch (e) {
    return code;
  }
}

// "1 200", "304": the figure alone, rounded, with thin spaces between the thousands.
export function formatFigure(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return "";
  return Math.round(amount).toLocaleString("fr-FR");
}

export function convertAmount(amount, rate) {
  if (amount === null || amount === undefined || isNaN(amount)) return null;
  return amount * (rate || 1);
}

// ---------- Money written in either currency of a trip ----------
// Prices and expenses are kept in the local currency. A person may write an amount in their own currency instead
// ("home"): it is converted with the rate of the trip (what 1 unit of the local currency is worth at home).
export function moneyOf(trip) {
  const home = (trip && (trip.homeCurrency || trip.currency)) || "EUR";
  const local = (trip && trip.currency) || home;
  const rate = trip && trip.rate > 0 ? trip.rate : 1;
  return { home, local, rate, different: local !== home };
}

// An amount written in `entry` ("local" | "home") as a local amount. Four decimals keep the cents of the other currency.
export function toLocalAmount(amount, entry, rate) {
  if (amount === null || amount === undefined || !isFinite(amount)) return null;
  const n = entry === "home" && rate > 0 ? amount / rate : amount;
  return Math.round(n * 10000) / 10000;
}

// A figure typed in one currency as it reads in the other one: what a field shows when its switch is turned, so the
// money stays the same ("1000" € -> "3368,1" TND). from / to: "local" | "home". Unreadable or empty: left as it is.
export function retypeAmount(text, from, to, rate) {
  const n = parseAmount(text);
  if (n == null || n <= 0 || from === to || !(rate > 0)) return text;
  const out = to === "home" ? n * rate : n / rate;
  return String(Math.round(out * 100) / 100).replace(".", ",");
}

// The figure typed in a field ("12,5", "1 200") as a number; null when empty or unreadable.
export function parseAmount(text) {
  const clean = String(text == null ? "" : text).replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  if (!clean) return null;
  const n = parseFloat(clean);
  return isFinite(n) ? n : null;
}

// What a money field's switch says once the trip is known: "home" only when the trip has two currencies.
export function effectiveEntry(money, entry) {
  return money && money.different && entry === "home" ? "home" : "local";
}

// The figure typed in a money field as the local amount kept in the trip; null when empty or unreadable.
export function keptFromTyped(text, money, entry) {
  const n = parseAmount(text);
  if (n == null) return null;
  return toLocalAmount(n, effectiveEntry(money, entry), money && money.rate > 0 ? money.rate : 1);
}

// A saved local amount as a field shows it: "12,5", two decimals at most (the cents of the other currency are not typed back).
export function typedText(amount) {
  if (amount === null || amount === undefined || !isFinite(amount)) return "";
  return String(Math.round(amount * 100) / 100).replace(".", ",");
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
  trip.days.forEach((d) => d.activities.forEach((a) => { if (a.type === "transport" && a.price) total += a.price; total += legPrice(a); }));
  return total;
}

export function repasTotal(trip) {
  let total = 0;
  trip.days.forEach((d) => d.activities.forEach((a) => { if (a.type === "repas" && a.price) total += a.price; }));
  return total;
}

// What was entered as an expense, and the price of the activities (tickets, entrance fees…).
export function otherExpensesTotal(trip) {
  let total = (trip.otherExpenses || []).reduce((sum, e) => sum + (e.price || 0), 0);
  trip.days.forEach((d) => d.activities.forEach((a) => { if (a.type === "activite" && a.price) total += a.price; }));
  return total;
}

export function tripActivityTotal(trip) {
  return transportTotal(trip) + repasTotal(trip) + accommodationTotal(trip) + otherExpensesTotal(trip);
}

export function dayActivityTotal(day) {
  return day.activities.reduce((sum, a) => sum + ((a.type === "transport" || a.type === "repas" || a.type === "activite") && a.price ? a.price : 0) + legPrice(a), 0);
}

// ---------- What is already booked ----------
// The part of the plan that is as good as paid: the stays (with their nights), the long journeys (plane, train,
// boat) and any other priced step ticked "Réservé". Amounts in the local currency, like every price of the trip.
const LONG_JOURNEYS = ["avion", "train", "bateau"];

// The steps an expense was noted from ("Noter la dépense"): what was really spent takes the place of their price,
// so the same money is never counted twice.
function steppedExpenseIds(trip) {
  return new Set((trip.expenses || []).map((e) => e.stepId).filter(Boolean));
}

export function reservedItems(trip) {
  const items = [];
  const spentOn = steppedExpenseIds(trip);
  deriveStays(trip).forEach((stay) => {
    const nights = stayNightsFor(trip, stay);
    items.push({ kind: "stay", id: stay.anchorId, dayId: stay.anchorDayId, dayIndex: stay.firstDayIndex, title: stay.title, nights, amount: nights * (stay.price || 0) });
  });
  trip.days.forEach((day, dayIndex) => {
    day.activities.forEach((a) => {
      if (a.type === "hotel") return; // a stay, counted above
      const priced = typeof a.price === "number" && a.price > 0;
      const journey = a.type === "transport" && LONG_JOURNEYS.includes(a.transportMode);
      if (!priced || !(journey || a.booking === "done")) return;
      items.push({ kind: journey ? a.transportMode : a.type === "transport" ? "autre" : a.type, id: a.id, dayId: day.id, dayIndex, title: a.title, amount: a.price, step: a, spent: spentOn.has(a.id) });
    });
  });
  return items;
}

export function reservedTotal(trip) {
  return reservedItems(trip).reduce((sum, i) => sum + (i.spent ? 0 : i.amount), 0);
}

// What the programme counts on beyond the bookings, by category: the priced meals, rides, visits and the way
// between steps, not booked and not yet spent (local currency). `onlyDone`: just the steps that are done.
export function plannedByCategory(trip, { onlyDone } = {}) {
  const totals = { repas: 0, transport: 0, hotel: 0, other: 0 };
  const spentOn = steppedExpenseIds(trip);
  trip.days.forEach((day) =>
    day.activities.forEach((a) => {
      if (onlyDone && !a.done) return;
      totals.transport += legPrice(a); // the way to a step is transport, whatever the step is
      if (a.type === "hotel" || spentOn.has(a.id)) return; // a stay is booked; a step spent on is counted as spent
      const priced = typeof a.price === "number" && a.price > 0;
      const journey = a.type === "transport" && LONG_JOURNEYS.includes(a.transportMode);
      if (!priced || journey || a.booking === "done") return; // booked: counted in the bookings
      totals[a.type === "transport" ? "transport" : a.type === "repas" ? "repas" : "other"] += a.price;
    })
  );
  if (!onlyDone) totals.other += (trip.otherExpenses || []).reduce((sum, e) => sum + (e.price || 0), 0);
  return totals;
}

export function plannedRest(trip) {
  const t = plannedByCategory(trip);
  return t.repas + t.transport + t.hotel + t.other;
}

// The booked amount of one expense category (hotel / transport / repas / other), local currency.
export function reservedByCategory(trip) {
  const totals = { repas: 0, transport: 0, hotel: 0, other: 0 };
  reservedItems(trip).forEach((i) => {
    if (i.spent) return;
    const key = i.kind === "stay" ? "hotel" : ["avion", "train", "bateau", "autre"].includes(i.kind) ? "transport" : i.kind === "repas" ? "repas" : "other";
    totals[key] += i.amount;
  });
  return totals;
}

export function categoryTotals(trip) {
  return {
    transport: transportTotal(trip),
    hotel: accommodationTotal(trip),
    repas: repasTotal(trip),
    other: otherExpensesTotal(trip),
  };
}

// ---------- What was really spent (entered by hand during the trip) ----------
// The estimate above comes from the steps' prices; expenses are the money actually spent, kept apart.
export const EXPENSE_CATEGORIES = [
  { key: "repas", label: "Repas", icon: "restaurant", tone: "gold" },
  { key: "transport", label: "Transport", icon: "car", tone: "blue" },
  { key: "hotel", label: "Hôtel", icon: "bed", tone: "stamp" },
  { key: "other", label: "Autre", icon: "pricetag", tone: "pink" },
];

export function expenseCategory(expense) {
  return expense && EXPENSE_CATEGORIES.some((c) => c.key === expense.category) ? expense.category : "other";
}

export function expensesTotal(trip) {
  return (trip.expenses || []).reduce((sum, e) => sum + (e.amount || 0), 0);
}

export function expensesByCategory(trip) {
  const totals = { repas: 0, transport: 0, hotel: 0, other: 0 };
  (trip.expenses || []).forEach((e) => { totals[expenseCategory(e)] += e.amount || 0; });
  return totals;
}

export function budgetProgressColor(pct) {
  if (pct > 100) return THEME.stamp;
  if (pct >= 90) return THEME.gold;
  return THEME.teal;
}

// ---------- The budget for the whole trip ----------
// trip.budgetTotal is what the person wants to spend in all (like the targets per category). It is compared with
// what is booked and spent (local currency, converted), and cut into days.
// It is written in the person's own currency, or in the local one: trip.budgetIn is "local" in that case, and the
// figures kept are the ones typed (so 3 000 TND stays 3 000 TND when the rate moves).
export function budgetEntryOf(trip) {
  return trip && trip.budgetIn === "local" && moneyOf(trip).different ? "local" : "home";
}

// What a figure of the budget is worth in the person's own currency.
export function budgetToHome(trip, amount) {
  if (amount === null || amount === undefined || !isFinite(amount)) return null;
  return budgetEntryOf(trip) === "local" ? amount * moneyOf(trip).rate : amount;
}

// The code of the currency the budget is written in.
export function budgetCodeOf(trip) {
  const m = moneyOf(trip);
  return budgetEntryOf(trip) === "local" ? m.local : m.home;
}

// The budget as it was typed, in the currency it was typed in; null without one.
export function budgetTypedOf(trip) {
  const n = trip && trip.budgetTotal;
  return typeof n === "number" && isFinite(n) && n > 0 ? n : null;
}

// The budget total in the person's own currency (null without one).
export function budgetTotalOf(trip) {
  const n = budgetTypedOf(trip);
  return n == null ? null : budgetToHome(trip, n);
}

// The target of a category in the person's own currency (null: no limit).
export function budgetTargetOf(trip, key) {
  const n = trip && trip.budgetTargets ? trip.budgetTargets[key] : null;
  return typeof n === "number" && isFinite(n) && n > 0 ? budgetToHome(trip, n) : null;
}

// "3 200", "3200,50" -> 3200 / 3200.5; nothing usable -> null.
export function parseBudgetInput(text) {
  const n = parseFloat(String(text == null ? "" : text).replace(/[\s\u00a0\u202f]/g, "").replace(",", "."));
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

// Everything in the person's own currency. perDay = what is left, spread over the days still to live
// (today included): moves with every expense noted. null without a budget; perDay null once it is spent or the trip is over.
export function budgetOverview(trip, todayISO) {
  const target = budgetTotalOf(trip);
  if (!target) return null;
  const rate = trip.rate || 1;
  const expenses = trip.expenses || [];
  const spent = expensesTotal(trip) * rate;
  const booked = reservedTotal(trip) * rate;
  const planned = tripActivityTotal(trip) * rate;
  const status = tripStatus(trip, todayISO);
  const daysLeft = status === "past" ? 0 : status === "current" ? tripDates(trip).filter((d) => d >= todayISO).length : trip.days.length;
  // What is left is what the budget keeps after the bookings and after what was spent since.
  const left = target - booked - spent;
  const todaySpent = status === "current" ? expenses.filter((e) => e.date === todayISO).reduce((sum, e) => sum + (e.amount || 0), 0) * rate : 0;
  return {
    target,
    spent,
    booked,
    planned,
    left,
    over: left < 0,
    ratio: Math.min(Math.max(spent / target, 0), 1),
    bookedRatio: Math.min(Math.max(booked / target, 0), 1),
    spentShare: Math.min(Math.max(spent / target, 0), Math.max(0, 1 - Math.min(booked / target, 1))),
    plannedGap: target - planned,
    status,
    daysLeft,
    perDay: daysLeft > 0 && left > 0 ? left / daysLeft : null,
    todaySpent,
  };
}

// The sentences the screens show, so the tab and the Today screen say the same thing.
export function budgetSummary(o, code) {
  const m = (n) => formatMoney(Math.round(n), code);
  const spentLine = o.over ? `Dépassé de ${m(-o.left)}` : `Reste ${m(o.left)}`;
  let perDayLine = null;
  if (o.perDay != null) perDayLine = o.daysLeft === 1 ? `≈ ${m(o.perDay)} pour la journée` : `≈ ${m(o.perDay)} par jour sur ${o.daysLeft} jours`;
  let plannedLine = null;
  if (o.status !== "past" && o.planned > 0) plannedLine = o.planned > o.target ? `Le prévu (${m(o.planned)}) dépasse le budget de ${m(o.planned - o.target)}` : `Prévu ${m(o.planned)} · marge de ${m(o.target - o.planned)}`;
  return {
    spentLine,
    perDayLine,
    plannedLine,
    plannedOver: o.planned > o.target,
    todayLine: o.todaySpent > 0 ? `${m(o.todaySpent)} dépensés aujourd'hui` : null,
  };
}
