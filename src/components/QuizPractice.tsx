"use client";
import { useState } from "react";
import type { Question, StudySet } from "@/lib/types";
import { Source } from "./Source";
import { ReportButton } from "./ReportButton";
import { ReadAloud } from "./ReadAloud";
import { ExplainSimpler } from "./ExplainSimpler";
import { QUESTION_TYPE_LABELS } from "@/lib/types";
import { squash } from "@/lib/sections";
import { gradeQuestion, optionsFor, questionSpeech } from "./quiz-utils";

type Answers = Record<string, { given: string; correct: boolean }>;
type Props = {
  set: StudySet;
  queue: string[];
  update: (fn: (s: StudySet) => void) => void;
  onFinish: (answers: Answers, answeredOnly: boolean) => void;
};

/** Practice mode: you see right or wrong, the explanation, and the source after every question. */
export function QuizPractice({ set, queue, update, onFinish }: Props) {
  const [pos, setPos] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [typed, setTyped] = useState("");

  const q: Question | undefined = set.questions.find((x) => x.id === queue[pos]);
  if (!q) return <button className="btn" onClick={() => onFinish(answers, true)}>Back</button>;
  const given = answers[q.id];
  const checked = Boolean(given);
  const options = optionsFor(q);

  const submit = (value: string, forceCorrect?: boolean) =>
    setAnswers((a) => ({ ...a, [q.id]: { given: value, correct: forceCorrect ?? gradeQuestion(q, value) } }));
  const next = () => {
    if (pos + 1 >= queue.length) onFinish(answers, false);
    else { setPos(pos + 1); setTyped(""); }
  };

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <p className="muted" style={{ margin: 0 }} role="status">Question {pos + 1} of {queue.length}. {QUESTION_TYPE_LABELS[q.type]}</p>
        <button className="btn ghost small" onClick={() => onFinish(answers, true)}>End quiz now</button>
      </div>
      <p className="q">{q.question}</p>
      <ReadAloud text={questionSpeech(q)} label="Read the question aloud" />

      {options.length > 0 ? (
        <div role="group" aria-label="Answer choices">
          {options.map((o) => {
            const isAnswer = squash(o) === squash(q.answer);
            const cls = checked ? (isAnswer ? "choice right" : given.given === o ? "choice wrong" : "choice") : "choice";
            return (
              <button key={o} className={cls} disabled={checked} onClick={() => submit(o)}>
                {o}{checked && isAnswer ? " (correct)" : ""}{checked && given.given === o && !isAnswer ? " (your answer)" : ""}
              </button>
            );
          })}
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (!checked && typed.trim()) submit(typed.trim()); }}>
          <label htmlFor="typed-answer">Your answer</label>
          <input id="typed-answer" type="text" autoComplete="off" value={checked ? given.given : typed} disabled={checked} onChange={(e) => setTyped(e.target.value)} />
          {!checked && <button className="btn" type="submit" style={{ marginTop: ".6rem" }} disabled={!typed.trim()}>Check answer</button>}
        </form>
      )}

      {checked && (
        <div className={`result ${given.correct ? "right" : "wrong"}`} role="status">
          <p style={{ fontWeight: 800, marginBottom: ".2rem" }}>{given.correct ? "Correct" : "Not quite"}</p>
          {!given.correct && <p style={{ marginBottom: ".2rem" }}>Answer: <strong>{q.answer}</strong></p>}
          <p style={{ marginBottom: ".3rem" }}>{q.explanation}</p>
          <Source sourceId={q.sourceId} evidence={q.evidence} sections={set.sections} />
          <div className="row" style={{ marginTop: ".4rem" }}>
            <ReadAloud text={`${given.correct ? "Correct." : `The answer is ${q.answer}.`} ${q.explanation}`} label="Read the explanation aloud" />
          </div>
          <ExplainSimpler itemId={q.id} text={`${q.question}\nAnswer: ${q.answer}\n${q.explanation}`} sourceId={q.sourceId} sections={set.sections} saved={set.simplified[q.id]} onSaved={(id, simple) => update((s) => { s.simplified[id] = simple; })} />
        </div>
      )}
      {checked && !given.correct && (q.type === "identification" || q.type === "fill_blank") && (
        <button className="btn ghost small" onClick={() => submit(given.given, true)}>My answer means the same. Mark it correct.</button>
      )}
      {checked && <div className="row"><button className="btn" onClick={next}>{pos + 1 >= queue.length ? "See my score" : "Next question"}</button></div>}
      <ReportButton
        materialId={set.id}
        itemId={q.id}
        itemKind="question"
        itemText={q.question}
        sourceLabel={set.sections.find((s) => s.id === q.sourceId)?.label ?? ""}
        reported={set.reported.includes(q.id)}
        onReported={(id) => update((s) => { if (!s.reported.includes(id)) s.reported.push(id); })}
      />
    </div>
  );
}
