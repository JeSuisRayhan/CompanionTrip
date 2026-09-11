// Script parsing & deterministic reformatting, ported directly from the web
// version. This is the part that took the most iteration (see the app's
// conversation history) — never invents content, only reaches for AI as a
// genuine last resort.
import { pad2, uid } from "./dates";

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
      let body = actMatch[3].trim();
      let type = "activite";
      const tagMatch = body.match(tagRe);
      if (tagMatch) {
        type = typeFromTag(tagMatch[1]);
        body = body.replace(tagRe, "").trim();
      } else {
        type = guessTypeFromBody(body);
      }
      current.activities.push({
        id: uid(),
        time: `${pad2(+actMatch[1])}:${actMatch[2] || "00"}`,
        title: body,
        note: "",
        type,
        price: null,
        transportMode: type === "transport" ? detectTransportMode(body) : null,
        confirmationCode: null,
      });
    } else {
      const tagMatch = raw.match(tagRe);
      let body = raw;
      let type = "activite";
      if (tagMatch) {
        type = typeFromTag(tagMatch[1]);
        body = raw.replace(tagRe, "").trim();
      }
      if (current.activities.length && !tagMatch) {
        current.activities[current.activities.length - 1].note += (current.activities[current.activities.length - 1].note ? " " : "") + body;
      } else {
        current.activities.push({
          id: uid(),
          time: null,
          title: body,
          note: "",
          type,
          price: null,
          transportMode: type === "transport" ? detectTransportMode(body) : null,
          confirmationCode: null,
        });
      }
    }
  }

  return days;
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
- Garde les noms de lieux et adresses dans le titre de chaque étape.

EXEMPLE
Entrée :
voyage rome 2 jours, j'arrive le 12 mars vers midi, check in hotel artemide, puis colisee l'aprem, resto le soir

Sortie :
Jour 1 - 2026-03-12 - Rome
12:00 Check-in Hotel Artemide [hôtel]
14:00 Colisée
20:00 Restaurant [repas]

Réponds UNIQUEMENT avec le texte reformaté, dans le même style que "Sortie" ci-dessus — aucun mot avant, aucun mot après, jamais de question ni de refus. L'exemple sert uniquement à montrer le style attendu : applique ce format au texte réellement donné par l'utilisateur, pas à l'exemple lui-même.`;

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
      model: "claude-sonnet-5",
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
