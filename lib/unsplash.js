// Automatic destination cover photos via Unsplash's free API. The Access Key
// comes from the build (EAS environment variable EXPO_PUBLIC_UNSPLASH_ACCESS_KEY,
// never committed to the repo) or, failing that, from the key typed in Settings.
// Attribution is mandatory per Unsplash's API guidelines: we always keep the
// photographer's name + link alongside the photo, and ping the "download"
// tracking endpoint once a photo is actually adopted as a trip's cover
// (their required usage-tracking trigger).
import { getSetting } from "./storage";

// Must be written as a literal `process.env.EXPO_PUBLIC_…` so Expo inlines it
// at build time.
const BUILD_TIME_KEY = process.env.EXPO_PUBLIC_UNSPLASH_ACCESS_KEY;

export function hasBuildTimeUnsplashKey() {
  return !!BUILD_TIME_KEY;
}

async function resolveAccessKey() {
  if (BUILD_TIME_KEY) return BUILD_TIME_KEY;
  return getSetting("unsplashAccessKey");
}

function guessCoverQuery(trip) {
  // Prefer an explicit day location if one is set (same heuristic as the
  // weather feature), otherwise fall back to the trip name stripped of
  // trailing date-ish words ("septembre 2026", "2026", "- 10 jours"...).
  const dayLocation = trip.days && trip.days[0] && trip.days[0].location;
  if (dayLocation && dayLocation.trim()) return dayLocation.trim();
  // The destination given at creation ("Construire mon voyage") beats guessing
  // from a trip name like "Vacances d'été".
  if (trip.defaultLocation && trip.defaultLocation.trim()) return trip.defaultLocation.trim();

  const cleaned = (trip.name || "")
    .replace(/\b(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\b/gi, "")
    .replace(/\d{4}/g, "")
    .replace(/[-–—,].*$/, "")
    .trim();
  return cleaned || trip.name;
}

export async function searchDestinationPhoto(trip) {
  const accessKey = await resolveAccessKey();
  if (!accessKey) return null;

  const query = guessCoverQuery(trip);
  if (!query) return null;

  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${accessKey}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const photo = data.results && data.results[0];
    if (!photo) return null;
    return {
      url: photo.urls.regular,
      thumbUrl: photo.urls.small,
      photographerName: photo.user.name,
      photographerUrl: photo.user.links.html,
      downloadLocation: photo.links.download_location,
      query,
    };
  } catch (e) {
    return null;
  }
}

// Unsplash requires this ping once a photo is actually used (not just
// previewed/searched) — call this the moment you adopt a cover image.
export async function trackUnsplashDownload(downloadLocation) {
  const accessKey = await resolveAccessKey();
  if (!accessKey || !downloadLocation) return;
  try {
    await fetch(downloadLocation, { headers: { Authorization: `Client-ID ${accessKey}` } });
  } catch (e) {
    // best-effort — never block the UI on this
  }
}
