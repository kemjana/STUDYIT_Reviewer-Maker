"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useNow } from "@/lib/useNow";
import { getGoal, readDays } from "@/lib/prefs";
import { todayCount } from "@/lib/activity";
import { greetingFor, studyDays } from "@/lib/dashboard";
import { computeStreaks } from "@/lib/stats";
import { Icon } from "@/components/Icon";
import { useSets } from "@/components/SetsContext";
import { ActivityChart, DailyDonut, StatCard, StudyCalendar } from "@/components/Widgets";

export default function Home() {
  const { user } = useAuth();
  const { sets } = useSets();
  const now = useNow();
  const [saved, setSaved] = useState<string[]>([]);
  const [count, setCount] = useState(0);
  const [goal, setGoal] = useState(10);
  useEffect(() => { setSaved(readDays()); setCount(todayCount()); setGoal(getGoal()); }, []);

  const list = sets ?? [];
  const days = studyDays(saved, list);
  const streak = now ? computeStreaks(days, now) : { current: 0, longest: 0, totalDays: 0 };
  const recent = list.slice(0, 4);
  const sum = (f: (s: (typeof list)[number]) => number) => list.reduce((n, s) => n + f(s), 0);

  return (
    <div className="dash">
      <div className="dash-main">
        <div>
          <h1 className="page-title">{now ? greetingFor(now) : "Welcome"}{user ? `, ${user.name}` : ""}</h1>
          <p className="muted" style={{ marginBottom: 0 }}>Got a huge PDF module? Just StudyIt.</p>
        </div>

        <section className="statgrid" aria-label="Your totals">
          <StatCard icon="book" tint="violet" value={sets === null ? "-" : list.length} label="Modules" />
          <StatCard icon="cards" tint="pink" value={sets === null ? "-" : sum((s) => s.cards)} label="Flashcards" />
          <StatCard icon="file" tint="green" value={sets === null ? "-" : sum((s) => s.questions)} label="Quiz questions" />
          <StatCard icon="quiz" tint="yellow" value={sets === null ? "-" : sum((s) => s.attempts.length)} label="Quizzes taken" />
        </section>

        <section aria-labelledby="newmod-h">
          <h2 id="newmod-h" className="section-title">New module</h2>
          <div className="grid2">
            <article className="actioncard">
              <div className="art art-violet" aria-hidden="true"><Icon name="upload" size={44} /></div>
              <div className="action-body">
                <h3>Upload a PDF or TXT</h3>
                <p className="small muted">Read inside your browser. No size limit.</p>
                <Link className="btn small" href="/new?mode=file">Start</Link>
              </div>
            </article>
            <article className="actioncard">
              <div className="art art-pink" aria-hidden="true"><Icon name="file" size={44} /></div>
              <div className="action-body">
                <h3>Paste your notes</h3>
                <p className="small muted">Copy from a lesson, handout, or slides.</p>
                <Link className="btn small" href="/new?mode=paste">Start</Link>
              </div>
            </article>
          </div>
        </section>

        <section aria-labelledby="cont-h">
          <div className="widget-head"><h2 id="cont-h" className="section-title" style={{ margin: 0 }}>Continue studying</h2><Link href="/chats" className="small">See all</Link></div>
          {sets === null ? <p className="muted">Loading...</p> : recent.length === 0 ? (
            <p className="card muted" style={{ marginTop: ".75rem" }}>Your modules will show up here after you add one. They are saved so you can come back any time.</p>
          ) : (
            <div className="grid2" style={{ marginTop: ".75rem" }}>
              {recent.map((s) => {
                const best = s.attempts.length ? Math.max(...s.attempts.map((a) => Math.round((a.correct / Math.max(1, a.total)) * 100))) : null;
                return (
                  <article key={s.id} className="modcard">
                    <h3 title={s.title}>{s.title}</h3>
                    <p className="small muted">{s.cards} flashcards · {s.questions} questions{best !== null ? ` · best ${best}%` : ""}</p>
                    <Link className="btn small" href={`/set/${s.id}`}>Open</Link>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {now && <ActivityChart sets={list} now={now} />}
      </div>

      <div className="dash-side">
        {now && <StudyCalendar days={days} now={now} />}
        <DailyDonut count={count} goal={goal} />
        <section className="card widget streakcard" aria-label="Streak">
          <span className="stat-icon tint-yellow"><Icon name="flame" size={22} /></span>
          <div><div className="stat-value">{streak.current}</div><div className="stat-label">day streak (best {streak.longest})</div></div>
        </section>
      </div>
    </div>
  );
}
