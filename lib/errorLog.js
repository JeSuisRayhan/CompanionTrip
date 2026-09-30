// Error journal: what went wrong on the phone, kept on the phone.
//
// Nothing is sent anywhere. The person can open the journal in Réglages and
// share it (or not). It catches: a screen that fails to draw (ErrorBoundary),
// errors thrown anywhere in the JS, promises nobody handled, and the network
// calls the app treats as "just show a message" (Queue-Times, maps, tiles).
import { getSetting, setSetting, removeSetting } from "./storage";

export const ERROR_LOG_KEY = "errorLog";
export const MAX_ENTRIES = 50;
const MAX_MESSAGE = 300;
const MAX_STACK = 1600;
const SAME_ERROR_WINDOW_MS = 30 * 60 * 1000; // the same error again within half an hour is counted, not repeated (a weak signal fails every refresh)
const FATAL_FLUSH_MS = 800; // how long a crash waits for the journal to be written

export const SOURCES = {
  render: "Affichage",
  js: "Code",
  crash: "Plantage",
  promise: "Promesse",
  network: "Réseau",
};

let queue = Promise.resolve(); // writes one after the other: two errors at once must not overwrite each other

async function readAll() {
  try {
    const raw = await getSetting(ERROR_LOG_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

function describe(error) {
  if (error && typeof error === "object") {
    return { message: String(error.message || error.name || "Erreur sans message"), stack: typeof error.stack === "string" ? error.stack : "" };
  }
  return { message: String(error == null ? "Erreur sans message" : error), stack: "" };
}

// `source`: a label from SOURCES or any short text ("Queue-Times"). `where`:
// extra place information (the component stack of a screen that failed).
// Never throws: the journal must not be a new source of errors.
export function logError(error, { source = "js", where = "", now = Date.now() } = {}) {
  const label = SOURCES[source] || source;
  const run = async () => {
    try {
      const { message, stack } = describe(error);
      const list = await readAll();
      const msg = clip(message, MAX_MESSAGE);
      const at = list.findIndex((e) => e.message === msg && e.source === label && now - Date.parse(e.at) < SAME_ERROR_WINDOW_MS);
      if (at >= 0) {
        const [same] = list.splice(at, 1); // counted once more, and back to the top as the most recent
        same.count = (same.count || 1) + 1;
        same.at = new Date(now).toISOString();
        list.push(same);
      } else {
        list.push({
          id: `${now}-${list.length}`,
          at: new Date(now).toISOString(),
          source: label,
          message: msg,
          stack: clip([stack, where ? `Dans :${where}` : ""].filter(Boolean).join("\n"), MAX_STACK),
          count: 1,
        });
      }
      await setSetting(ERROR_LOG_KEY, JSON.stringify(list.slice(-MAX_ENTRIES)));
    } catch (e) {
      // best effort
    }
  };
  queue = queue.then(run, run);
  return queue;
}

// Newest first.
export async function getErrorLog() {
  await queue;
  return (await readAll()).slice().reverse();
}

export async function errorCount() {
  await queue;
  return (await readAll()).length;
}

export async function clearErrorLog() {
  await queue;
  await removeSetting(ERROR_LOG_KEY);
}

const pad = (n) => String(n).padStart(2, "0");
function stamp(iso) {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatErrorReport(entries, info = {}) {
  const head = ["Compagnon de voyage : rapport d'erreurs", info.device ? `Appareil : ${info.device}` : null, `${entries.length} erreur${entries.length > 1 ? "s" : ""}, la plus récente en premier`].filter(Boolean);
  const body = entries.map((e, i) => {
    const lines = [`${i + 1}. ${stamp(e.at)} [${e.source}]${e.count > 1 ? ` (x${e.count})` : ""} ${e.message}`];
    if (e.stack) lines.push(e.stack.split("\n").slice(0, 8).join("\n"));
    return lines.join("\n");
  });
  return `${head.join("\n")}\n\n${body.join("\n\n")}`;
}

// Hooks the app up to every way the JS can fail. `g` is the global object
// (a parameter so it can be tested). Safe to call twice.
let installed = false;
export function installErrorHandlers(g = globalThis, { force = false } = {}) {
  if (installed && !force) return false;
  installed = true;
  const utils = g.ErrorUtils;
  if (utils && typeof utils.setGlobalHandler === "function") {
    const previous = typeof utils.getGlobalHandler === "function" ? utils.getGlobalHandler() : null;
    utils.setGlobalHandler((error, isFatal) => {
      const next = () => {
        if (previous) previous(error, isFatal);
      };
      // A crash kills the app right after: give the journal a moment to be written first.
      const wait = new Promise((resolve) => setTimeout(resolve, FATAL_FLUSH_MS));
      Promise.race([logError(error, { source: isFatal ? "crash" : "js" }), wait]).then(next, next);
    });
  }
  const hermes = g.HermesInternal;
  const dev = typeof g.__DEV__ !== "undefined" && g.__DEV__;
  if (!dev && hermes && typeof hermes.enablePromiseRejectionTracker === "function") {
    hermes.enablePromiseRejectionTracker({
      allRejections: true,
      onUnhandled: (id, error) => {
        logError(error, { source: "promise" });
      },
      onHandled: () => {},
    });
  }
  return true;
}
