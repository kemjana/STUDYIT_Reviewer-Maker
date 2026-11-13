// Pure functions for the progress dashboard (no browser code, so they are easy to test).
import type { Attempt } from "./types";

export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; // the student's local day, not UTC
}

function fromKey(k: string): Date {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d, 12); // noon avoids daylight-saving surprises
}

function addDays(k: string, n: number): string {
  const d = fromKey(k);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

export type Streaks = { current: number; longest: number; totalDays: number };

/** A streak is a run of consecutive days with at least one study activity. It stays alive until the end of the next day. */
export function computeStreaks(days: string[], today: Date): Streaks {
  const set = new Set(days);
  const sorted = [...set].sort();
  let longest = 0, run = 0, prev = "";
  for (const k of sorted) {
    run = prev && addDays(prev, 1) === k ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = k;
  }
  const t = dayKey(today);
  let cursor = set.has(t) ? t : set.has(addDays(t, -1)) ? addDays(t, -1) : "";
  let current = 0;
  while (cursor && set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { current, longest, totalDays: set.size };
}

export function lastNDays(days: string[], n: number, today: Date): { key: string; active: boolean }[] {
  const set = new Set(days);
  const t = dayKey(today);
  return Array.from({ length: n }, (_, i) => {
    const key = addDays(t, i - (n - 1));
    return { key, active: set.has(key) };
  });
}

export type ScorePoint = { at: string; pct: number; mode: "practice" | "exam"; title: string; correct: number; total: number };

export function scoreSeries(items: { title: string; attempts: Attempt[] }[]): ScorePoint[] {
  const out: ScorePoint[] = [];
  for (const s of items) {
    for (const a of s.attempts) {
      if (!a.total) continue;
      out.push({ at: a.at, pct: Math.round((a.correct / a.total) * 100), mode: a.mode ?? "practice", title: s.title, correct: a.correct, total: a.total });
    }
  }
  return out.sort((x, y) => x.at.localeCompare(y.at));
}

export type TopicScore = { topic: string; correct: number; total: number; pct: number };

export function topicAccuracy(items: { attempts: Attempt[] }[], minAnswers = 2): TopicScore[] {
  const map = new Map<string, { correct: number; total: number }>();
  for (const s of items) {
    for (const a of s.attempts) {
      for (const x of a.answers) {
        if (!x.topic) continue;
        const cur = map.get(x.topic) ?? { correct: 0, total: 0 };
        cur.total++;
        if (x.correct) cur.correct++;
        map.set(x.topic, cur);
      }
    }
  }
  return [...map.entries()]
    .filter(([, v]) => v.total >= minAnswers)
    .map(([topic, v]) => ({ topic, ...v, pct: Math.round((v.correct / v.total) * 100) }))
    .sort((a, b) => a.pct - b.pct || b.total - a.total);
}
