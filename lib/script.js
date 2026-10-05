// Script parsing & deterministic reformatting, ported directly from the web
// version. This is the part that took the most iteration (see the app's
// conversation history) — never invents content, only reaches for AI as a
// genuine last resort.
import { pad2, uid, resolveDayDate } from "./dates";

export function typeFromTag(tag) {
  const t = (tag || "").toLowerCase();
  if (t.includes("hotel") || t.includes("hôtel") || t.includes("logement")) return "hotel";
  if (
    t.includes("transport") || t.includes("trajet") || t.includes("train") || t.includes("avion") ||
    t.includes("vol") || t.includes("bus") || t.includes("navette") || t.includes("taxi") || t.includes("métro")
  )
    return "transport";
  if (t.includes("repas") || t.includes("resto") || t.includes("restaurant") || t.includes("déjeuner") || t.includes("dîner") || t.includes("petit"))
    return "repas";
  return "activite";
}

export function guessTypeFromBody(body) {
  const t = (body || "").toLowerCase();
  if (t.includes("check-in") || t.includes("check in") || t.includes("checkin")) return "hotel";
  const transportKeywords = [
    "transport", "trajet", "train", "avion", "vol ", "bus", "navette", "traversée",
    "correspondance", "en voiture", "en bateau", "en ferry", "en métro", "en taxi",
    "on va jusqu", "on se rend", "route vers", "route pour", "direction ",
  ];
  if (transportKeywords.some((k) => t.includes(k))) return "transport";
  if (t.includes("repas") || t.includes("resto") || t.includes("restaurant") || t.includes("déjeuner") || t.includes("dîner") || t.includes("petit"))
    return "repas";
  return "activite";
}

