// Where a day stands: "today", "done" (every step ticked), "past" or "future".
export function dayState(day, date, today) {
  if (date && date === today) return "today";
  const acts = day.activities || [];
  if (acts.length > 0 && acts.every((a) => a.done)) return "done";
  if (date && date < today) return "past";
  return "future";
}
