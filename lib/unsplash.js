// Automatic destination cover photos via Unsplash's free API. Requires the
// user's own free Access Key (see Settings) — there is no shared/bundled key.
// Attribution is mandatory per Unsplash's API guidelines: we always keep the
// photographer's name + link alongside the photo, and ping the "download"
// tracking endpoint once a photo is actually adopted as a trip's cover
// (their required usage-tracking trigger).
import { getSetting } from "./storage";

function guessCoverQuery(trip) {
  // Prefer an explicit day location if one is set (same heuristic as the
  // weather feature), otherwise fall back to the trip name stripped of
  // trailing date-ish words ("septembre 2026", "2026", "- 10 jours"...).
  const dayLocation = trip.days && trip.days[0] && trip.days[0].location;
  if (dayLocation && dayLocation.trim()) return dayLocation.trim();

  const cleaned = (trip.name || "")
    .replace(/\b(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\b/gi, "")
    .replace(/\d{4}/g, "")
    .replace(/[-–—,].*$/, "")
    .trim();
  return cleaned || trip.name;
}

export async function searchDestinationPhoto(trip) {
  const accessKey = await getSetting("unsplashAccessKey");
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
  const accessKey = await getSetting("unsplashAccessKey");
  if (!accessKey || !downloadLocation) return;
  try {
    await fetch(downloadLocation, { headers: { Authorization: `Client-ID ${accessKey}` } });
  } catch (e) {
    // best-effort — never block the UI on this
  }
}
