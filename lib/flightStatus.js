// Live flight status (real scheduled/estimated times, delay status, and
// terminal/gate when the airport/airline actually reports them) via
// Aviationstack's free tier (500 requests/month, no card required).
//
// The API key is NOT stored in this repository and never typed into the
// app's Settings — it's injected at build time by EAS from an environment
// variable configured on the Expo dashboard (see LISEZ-MOI.md). Only
// variables prefixed EXPO_PUBLIC_ get inlined into the JS bundle, which is
// what makes this work without any runtime configuration step.
//
// Honesty about the free tier: scheduled/estimated times and delay status
// are confirmed to work. Whether `terminal`/`gate` are actually populated
// for a given flight depends on what the departure airport reports to
// Aviationstack — some airports/flights simply won't have it, free tier
// or not. We show it whenever it's present and say nothing when it's not,
// rather than promising something we can't guarantee.

const ACCESS_KEY = process.env.EXPO_PUBLIC_AVIATIONSTACK_API_KEY;

export function hasFlightStatusKey() {
  return !!ACCESS_KEY;
}

// flightIata: e.g. "AC834" (carrier + number, no space). dateISO: the
// flight's date, "YYYY-MM-DD" — used to disambiguate a recurring flight
// number, not sent as a strict filter (Aviationstack matches on the
// current/near-term schedule for that flight number).
export async function fetchFlightStatus(flightIata, dateISO) {
  if (!ACCESS_KEY) {
    const err = new Error("NO_API_KEY");
    err.code = "NO_API_KEY";
    throw err;
  }
  const params = new URLSearchParams({ access_key: ACCESS_KEY, flight_iata: flightIata });
  const res = await fetch(`https://api.aviationstack.com/v1/flights?${params.toString()}`);
  if (!res.ok) throw new Error(`Aviationstack a répondu ${res.status}`);
  const json = await res.json();
  if (json.error) {
    const err = new Error(json.error.message || "Erreur Aviationstack");
    err.code = json.error.code || "API_ERROR";
    throw err;
  }
  const flights = json.data || [];
  // Prefer the entry matching the requested date if there are several
  // (recurring flight numbers fly most days), else fall back to the first.
  const match = flights.find((f) => f.flight_date === dateISO) || flights[0];
  if (!match) return null;

  return {
    status: match.flight_status || null, // "scheduled" | "active" | "landed" | "cancelled" | "incident" | "diverted"
    departure: {
      airport: match.departure?.airport || null,
      scheduled: match.departure?.scheduled || null,
      estimated: match.departure?.estimated || null,
      terminal: match.departure?.terminal || null,
      gate: match.departure?.gate || null,
    },
    arrival: {
      airport: match.arrival?.airport || null,
      scheduled: match.arrival?.scheduled || null,
      estimated: match.arrival?.estimated || null,
      terminal: match.arrival?.terminal || null,
      gate: match.arrival?.gate || null,
    },
  };
}
