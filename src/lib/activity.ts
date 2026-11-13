// Remembers which days the student studied (for the streak) and how many items they did today (for the daily goal).
// Only dates and a count are stored, nothing else.
import { dayKey } from "./stats";
import { readDays, readToday, writeDays, writeToday } from "./prefs";

/** Call this when the student finishes a quiz or exam (items = questions answered) or marks a flashcard (items = 1). */
export function logStudyDay(items = 1, now: Date = new Date()) {
  const key = dayKey(now);
  const days = readDays();
  if (!days.includes(key)) writeDays([...days, key]);
  const t = readToday();
  writeToday({ d: key, n: (t.d === key ? t.n : 0) + Math.max(1, items) });
}

/** How many items were done today (0 if the saved count is from an earlier day). */
export function todayCount(now: Date = new Date()): number {
  const t = readToday();
  return t.d === dayKey(now) ? t.n : 0;
}
