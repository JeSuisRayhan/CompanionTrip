// Weather-based day reorganization: if a day with outdoor activities has bad
// weather forecast and another day (with no/fewer outdoor activities) has
// good weather, propose swapping their activities so the outdoor plans land
// on the better-weather day. Never applied automatically — always reviewed
// and confirmed one by one.
import { resolveDayDate } from "./dates";
import { fetchDayWeather, weatherInfo } from "./weather";
import { updateTrip } from "./trips";

function outdoorCount(day) {
  return day.activities.filter((a) => a.outdoor).length;
}

export async function buildWeatherReorgProposal(trip) {
  const dayInfos = [];
  for (let i = 0; i < trip.days.length; i++) {
    const day = trip.days[i];
    const dateISO = resolveDayDate(trip, day, i);
    if (!dateISO) continue;
    const weather = await fetchDayWeather(day, dateISO, trip.defaultLocation);
    if (!weather) continue;
    dayInfos.push({
      day,
      dateISO,
      weather,
      good: weatherInfo(weather.code).good,
      outdoorCount: outdoorCount(day),
    });
  }

  const badOutdoorDays = dayInfos.filter((d) => d.good === false && d.outdoorCount > 0);
  const goodQuietDays = dayInfos.filter((d) => d.good === true && d.outdoorCount === 0);

  const proposals = [];
  const usedGoodDayIds = new Set();
  for (const bad of badOutdoorDays) {
    const match = goodQuietDays.find((g) => !usedGoodDayIds.has(g.day.id) && g.day.id !== bad.day.id);
    if (!match) continue;
    usedGoodDayIds.add(match.day.id);
    proposals.push({
      dayAId: bad.day.id,
      dayATitle: bad.day.title,
      dayADate: bad.dateISO,
      dayAWeather: bad.weather,
      dayBId: match.day.id,
      dayBTitle: match.day.title,
      dayBDate: match.dateISO,
      dayBWeather: match.weather,
    });
  }
  return proposals;
}

export async function applyWeatherSwap(tripId, dayAId, dayBId) {
  return updateTrip(tripId, (trip) => ({
    ...trip,
    days: trip.days.map((day) => {
      if (day.id === dayAId) {
        const other = trip.days.find((d) => d.id === dayBId);
        return other ? { ...day, activities: other.activities } : day;
      }
      if (day.id === dayBId) {
        const other = trip.days.find((d) => d.id === dayAId);
        return other ? { ...day, activities: other.activities } : day;
      }
      return day;
    }),
  }));
}
