// Pure helpers for the sidebar list, calendar, activity chart, and daily goal (no browser code, so they are easy to test).
import { dayKey } from "./stats";
import type { Attempt } from "./types";

/** Groups items the way Claude's chat list does: Today, Yesterday, Previous 7 days, Older. Newest first inside each group. */
export function groupByDate<T extends { updatedAt: string }>(items: T[], now: Date): { label: string; items: T[] }[] {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(now);
  const day = 86_400_000;
  const buckets: { label: string; items: T[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Older", items: [] },
  ];
  for (const it of [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    const diff = Math.round((today - startOfDay(new Date(it.updatedAt))) / day);
    buckets[diff <= 0 ? 0 : diff === 1 ? 1 : diff <= 7 ? 2 : 3].items.push(it);
  }
  return buckets.filter((b) => b.items.length);
}

/** Weeks (Sunday first) for a month. Empty cells are null. */
export function monthGrid(year: number, month: number): (number | null)[][] {
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** Every day with study activity: days saved on this device plus the days of finished quizzes and exams. */
export function studyDays(savedDays: string[], sets: { attempts: Attempt[] }[]): string[] {
  const out = new Set(savedDays);
  for (const s of sets) for (const a of s.attempts) out.add(dayKey(new Date(a.at)));
  return [...out].sort();
}

export type MonthPoint = { key: string; label: string; value: number };

/** Questions answered per month for the last `n` months (oldest first). */
export function monthlyTotals(sets: { attempts: Attempt[] }[], now: Date, n = 12): MonthPoint[] {
  const months: MonthPoint[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleString("en", { month: "short" }), value: 0 });
  }
  for (const s of sets) {
    for (const a of s.attempts) {
      const d = new Date(a.at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const m = months.find((x) => x.key === key);
      if (m) m.value += a.total;
    }
  }
  return months;
}

/** A smooth curve through the points (Catmull-Rom turned into cubic curves). */
export function smoothPath(pts: { x: number; y: number }[]): string {
  if (!pts.length) return "";
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  const lo = Math.min(...pts.map((p) => p.y)), hi = Math.max(...pts.map((p) => p.y));
  const clamp = (y: number) => Math.max(lo, Math.min(hi, y)); // keeps the curve from swinging past the lowest or highest point
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: clamp(p1.y + (p2.y - p0.y) / 6) };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: clamp(p2.y - (p3.y - p1.y) / 6) };
    d += ` C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

export const progressPct = (count: number, goal: number): number => (goal <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((count / goal) * 100))));

export function greetingFor(now: Date): string {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