export function scriptHasDayHeaderLine(text) {
  return /^\s*(?:(?:jour|day|j)\s*[\s\-.:]*\s*\d+|(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b|\d{1,2}[\/\-.]\d{1,2})/im.test(
    text
  );
}

export function detectTransportMode(title) {
  const t = (title || "").toLowerCase();
  if (t.includes("avion") || t.includes("vol ")) return "avion";
  if (t.includes("train")) return "train";
  if (t.includes("bus") || t.includes("car ")) return "bus";
  if (t.includes("voiture") || t.includes("taxi") || t.includes("uber")) return "voiture";
  if (t.includes("bateau") || t.includes("ferry")) return "bateau";
  return null;
}

export function heuristicReformatScript(raw) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const AP = "['\u2019]"; // tolerate both straight ' and curly ’ apostrophes
  const PLAIN_CONNECTORS_SIMPLE = [
    "ensuite", "puis", "après ça", "après cela", "après quoi",
    "plus tard", "pour finir", "et enfin", "enfin",
    "et on a", "et on est", "on a ensuite", "avant de", "avant ça",
  ];
  const plainConnectorRe = new RegExp(
    "\\b(?:" + PLAIN_CONNECTORS_SIMPLE.map(esc).join("|") + "|après(?!-midi))\\b",
    "gi"
  );
  const timeLedConnectorRe = new RegExp(
    "\\bet\\s+(?=le matin\\b|en matin[ée]e\\b|[aà]\\s+midi\\b|le soir\\b|en soir[ée]e\\b|l" + AP + "apr[eè]s-midi\\b|vers\\s+\\d)",
    "gi"
  );

  const TIME_WORDS = [
    { re: new RegExp("\\bd[ée]but d" + AP + "apr[eè]s-midi\\b", "i"), time: "14:00" },
    { re: /\bfin d['\u2019]apr[eè]s-midi\b/i, time: "17:00" },
    { re: new RegExp("\\bl" + AP + "apr[eè]s-midi\\b|\\bapr[eè]s-midi\\b", "i"), time: "14:30" },
    { re: /\ble matin\b|\ben matin[ée]e\b/i, time: "09:00" },
    { re: /\bmidi\b/i, time: "12:00" },
    { re: /\ble soir\b|\ben soir[ée]e\b|\bce soir\b/i, time: "19:00" },
    { re: /\bla nuit\b/i, time: "22:00" },
    { re: /\bfin de journ[ée]e\b/i, time: "18:00" },
  ];
  const explicitTimeRe = /(?:vers\s+|à\s+|a\s+)?(\d{1,2})[h:](\d{2})?\b/i;

  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const segments = [];
  lines.forEach((line) => {
    const sentences = line.split(/(?<=[.;])\s+/).filter(Boolean);
    sentences.forEach((sentence) => {
      sentence
        .split(timeLedConnectorRe)
        .flatMap((chunk) => chunk.split(plainConnectorRe))
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((p) => segments.push(p));
    });
  });

  const activities = [];
  segments.forEach((seg) => {
    let time = null;
    const explicit = seg.match(explicitTimeRe);
    if (explicit) {
      time = `${pad2(+explicit[1])}:${explicit[2] || "00"}`;
    } else {
      const found = TIME_WORDS.find((tw) => tw.re.test(seg));
      if (found) time = found.time;
    }
    let title = seg
      .replace(explicitTimeRe, "")
      .replace(/^(on a|on est all[ée]e?s?|nous avons|nous sommes all[ée]e?s?|on part(?:s)? pour|on va(?:it)?)\s+/i, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^[-,;:\s]+|[-,;:\s]+$/g, "")
      .trim();
    if (!title) return;
    title = title.charAt(0).toUpperCase() + title.slice(1);
    activities.push({ time, title, type: guessTypeFromBody(title) });
  });

  if (activities.length === 0 || !activities.some((a) => a.time)) return raw;

  const timed = activities.filter((a) => a.time).sort((a, b) => a.time.localeCompare(b.time));
  const untimed = activities.filter((a) => !a.time);
  const ordered = [...timed, ...untimed];

  const out = ["Jour 1"];
  ordered.forEach((a) => {
    const tag = a.type !== "activite" ? ` [${a.type}]` : "";
    out.push(`${a.time || ""} ${a.title}${tag}`.trim());
  });
  return out.join("\n");
}

// "Tokyo DisneySea (1-13 Maihama, Urayasu, Chiba)" -> the name and, apart, the
// address. Only a closing parenthesis that reads like an address is taken (a
// comma or a street number / postcode, and not a time): "(American Waterfront)"
// or "(réservé)" stay in the title.
export function splitTitlePlace(title) {
  const text = String(title || "");
  const m = text.match(/^(.*\S)\s*\(([^()]{10,})\)\s*$/);
  if (!m) return { title: text, place: null };
  const inner = m[2].trim();
  const isTime = /\b\d{1,2}\s*(?:h|:)\s*\d{0,2}\b/i.test(inner);
  if (isTime || !/,|\d{2,}/.test(inner)) return { title: text, place: null };
  return { title: m[1].trim(), place: inner };
}

// ---------- Prices and nights written in a step ----------
// "Vol Paris → Tokyo [transport] 850 €", "Check-in APA hôtel (Shinjuku, Tokyo) [hôtel] 3 nuits - 450 €",
// "Hôtel 90 €/nuit", "Dîner 15 euros". Only euros are read (a trip starts in euros): an amount in yen or
// dollars stays in the text. For a hotel the amount is what the stay cost in all, unless it says "/nuit".
const NUMBER = "\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?";
const MONEY_AFTER_RE = new RegExp("(^|[^\\d.,])(" + NUMBER + ")\\s*(?:€|euros?\\b|eur\\b)", "i");
const MONEY_BEFORE_RE = new RegExp("(^|[^\\w])€\\s*(" + NUMBER + ")", "i");
const PER_NIGHT_RE = /^\s*(?:\/\s*|par\s+|la\s+|chaque\s+)nuit(?:ée)?s?(?![a-zà-ÿ])/i;
const NIGHTS_RE = /(^|[^\w])(?:pour\s+)?(\d{1,2})\s*nuit(?:ée)?s?(?![a-zà-ÿ])/i;

function toAmount(text) {
  const n = parseFloat(String(text).replace(/[ \u00a0\u202f]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Separators left behind where an amount was cut out ("(450 €)", "- 3 nuits -").
function tidyAfterCut(text) {
  return text
    .replace(/\(\s*[-–—,;:]*\s*\)/g, " ")
    .replace(/(?:\s*[-–—,;:]\s*){2,}/g, " - ")
    .replace(/\s+(?=\[[^\]]*\]\s*$)/, " ")
    .replace(/[\s\-–—,;:]+(?=\[[^\]]*\]\s*$)/, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-–—,;:]+|[\s\-–—,;:]+$/g, "");
}

// What a line says about money and nights, and the line without it.
export function takeMoneyAndNights(text) {
  let rest = String(text || "");
  let amount = null;
  let perNight = false;
  let nights = null;
  const after = rest.match(MONEY_AFTER_RE);
  if (after) {
    amount = toAmount(after[2]);
    const start = after.index + after[1].length;
    let end = after.index + after[0].length;
    const tail = rest.slice(end).match(PER_NIGHT_RE);
    if (tail) {
      perNight = true;
      end += tail[0].length;
    }
    rest = rest.slice(0, start) + " " + rest.slice(end);
  } else {
    const before = rest.match(MONEY_BEFORE_RE);
    if (before) {
      amount = toAmount(before[2]);
      const start = before.index + before[1].length;
      let end = before.index + before[0].length;
      const tail = rest.slice(end).match(PER_NIGHT_RE);
      if (tail) {
        perNight = true;
        end += tail[0].length;
      }
      rest = rest.slice(0, start) + " " + rest.slice(end);
    }
  }
  const n = rest.match(NIGHTS_RE);
  if (n) {
    nights = parseInt(n[2], 10);
    const start = n.index + n[1].length;
    rest = rest.slice(0, start) + " " + rest.slice(n.index + n[0].length);
  }
  if (amount == null && nights == null) return { text: String(text || "").trim(), price: null, perNight: false, nights: null };
  return { text: tidyAfterCut(rest), price: amount, perNight, nights: nights >= 1 ? nights : null };
}

// A parsed step: its title, and its address when the title carried one.
function stepFields(body) {
  const { title, place } = splitTitlePlace(body);
  return place ? { title, address: place } : { title };
}

export function parseScript(text, tripStartDate) {
  const lines = text.split("\n").map((l) => l.trim().replace(/^[-*•·]\s+/, ""));
  const days = [];
  let current = null;

  const dayHeaderRe = /^(jour|day|j)\s*[\s\-.:]*\s*(\d+)(.*)$/i;
  const isoDateRe = /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/;
  const frDateRe = /(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/;
  const activityRe = /^(\d{1,2})[h:](\d{2})?\s*[-:–]?\s*(.+)$/;
  const tagRe = /\[([^\]]+)\]\s*$/;
  const weekdayRe = /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/i;
  const bareDateLeadRe = /^\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?\b/;
  const money = new Map(); // hotel step -> what its line said (amount, per night or in all, nights)

  // The amount goes on the step; for a hotel it waits for the nights (see below).
  function setMoney(activity, found) {
    if (found.price == null && found.nights == null) return;
    if (activity.type === "hotel") money.set(activity, found);
    else if (found.price != null && activity.price == null) activity.price = found.price;
  }

  for (const raw of lines) {
    if (!raw) continue;
    const dayMatch = raw.match(dayHeaderRe);
    const looksLikeUntaggedDayHeader = !dayMatch && !activityRe.test(raw) && (weekdayRe.test(raw) || bareDateLeadRe.test(raw));
    if (dayMatch || looksLikeUntaggedDayHeader) {
      const rest = dayMatch ? dayMatch[3] || "" : raw;
      let explicitDate = null;
      const isoM = rest.match(isoDateRe);
      if (isoM) {
        explicitDate = `${isoM[1]}-${pad2(+isoM[2])}-${pad2(+isoM[3])}`;
      } else {
        const frM = rest.match(frDateRe);
        if (frM) {
          const yr = frM[3] ? (frM[3].length === 2 ? "20" + frM[3] : frM[3]) : new Date().getFullYear();
          explicitDate = `${yr}-${pad2(+frM[2])}-${pad2(+frM[1])}`;
        }
      }
      const label = rest
        .replace(isoDateRe, "")
        .replace(frDateRe, "")
        .replace(/^[\s\-–:.,]+/, "")
        .trim();
      current = {
        id: uid(),
        title: label || `Jour ${dayMatch ? dayMatch[2] : days.length + 1}`,
        date: explicitDate,
        activities: [],
        notes: "",
      };
      days.push(current);
      continue;
    }
    if (!current) {
      current = { id: uid(), title: "Jour 1", date: null, activities: [], notes: "" };
      days.push(current);
    }
    const actMatch = raw.match(activityRe);
    if (actMatch) {
      const found = takeMoneyAndNights(actMatch[3].trim());
      let body = found.text;
      let type = "activite";
      const tagMatch = body.match(tagRe);
      if (tagMatch) {
        type = typeFromTag(tagMatch[1]);
        body = body.replace(tagRe, "").trim();
      } else {
        type = guessTypeFromBody(body);
      }
      const step = {
        id: uid(),
        time: `${pad2(+actMatch[1])}:${actMatch[2] || "00"}`,
        ...stepFields(body),
        note: "",
        type,
        price: null,
        transportMode: type === "transport" ? detectTransportMode(body) : null,
        confirmationCode: null,
      };
      setMoney(step, found);
      current.activities.push(step);
    } else {
      const found = takeMoneyAndNights(raw);
      const tagMatch = found.text.match(tagRe);
      let body = found.text;
      let type = "activite";
      if (tagMatch) {
        type = typeFromTag(tagMatch[1]);
        body = found.text.replace(tagRe, "").trim();
      }
      if (current.activities.length && !tagMatch) {
        // a line of comment under a step: an amount in it is that step's
        const last = current.activities[current.activities.length - 1];
        setMoney(last, found);
        if (body) last.note += (last.note ? " " : "") + body;
      } else {
        const step = {
          id: uid(),
          time: null,
          ...stepFields(body),
          note: "",
          type,
          price: null,
          transportMode: type === "transport" ? detectTransportMode(body) : null,
          confirmationCode: null,
        };
        setMoney(step, found);
        current.activities.push(step);
      }
    }
  }

  registerStays(days, money);
  return days;
}

// Every hotel check-in of a script is a stay of the Hôtels screen: it is tagged with a `stayId`, gets the
// number of nights written in the line ("3 nuits") or else the days up to the next hotel (the end of the
// script for the last one), and its price becomes a price per night, so the budget counts what was paid.
// The same hotel on the next day is the same stay. `nights` is moved to the trip's `stayNights` when the
// trip is built (buildNewTrip).
function registerStays(days, money) {
  const stays = [];
  days.forEach((day, dayIndex) => {
    day.activities.forEach((a) => {
      if (a.type !== "hotel") return;
      const norm = String(a.title || "").trim().toLowerCase();
      const last = stays[stays.length - 1];
      if (last && last.norm === norm && dayIndex === last.lastDayIndex + 1) {
        last.lastDayIndex = dayIndex;
        return;
      }
      stays.push({ activity: a, norm, firstDayIndex: dayIndex, lastDayIndex: dayIndex });
    });
  });
  stays.forEach((stay, i) => {
    const next = stays[i + 1];
    const said = money.get(stay.activity) || {};
    const nights = said.nights || Math.max(1, (next ? next.firstDayIndex : days.length) - stay.firstDayIndex);
    stay.activity.stayId = uid();
    stay.activity.nights = nights;
    if (said.price != null) {
      const perNight = said.perNight ? said.price : said.price / nights;
      stay.activity.price = Math.round(perNight * 10000) / 10000;
    }
  });
}

// ---------- A script pasted into a trip that already exists ----------
// The trip is completed, never rebuilt (what was ticked, noted or attached stays): the script's days are
// matched to the trip's days by date, else by order; its steps to the day's steps by title. A step that is
// found gets the script's price, its address if it had none, and its hotel stay (nights, price per night);
// a step that is not found is added; a day beyond the trip's is added at the end. The script has the last
// word on prices and on nights. Amounts are in euros: turned into the trip's currency when it has another one.

function normTitle(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sameStep(a, b) {
  const x = normTitle(a.title);
  const y = normTitle(b.title);
  if (!x || !y) return false;
  return x === y || (Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x)));
}

export function mergeScriptIntoTrip(trip, text) {
  const parsed = parseScript(text, trip.startDate || null);
  const stats = { priced: 0, stays: 0, addedSteps: 0, addedDays: 0 };
  const days = trip.days.map((d) => ({ ...d, activities: [...d.activities] }));
  const stayNights = { ...(trip.stayNights || {}) };
  const taken = new Set(); // days of the trip already matched by a day of the script
  const dateOf = (k) => resolveDayDate({ ...trip, days }, days[k], k);
  const money = (euros, decimals = 100) => {
    if (euros == null) return null;
    const inTrip = trip.currency && trip.currency !== "EUR" && trip.homeCurrency === "EUR" && trip.rate > 0 ? euros / trip.rate : euros;
    return Math.round(inTrip * decimals) / decimals;
  };

  parsed.forEach((pd, i) => {
    let di = -1;
    if (pd.date) di = days.findIndex((d, k) => !taken.has(k) && dateOf(k) === pd.date);
    if (di === -1 && i < days.length && !taken.has(i) && (!pd.date || !dateOf(i) || dateOf(i) === pd.date)) di = i;
    if (di === -1) {
      days.push({ id: uid(), title: pd.title, date: pd.date, activities: [], notes: "" });
      di = days.length - 1;
      stats.addedDays++;
    }
    taken.add(di);

    const matched = new Set();
    pd.activities.forEach((ps) => {
      const { nights, ...step } = ps;
      const at = days[di].activities.findIndex((a) => !matched.has(a.id) && sameStep(a, step));
      if (at === -1) {
        const added = { ...step, id: uid(), price: ps.type === "hotel" ? money(ps.price, 10000) : money(ps.price) };
        if (ps.type === "hotel" && ps.stayId) {
          stayNights[added.id] = nights;
          stats.stays++;
        }
        days[di].activities.push(added);
        matched.add(added.id);
        stats.addedSteps++;
        return;
      }
      const current = days[di].activities[at];
      matched.add(current.id);
      const next = { ...current };
      if (!current.address && step.address) next.address = step.address;
      if (ps.type === "hotel" && current.type === "hotel") {
        if (ps.stayId) {
          const already = !!current.stayId && stayNights[current.id] === nights;
          next.stayId = current.stayId || ps.stayId;
          stayNights[current.id] = nights;
          if (!already) stats.stays++;
        }
        if (ps.price != null && money(ps.price, 10000) !== current.price) {
          next.price = money(ps.price, 10000);
          stats.priced++;
        }
      } else if (ps.type !== "hotel" && ps.price != null && money(ps.price) !== current.price) {
        next.price = money(ps.price);
        stats.priced++;
      }
      days[di].activities[at] = next;
    });
  });

  return { trip: { ...trip, days, stayNights }, stats };
}

// ---------- AI script normalization (genuine last resort only) ----------

export const SCRIPT_FORMAT_SYSTEM = `Tu es un outil de reformatage de texte, pas un assistant conversationnel. Tu ne réponds JAMAIS à des questions, tu ne donnes JAMAIS d'explication ni de commentaire. Ta seule tâche : transformer le texte fourni (un programme de voyage, même mal écrit, en vrac ou dans une autre langue) dans le format exact ci-dessous, puis répondre uniquement avec ce résultat.

FORMAT DE SORTIE :
Jour N - AAAA-MM-JJ - Titre court
HH:MM Titre de l'étape [type]

RÈGLES :
- [type] = activité, repas, hôtel ou transport. "hôtel" seulement pour un vrai check-in (ex: "Check-in Hotel X") — jamais pour "retour à l'hôtel", "dépôt des bagages" ou toute mention en passant, qui sont "activité".
- Une ligne vide entre chaque jour.
- Si aucune date fiable, écris juste "Jour N - Titre" (sans date).
- Si aucune heure donnée, déduis-en une raisonnable (matin/après-midi/soir) ou mets "—".
- Garde les noms de lieux dans le titre de chaque étape ; une adresse, si elle est donnée, va entre parenthèses à la fin du titre.
- Si un prix payé est donné, garde-le à la fin de la ligne, en euros : "850 €". Pour un hôtel, écris aussi le nombre de nuits quand il est connu : "3 nuits - 450 €" (prix total du séjour). N'invente jamais un prix ni un nombre de nuits.

EXEMPLE
Entrée :
voyage rome 2 jours, j'arrive le 12 mars vers midi, check in hotel artemide 2 nuits 240 euros, puis colisee l'aprem, resto le soir

Sortie :
Jour 1 - 2026-03-12 - Rome
12:00 Check-in Hotel Artemide [hôtel] 2 nuits - 240 €
14:00 Colisée
20:00 Restaurant [repas]

Réponds UNIQUEMENT avec le texte reformaté, dans le même style que "Sortie" ci-dessus — aucun mot avant, aucun mot après, jamais de question ni de refus. L'exemple sert uniquement à montrer le style attendu : applique ce format au texte réellement donné par l'utilisateur, pas à l'exemple lui-même.`;

// Model used for every AI call in the app (also lib/importIdeas.js).
export const AI_MODEL = "claude-sonnet-5";

// Requires the user's own Anthropic API key (see lib/settings.js) — there is
// no free proxy outside the Claude-artifact preview environment.
export async function normalizeScriptWithAI(raw, apiKey) {
  if (!apiKey) {
    const err = new Error("NO_API_KEY");
    err.code = "NO_API_KEY";
    throw err;
  }
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 1500,
      system: SCRIPT_FORMAT_SYSTEM,
      messages: [{ role: "user", content: raw }],
    }),
  });
  if (!response.ok) {
    throw new Error("La conversion a échoué (" + response.status + ")");
  }
  const data = await response.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("Réponse vide");
  return text;
}

