// Weather via Open-Meteo (free, no API key) — ported directly from the web
// version. fetch() behaves the same in React Native as in a browser here
// (no CORS restriction applies to native fetch), so this should work
// identically once tested on a real device.

export const WEATHER_CODES = {
  0: { emoji: "☀️", label: "Ciel dégagé", good: true },
  1: { emoji: "🌤️", label: "Plutôt dégagé", good: true },
  2: { emoji: "⛅", label: "Partiellement nuageux", good: true },
  3: { emoji: "☁️", label: "Nuageux", good: false },
  45: { emoji: "🌫️", label: "Brouillard", good: false },
  48: { emoji: "🌫️", label: "Brouillard givrant", good: false },
  51: { emoji: "🌦️", label: "Bruine légère", good: false },
  53: { emoji: "🌦️", label: "Bruine", good: false },
  55: { emoji: "🌦️", label: "Bruine dense", good: false },
  61: { emoji: "🌧️", label: "Pluie légère", good: false },
  63: { emoji: "🌧️", label: "Pluie", good: false },
  65: { emoji: "🌧️", label: "Forte pluie", good: false },
  71: { emoji: "🌨️", label: "Neige légère", good: false },
  73: { emoji: "🌨️", label: "Neige", good: false },
  75: { emoji: "❄️", label: "Forte neige", good: false },
  80: { emoji: "🌦️", label: "Averses", good: false },
  81: { emoji: "🌧️", label: "Fortes averses", good: false },
  82: { emoji: "⛈️", label: "Averses violentes", good: false },
  95: { emoji: "⛈️", label: "Orage", good: false },
  96: { emoji: "⛈️", label: "Orage avec grêle", good: false },
  99: { emoji: "⛈️", label: "Orage violent", good: false },
};

export function weatherInfo(code) {
  return WEATHER_CODES[code] || { emoji: "🌡️", label: "", good: null };
}

export function guessDayLocation(day, fallbackLocation) {
  if (day.location && day.location.trim()) return day.location.trim();
  const stripped = (day.title || "").replace(/^jour\s*\d+\s*[-–—:]?\s*/i, "").trim();
  if (stripped) return stripped;
  return fallbackLocation && fallbackLocation.trim() ? fallbackLocation.trim() : null;
}

const geocodeCache = new Map();
export async function geocodeLocation(query) {
  if (!query) return null;
  const key = query.trim().toLowerCase();
  if (geocodeCache.has(key)) return geocodeCache.get(key);
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=fr`);
    const data = await res.json();
    const first = data && data.results && data.results[0];
    const result = first ? { lat: first.latitude, lon: first.longitude } : null;
    geocodeCache.set(key, result);
    return result;
  } catch (e) {
    geocodeCache.set(key, null);
    return null;
  }
}

const weatherCache = new Map();
export async function fetchWeatherForDate(lat, lon, dateISO) {
  const key = `${lat},${lon},${dateISO}`;
  if (weatherCache.has(key)) return weatherCache.get(key);
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${dateISO}&end_date=${dateISO}`
    );
    const data = await res.json();
    if (!data || !data.daily || !data.daily.time || data.daily.time.length === 0) {
      weatherCache.set(key, null);
      return null;
    }
    const result = {
      code: data.daily.weathercode[0],
      tempMax: Math.round(data.daily.temperature_2m_max[0]),
      tempMin: Math.round(data.daily.temperature_2m_min[0]),
    };
    weatherCache.set(key, result);
    return result;
  } catch (e) {
    weatherCache.set(key, null);
    return null;
  }
}

export async function fetchDayWeather(day, dateISO, fallbackLocation) {
  if (!dateISO) return null;
  const daysAhead = Math.round((new Date(dateISO + "T00:00:00") - new Date()) / 86400000);
  if (daysAhead < -1 || daysAhead > 15) return null;
  const location = guessDayLocation(day, fallbackLocation);
  if (!location) return null;
  const coords = await geocodeLocation(location);
  if (!coords) return null;
  return fetchWeatherForDate(coords.lat, coords.lon, dateISO);
}
