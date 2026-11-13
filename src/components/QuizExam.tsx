"use client";
import { useEffect, useRef, useState } from "react";
import type { StudySet } from "@/lib/types";
import { QUESTION_TYPE_LABELS } from "@/lib/types";
import { ReadAloud } from "./ReadAloud";
import { fmtTime, optionsFor, questionSpeech } from "./quiz-utils";

type Props = {
  set: StudySet;
  queue: string[];
  limitSeconds: number;
  onSubmit: (given: Record<string, string>, secondsUsed: number, timedOut: boolean) => void;
};

/** Exam mode: a countdown, no right/wrong and no explanations until you hand in. You can move around and change answers. */
export function QuizExam({ set, queue, limitSeconds, onSubmit }: Props) {
  const [pos, setPos] = useState(0);
  const [given, setGiven] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [left, setLeft] = useState(limitSeconds);
  const [announce, setAnnounce] = useState("");
  const startRef = useRef(0);
  const doneRef = useRef(false);
  const givenRef = useRef(given);
  givenRef.current = given;

  const finish = (timedOut: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    const used = Math.min(limitSeconds, Math.max(1, Math.round((Date.now() - startRef.current) / 1000)));
    onSubmit(givenRef.current, used, timedOut);
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    startRef.current = Date.now();
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((startRef.current + limitSeconds * 1000 - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 300 || remaining === 60 || remaining === 30) setAnnounce(remaining >= 60 ? `${remaining / 60} minute${remaining > 60 ? "s" : ""} left.` : `${remaining} seconds left.`);
      if (remaining <= 0) { clearInterval(timer); finishRef.current(true); }
    }, 500);
    return () => clearInterval(timer);
  }, [limitSeconds]);

  // Warn before the page is closed or refreshed in the middle of an exam.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (!doneRef.current) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const q = set.questions.find((x) => x.id === queue[pos]);
  if (!q) return null;
  const options = optionsFor(q);
  const answered = queue.filter((id) => (given[id] ?? "").trim()).length;

  const hand = () => {
    const missing = queue.length - answered;
    if (missing > 0 && !window.confirm(`You have ${missing} unanswered question${missing > 1 ? "s" : ""}. Hand in anyway?`)) return;
    finish(false);
  };

  return (
    <div className="stack">
      <div className="exam-bar">
        <span className={`timer${left <= 60 ? " low" : ""}`} role="timer" aria-label="Time left">{fmtTime(left)}</span>
        <span className="muted">Answered {answered} of {queue.length}</span>
        <button className="btn" onClick={hand}>Hand in exam</button>
      </div>
      <p className="small muted" role="status" aria-live="polite">{announce}</p>

      <p className="muted" style={{ margin: 0 }}>Question {pos + 1} of {queue.length}. {QUESTION_TYPE_LABELS[q.type]}</p>
      <p className="q">{q.question}</p>
      <ReadAloud text={questionSpeech(q)} label="Read the question aloud" />

      {options.length > 0 ? (
        <div role="group" aria-label="Answer choices">
          {options.map((o) => (
            <button key={o} className={`choice${given[q.id] === o ? " picked" : ""}`} aria-pressed={given[q.id] === o} onClick={() => setGiven((g) => ({ ...g, [q.id]: o }))}>{o}</button>
          ))}
        </div>
      ) : (
        <div>
          <label htmlFor="exam-answer">Your answer</label>
          <input id="exam-answer" type="text" autoComplete="off" value={given[q.id] ?? ""} onChange={(e) => setGiven((g) => ({ ...g, [q.id]: e.target.value }))} />
        </div>
      )}

      <div className="row">
        <button className="btn ghost" onClick={() => setPos(Math.max(0, pos - 1))} disabled={pos === 0}>Previous</button>
        <button className="btn ghost" onClick={() => setPos(Math.min(queue.length - 1, pos + 1))} disabled={pos >= queue.length - 1}>Next</button>
        <button className="btn ghost" onClick={() => setFlagged((f) => ({ ...f, [q.id]: !f[q.id] }))} aria-pressed={Boolean(flagged[q.id])}>{flagged[q.id] ? "Remove flag" : "Flag to review later"}</button>
        {given[q.id] && <button className="btn ghost" onClick={() => setGiven((g) => { const c = { ...g }; delete c[q.id]; return c; })}>Clear my answer</button>}
      </div>

      <div>
        <p className="label">Jump to a question</p>
        <div className="qnav">
          {queue.map((id, i) => {
            const isAnswered = Boolean((given[id] ?? "").trim());
            return (
              <button key={id} className={`${isAnswered ? "answered" : ""}${flagged[id] ? " flagged" : ""}${i === pos ? " current" : ""}`} onClick={() => setPos(i)} aria-label={`Question ${i + 1}, ${isAnswered ? "answered" : "not answered"}${flagged[id] ? ", flagged" : ""}`} aria-current={i === pos ? "true" : undefined}>
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
