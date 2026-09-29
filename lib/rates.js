// Exchange rate of the day, for the "Taux du jour" button of the trip settings.
// Source: the free currency-api dataset (daily rates, no key, every currency of
// CURRENCY_PRESETS including MAD and TND), served by two independent CDNs: if the
// first does not answer, the second is tried.
import { fetchWithTimeout } from "./http";

const SOURCES = [
  (code) => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${code}.json`,
  (code) => `https://latest.currency-api.pages.dev/v1/currencies/${code}.json`,
];

function rateError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// 5 significant digits: 3.3733, 0.0055894 (a yen is worth 0.0056 euro, 4 decimals would lose it).
export const roundRate = (rate) => Number(Number(rate).toPrecision(5));

// { rate, date }: what 1 `from` is worth in `to`. `date` is the day of the rate (ISO) or null.
export async function fetchRate(from, to, { fetchImpl, timeoutMs = 8000 } = {}) {
  const f = String(from || "").toLowerCase();
  const t = String(to || "").toLowerCase();
  if (!/^[a-z]{3}$/.test(f) || !/^[a-z]{3}$/.test(t)) throw rateError("UNKNOWN_CURRENCY", "Devise inconnue.");
  if (f === t) return { rate: 1, date: null };
  let last = rateError("NETWORK", "Impossible de récupérer le taux : vérifiez votre connexion.");
  for (const source of SOURCES) {
    try {
      const res = await fetchWithTimeout(fetchImpl, source(f), {}, timeoutMs);
      if (!res.ok) {
        last = rateError("HTTP", `Le service de taux a répondu ${res.status}.`);
        continue;
      }
      const json = await res.json();
      const value = json && json[f] ? json[f][t] : undefined;
      if (typeof value === "number" && Number.isFinite(value) && value > 0) return { rate: roundRate(value), date: typeof json.date === "string" ? json.date : null };
      last = rateError("UNKNOWN_CURRENCY", "Ce taux n'est pas disponible.");
    } catch (e) {
      last = e && e.code === "TIMEOUT" ? rateError("TIMEOUT", "Le service de taux met trop de temps à répondre.") : rateError("NETWORK", "Impossible de récupérer le taux : vérifiez votre connexion.");
    }
  }
  throw last;
}