// Shared "Corriger" pipeline: deterministic approaches first (never invents
// anything), AI only as a genuine last resort, with a sanity check against
// its output.
export async function runScriptCorrection(script, apiKey, { onProgress } = {}) {
  const rawTimedCount = parseScript(script, null).reduce((s, d) => s + d.activities.filter((a) => a.time).length, 0);
  const lineCount = script.split("\n").map((l) => l.trim()).filter(Boolean).length;
  const alreadyHasHeader = scriptHasDayHeaderLine(script);
  if (rawTimedCount >= Math.min(2, lineCount) || (alreadyHasHeader && rawTimedCount >= 1)) {
    return { text: script, changed: false, usedAI: false };
  }

  const heuristic = heuristicReformatScript(script);
  if (heuristic !== script) {
    return { text: heuristic, changed: true, usedAI: false };
  }

  if (onProgress) onProgress("Aucune structure évidente, tentative via l'IA…");
  const cleaned = await normalizeScriptWithAI(script, apiKey);
  const aiCount = parseScript(cleaned, null).reduce((s, d) => s + d.activities.filter((a) => a.time).length, 0);
  if (aiCount > 0) {
    return { text: cleaned, changed: true, usedAI: true };
  }
  const err = new Error("Impossible d'extraire un programme de ce texte. Essayez de décrire chaque étape sur sa propre ligne.");
  err.code = "EMPTY_RESULT";
  throw err;
}
