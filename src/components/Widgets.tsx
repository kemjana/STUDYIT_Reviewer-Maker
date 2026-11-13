"use client";
// Dashboard widgets: stat card, study calendar, monthly activity chart, and daily-goal donut.
import { useMemo, useState } from "react";
import { dayKey } from "@/lib/stats";
import { monthGrid, monthlyTotals, progressPct, smoothPath } from "@/lib/dashboard";
import type { SetSummary } from "@/lib/types";
import { Icon, type IconName } from "./Icon";

export function StatCard({ icon, tint, value, label }: { icon: IconName; tint: "violet" | "pink" | "green" | "yellow"; value: number | string; label: string }) {
  return (
    <div className="statcard">
      <span className={`stat-icon tint-${tint}`}><Icon name={icon} size={22} /></span>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

const WEEK = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function StudyCalendar({ days, now }: { days: string[]; now: Date }) {
  const [offset, setOffset] = useState(0);
  const set = useMemo(() => new Set(days), [days]);
  const shown = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const grid = monthGrid(shown.getFullYear(), shown.getMonth());
  const today = dayKey(now);
  const studiedThisMonth = grid.flat().filter((d) => d && set.has(dayKey(new Date(shown.getFullYear(), shown.getMonth(), d)))).length;
  return (
    <section className="card widget" aria-label="Study calendar">
      <div className="widget-head">
        <h2>Study calendar</h2>
        <div className="row" style={{ gap: ".25rem" }}>
          <button className="icon-btn" aria-label="Previous month" onClick={() => setOffset((o) => o - 1)}><Icon name="chevL" size={18} /></button>
          <button className="icon-btn" aria-label="Next month" onClick={() => setOffset((o) => o + 1)} disabled={offset >= 0}><Icon name="chevR" size={18} /></button>
        </div>
      </div>
      <p className="cal-month">{shown.toLocaleString("en", { month: "long", year: "numeric" })}</p>
      <table className="cal" role="grid" aria-label={`${shown.toLocaleString("en", { month: "long", year: "numeric" })}, you studied on ${studiedThisMonth} days`}>
        <thead><tr>{WEEK.map((w) => <th key={w} scope="col">{w}</th>)}</tr></thead>
        <tbody>
          {grid.map((week, i) => (
            <tr key={i}>
              {week.map((d, j) => {
                if (!d) return <td key={j} />;
                const key = dayKey(new Date(shown.getFullYear(), shown.getMonth(), d));
                const studied = set.has(key);
                return (
                  <td key={j}>
                    <span className={`cal-day${studied ? " on" : ""}${key === today ? " today" : ""}`} title={studied ? `${key}: studied` : key} aria-label={`${d}${studied ? ", studied" : ""}${key === today ? ", today" : ""}`}>{d}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted" style={{ margin: ".6rem 0 0" }}><span className="cal-key" /> Filled days are days you studied.</p>
    </section>
  );
}

export function ActivityChart({ sets, now }: { sets: SetSummary[]; now: Date }) {
  const points = useMemo(() => monthlyTotals(sets, now, 12), [sets, now]);
  const W = 640, H = 250, L = 40, R = 14, T = 24, B = 30;
  const max = Math.max(...points.map((p) => p.value), 0);
  const top = Math.max(8, Math.ceil(max / 4) * 4); // a multiple of 4, so the 4 gridlines are whole numbers
  const x = (i: number) => L + (i * (W - L - R)) / (points.length - 1);
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const xy = points.map((p, i) => ({ x: x(i), y: y(p.value) }));
  const line = smoothPath(xy);
  const area = `${line} L${x(points.length - 1)},${H - B} L${x(0)},${H - B} Z`;
  const peak = max > 0 ? points.findIndex((p) => p.value === max) : -1;
  const ticks = [0, 1, 2, 3, 4].map((k) => (top / 4) * k);
  return (
    <section className="card widget" aria-label="Study activity">
      <div className="widget-head"><h2>Study activity</h2><span className="small muted">Questions answered per month</span></div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={max > 0 ? `Area chart of questions answered per month over the last 12 months. The busiest month was ${points[peak].label} with ${max} questions.` : "Area chart of questions answered per month. No quizzes finished yet."}>
        <defs>
          <linearGradient id="act-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--btn)" stopOpacity="0.35" /><stop offset="100%" stopColor="var(--btn)" stopOpacity="0.02" /></linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}><line className="axis" x1={L} x2={W - R} y1={y(t)} y2={y(t)} /><text x={L - 8} y={y(t) + 4} textAnchor="end">{t}</text></g>
        ))}
        <path d={area} fill="url(#act-fill)" />
        <path className="line" d={line} />
        {points.map((p, i) => (i % 2 === 0 || i === points.length - 1 ? <text key={p.key} x={x(i)} y={H - 8} textAnchor="middle">{p.label}</text> : null))}
        {peak >= 0 && (
          <g>
            <line className="peak-line" x1={x(peak)} x2={x(peak)} y1={y(max)} y2={H - B} />
            <circle className="dot" cx={x(peak)} cy={y(max)} r={5.5} />
            <rect className="bubble" x={Math.min(Math.max(x(peak), L + 44), W - R - 44) - 44} y={y(max) - 30} width={88} height={20} rx={10} />
            <text className="bubble-text" x={Math.min(Math.max(x(peak), L + 44), W - R - 44)} y={y(max) - 16} textAnchor="middle">{max} questions</text>
          </g>
        )}
      </svg>
      {max === 0 && <p className="small muted" style={{ marginTop: 0 }}>Finish a quiz or exam and your activity will appear here.</p>}
    </section>
  );
}

export function DailyDonut({ count, goal }: { count: number; goal: number }) {
  const pct = progressPct(count, goal);
  const r = 52, c = 2 * Math.PI * r;
  return (
    <section className="card widget" aria-label="Daily goal">
      <div className="widget-head"><h2>Daily goal</h2></div>
      <div className="donut-wrap">
        <svg viewBox="0 0 140 140" className="donut" role="img" aria-label={`${pct} percent of today's goal done`}>
          <circle cx="70" cy="70" r={r} className="donut-track" />
          <circle cx="70" cy="70" r={r} className="donut-fill" strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 70 70)" />
          <text x="70" y="78" textAnchor="middle" className="donut-text">{pct}%</text>
        </svg>
      </div>
      <p className="center" style={{ marginBottom: ".2rem" }}><strong>{Math.min(count, 9999)}</strong> of <strong>{goal}</strong> items today</p>
      <p className="small muted center" style={{ margin: 0 }}>Flashcards you mark and questions you answer count. Change the goal in Settings.</p>
    </section>
  );
}
