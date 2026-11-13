"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSets } from "@/components/SetsContext";
import { studyDays } from "@/lib/dashboard";
import { readDays } from "@/lib/prefs";
import { computeStreaks, lastNDays, scoreSeries, topicAccuracy, type ScorePoint } from "@/lib/stats";

function ScoreChart({ points }: { points: ScorePoint[] }) {
  const W = 640, H = 220, L = 36, R = 12, T = 12, B = 28;
  const shown = points.slice(-30);
  const x = (i: number) => (shown.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (shown.length - 1));
  const y = (pct: number) => T + ((100 - pct) * (H - T - B)) / 100;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Line chart of your last ${shown.length} quiz scores, from ${shown[0].pct} percent to ${shown[shown.length - 1].pct} percent.`}>
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line className="axis" x1={L} x2={W - R} y1={y(g)} y2={y(g)} />
          <text x={L - 6} y={y(g) + 4} textAnchor="end">{g}%</text>
        </g>
      ))}
      {shown.length > 1 && <polyline className="line" points={shown.map((p, i) => `${x(i)},${y(p.pct)}`).join(" ")} />}
      {shown.map((p, i) => <circle key={i} className={`dot${p.mode === "exam" ? " exam" : ""}`} cx={x(i)} cy={y(p.pct)} r={5} />)}
      <text x={L} y={H - 8}>{new Date(shown[0].at).toLocaleDateString()}</text>
      <text x={W - R} y={H - 8} textAnchor="end">{new Date(shown[shown.length - 1].at).toLocaleDateString()}</text>
    </svg>
  );
}

export default function ProgressPage() {
  const { sets } = useSets();
  const [saved, setSaved] = useState<string[]>([]);
  useEffect(() => { setSaved(readDays()); }, []);
  const days = useMemo(() => studyDays(saved, sets ?? []), [saved, sets]);

  const data = useMemo(() => {
    if (!sets) return null;
    const points = scoreSeries(sets);
    const streaks = computeStreaks(days, new Date());
    const avg = points.length ? Math.round(points.reduce((n, p) => n + p.pct, 0) / points.length) : 0;
    const best = points.length ? Math.max(...points.map((p) => p.pct)) : 0;
    const exams = points.filter((p) => p.mode === "exam");
    return { points, streaks, avg, best, exams, topics: topicAccuracy(sets), strip: lastNDays(days, 28, new Date()) };
  }, [sets, days]);

  if (!data) return <p className="muted" role="status">Loading...</p>;
  const { points, streaks, avg, best, exams, topics, strip } = data;

  return (
    <div className="stack">
      <h1 className="page-title">Your progress</h1>
      <p className="muted">Worked out from your finished quizzes and exams, and the flashcards you marked.</p>

      <div className="stats">
        <div className="stat"><div className="big">{streaks.current}</div><div>day streak</div><div className="small muted">Longest: {streaks.longest}</div></div>
        <div className="stat"><div className="big">{streaks.totalDays}</div><div>days studied</div></div>
        <div className="stat"><div className="big">{points.length}</div><div>quizzes and exams</div><div className="small muted">{exams.length} exams</div></div>
        <div className="stat"><div className="big">{points.length ? `${avg}%` : "-"}</div><div>average score</div><div className="small muted">Best: {points.length ? `${best}%` : "-"}</div></div>
      </div>

      <section className="card">
        <h2>Last 4 weeks</h2>
        <div className="days" role="img" aria-label={`You studied on ${strip.filter((d) => d.active).length} of the last 28 days.`}>
          {strip.map((d) => <span key={d.key} className={`day${d.active ? " on" : ""}`} title={`${d.key}${d.active ? ": studied" : ""}`} />)}
        </div>
        <p className="small muted" style={{ marginTop: ".6rem", marginBottom: 0 }}>A filled square means you finished a quiz or exam, or marked a flashcard, that day. A streak counts days in a row.</p>
      </section>

      <section className="card">
        <h2>Scores over time</h2>
        {points.length === 0 ? (
          <p className="muted">No scores yet. Finish a quiz or an exam and your scores will appear here. <Link href="/new">Add a module</Link></p>
        ) : (
          <>
            <ScoreChart points={points} />
            <p className="small muted">Blue dots are practice quizzes. Yellow dots are exams. The chart shows up to your last 30.</p>
            <details>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>See the scores as a table</summary>
              <div style={{ overflowX: "auto" }}>
                <table className="plain">
                  <thead><tr><th>Date</th><th>Study set</th><th>Type</th><th>Score</th></tr></thead>
                  <tbody>
                    {[...points].reverse().slice(0, 40).map((p, i) => (
                      <tr key={i}><td>{new Date(p.at).toLocaleDateString()}</td><td>{p.title}</td><td>{p.mode}</td><td>{p.correct} / {p.total} ({p.pct}%)</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </section>

      <section className="card">
        <h2>Topics to practice</h2>
        {topics.length === 0 ? (
          <p className="muted">After a few quizzes, your weakest topics will show here.</p>
        ) : (
          <ul className="lib">
            {topics.slice(0, 8).map((t) => (
              <li key={t.topic}>
                <div style={{ flex: "1 1 14rem" }}>
                  <strong>{t.topic}</strong>
                  <div className="small muted">{t.correct} of {t.total} correct</div>
                </div>
                <div style={{ flex: "1 1 10rem" }} aria-label={`${t.pct} percent`}><div className="bar"><span style={{ width: `${t.pct}%` }} /></div></div>
                <span style={{ minWidth: "3rem", textAlign: "right", fontWeight: 700 }}>{t.pct}%</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
