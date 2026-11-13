"use client";
import { useMemo, useState } from "react";
import { QUESTION_TYPES, QUESTION_TYPE_LABELS, type Attempt, type QuestionType, type StudySet } from "@/lib/types";
import { newId } from "@/lib/store";
import { logStudyDay } from "@/lib/activity";
import { QuizPractice } from "./QuizPractice";
import { QuizExam } from "./QuizExam";
import { Results } from "./Results";
import { fmtTime, gradeQuestion, shuffled } from "./quiz-utils";

type Props = { set: StudySet; update: (fn: (s: StudySet) => void) => void };
type Answers = Record<string, { given: string; correct: boolean }>;
type Finished = { queue: string[]; answers: Answers; mode: "practice" | "exam"; seconds?: number; limitSeconds?: number; timedOut?: boolean };

export function Quiz({ set, update }: Props) {
  const usable = useMemo(() => set.questions.filter((q) => !set.reported.includes(q.id)), [set.questions, set.reported]);
  const typesPresent = useMemo(() => QUESTION_TYPES.filter((t) => usable.some((q) => q.type === t)), [usable]);

  const [phase, setPhase] = useState<"setup" | "run" | "done">("setup");
  const [mode, setMode] = useState<"practice" | "exam">("practice");
  const [chosen, setChosen] = useState<QuestionType[] | null>(null);
  const [howMany, setHowMany] = useState("10");
  const [custom, setCustom] = useState("15");
  const [minutes, setMinutes] = useState("auto");
  const [customMinutes, setCustomMinutes] = useState("20");
  const [onlyMissed, setOnlyMissed] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  const [runMode, setRunMode] = useState<"practice" | "exam">("practice");
  const [limit, setLimit] = useState(0);
  const [attemptId, setAttemptId] = useState("");
  const [finished, setFinished] = useState<Finished | null>(null);

  const types = chosen ?? typesPresent;
  const missedIds = useMemo(() => {
    const miss = new Set<string>();
    for (const a of set.attempts) for (const x of a.answers) if (!x.correct) miss.add(x.questionId);
    return miss;
  }, [set.attempts]);

  if (!set.questions.length) return <p className="notice">No quiz questions yet. Open the "Make more" tab and add some.</p>;

  const pool = usable.filter((q) => types.includes(q.type) && (!onlyMissed || missedIds.has(q.id)));
  const want = howMany === "all" ? pool.length : howMany === "custom" ? Math.max(1, parseInt(custom, 10) || 1) : parseInt(howMany, 10);
  const roundSize = Math.min(want, pool.length);
  const examSeconds = minutes === "auto" ? roundSize * 60 : (minutes === "custom" ? Math.max(1, parseInt(customMinutes, 10) || 1) : parseInt(minutes, 10)) * 60;

  function begin(ids: string[], m: "practice" | "exam", seconds = 0) {
    setQueue(ids);
    setRunMode(m);
    setLimit(seconds);
    setAttemptId(newId()); // made here, in a click handler, so there is no hydration problem
    setFinished(null);
    setPhase("run");
  }

  /** Grades, saves the attempt (upsert by id, so finishing twice never counts twice), and shows the results. */
  function conclude(ids: string[], given: Record<string, string>, m: "practice" | "exam", extra: { seconds?: number; limitSeconds?: number; timedOut?: boolean }, answeredOnly: boolean) {
    const counted = answeredOnly ? ids.filter((id) => (given[id] ?? "").trim()) : ids;
    if (!counted.length) { setPhase("setup"); return; }
    const answers: Answers = {};
    for (const id of counted) {
      const q = set.questions.find((x) => x.id === id);
      answers[id] = { given: given[id] ?? "", correct: q ? gradeQuestion(q, given[id] ?? "") : false };
    }
    const attempt: Attempt = {
      id: attemptId,
      at: new Date().toISOString(),
      mode: m,
      total: counted.length,
      correct: counted.filter((id) => answers[id].correct).length,
      ...(extra.seconds !== undefined ? { seconds: extra.seconds, limitSeconds: extra.limitSeconds } : {}),
      answers: counted.map((id) => ({ questionId: id, given: answers[id].given, correct: answers[id].correct, topic: set.questions.find((x) => x.id === id)?.topic })),
    };
    update((s) => { s.attempts = [...s.attempts.filter((a) => a.id !== attempt.id), attempt]; });
    logStudyDay(counted.length);
    setFinished({ queue: counted, answers, mode: m, ...extra });
    setPhase("done");
  }

  if (phase === "run" && runMode === "practice") {
    return (
      <QuizPractice
        set={set}
        queue={queue}
        update={update}
        onFinish={(answers, answeredOnly) => conclude(queue, Object.fromEntries(Object.entries(answers).map(([id, a]) => [id, a.given])), "practice", {}, answeredOnly)}
      />
    );
  }
  if (phase === "run" && runMode === "exam") {
    return <QuizExam set={set} queue={queue} limitSeconds={limit} onSubmit={(given, used, timedOut) => conclude(queue, given, "exam", { seconds: used, limitSeconds: limit, timedOut }, false)} />;
  }
  if (phase === "done" && finished) {
    const qs = finished.queue.map((id) => set.questions.find((q) => q.id === id)).filter((q): q is NonNullable<typeof q> => Boolean(q));
    return (
      <Results
        set={set}
        questions={qs}
        answers={finished.answers}
        mode={finished.mode}
        seconds={finished.seconds}
        limitSeconds={finished.limitSeconds}
        timedOut={finished.timedOut}
        update={update}
        onRetryWrong={(ids) => begin(shuffled(ids), "practice")}
        onBack={() => setPhase("setup")}
      />
    );
  }

  return (
    <div className="stack">
      <h2>Quiz</h2>
      <p className="muted">{usable.length} questions are ready{set.reported.length ? " (reported ones are skipped)" : ""}. You choose how many to answer.</p>

      <fieldset>
        <legend>Mode</legend>
        <label className="check"><input type="radio" name="mode" checked={mode === "practice"} onChange={() => setMode("practice")} /><span><strong>Practice.</strong> See right or wrong and the explanation after every question.</span></label>
        <label className="check"><input type="radio" name="mode" checked={mode === "exam"} onChange={() => setMode("exam")} /><span><strong>Exam.</strong> Timed. No answers or explanations until you hand in. You can go back and change answers.</span></label>
      </fieldset>

      <div className="grid2">
        <div>
          <label htmlFor="howmany">How many questions?</label>
          <select id="howmany" value={howMany} onChange={(e) => setHowMany(e.target.value)}>
            {["5", "10", "20", "30", "50"].map((n) => <option key={n} value={n}>{n}</option>)}
            <option value="all">All that match ({pool.length})</option>
            <option value="custom">Another number...</option>
          </select>
          {howMany === "custom" && <input aria-label="Custom number of questions" type="number" min={1} max={Math.max(1, pool.length)} value={custom} onChange={(e) => setCustom(e.target.value)} style={{ marginTop: ".5rem" }} />}
        </div>
        {mode === "exam" && (
          <div>
            <label htmlFor="minutes">Time limit</label>
            <select id="minutes" value={minutes} onChange={(e) => setMinutes(e.target.value)}>
              <option value="auto">Auto: 1 minute per question ({fmtTime(Math.max(0, roundSize) * 60)})</option>
              {["5", "10", "15", "20", "30", "45", "60", "90"].map((m) => <option key={m} value={m}>{m} minutes</option>)}
              <option value="custom">Another number of minutes...</option>
            </select>
            {minutes === "custom" && <input aria-label="Custom minutes" type="number" min={1} max={300} value={customMinutes} onChange={(e) => setCustomMinutes(e.target.value)} style={{ marginTop: ".5rem" }} />}
          </div>
        )}
        <fieldset>
          <legend>Question types</legend>
          {typesPresent.map((t) => (
            <label className="check" key={t}>
              <input type="checkbox" checked={types.includes(t)} onChange={(e) => setChosen(e.target.checked ? [...types, t] : types.filter((x) => x !== t))} />
              {QUESTION_TYPE_LABELS[t]}
            </label>
          ))}
        </fieldset>
      </div>
      {missedIds.size > 0 && <label className="check"><input type="checkbox" checked={onlyMissed} onChange={(e) => setOnlyMissed(e.target.checked)} />Only questions I missed before</label>}
      <button className="btn" disabled={roundSize < 1} onClick={() => begin(shuffled(pool).slice(0, roundSize).map((q) => q.id), mode, mode === "exam" ? examSeconds : 0)}>
        {roundSize < 1 ? "No questions match" : mode === "exam" ? `Start exam (${roundSize} questions, ${fmtTime(examSeconds)})` : `Start quiz (${roundSize} questions)`}
      </button>

      {set.attempts.length > 0 && (
        <section className="card">
          <h3>Your past scores</h3>
          <ul className="points">
            {[...set.attempts].reverse().slice(0, 8).map((a) => (
              <li key={a.id}>{new Date(a.at).toLocaleDateString()} ({a.mode === "exam" ? "exam" : "practice"}): {a.correct} of {a.total} correct</li>
            ))}
          </ul>
          <p className="small muted">See all your scores and your streak on the Progress page.</p>
        </section>
      )}
    </div>
  );
}
