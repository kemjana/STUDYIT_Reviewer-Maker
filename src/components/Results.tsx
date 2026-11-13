"use client";
import { useState } from "react";
import type { Question, StudySet } from "@/lib/types";
import { Source } from "./Source";
import { ReportButton } from "./ReportButton";
import { ReadAloud } from "./ReadAloud";
import { ExplainSimpler } from "./ExplainSimpler";
import { fmtTime } from "./quiz-utils";

type Props = {
  set: StudySet;
  questions: Question[];
  answers: Record<string, { given: string; correct: boolean }>;
  mode: "practice" | "exam";
  seconds?: number;
  limitSeconds?: number;
  timedOut?: boolean;
  update: (fn: (s: StudySet) => void) => void;
  onRetryWrong: (ids: string[]) => void;
  onBack: () => void;
};

export function Results({ set, questions, answers, mode, seconds, limitSeconds, timedOut, update, onRetryWrong, onBack }: Props) {
  const correct = questions.filter((q) => answers[q.id]?.correct).length;
  const wrong = questions.filter((q) => !answers[q.id]?.correct);
  const [onlyWrong, setOnlyWrong] = useState(mode === "practice");
  const shown = onlyWrong ? wrong : questions;

  return (
    <div className="stack">
      <h2>{mode === "exam" ? "Exam finished" : "Quiz finished"}</h2>
      {timedOut && <p className="notice" role="status">Time ran out, so your answers were handed in automatically.</p>}
      <p className="score" role="status">{correct} / {questions.length}</p>
      <p className="muted">
        {Math.round((correct / Math.max(1, questions.length)) * 100)}% correct.
        {mode === "exam" && seconds !== undefined && limitSeconds ? ` Time used: ${fmtTime(seconds)} of ${fmtTime(limitSeconds)}.` : ""} Your score is saved in this browser and shows on your Progress page.
      </p>
      <div className="row">
        {wrong.length > 0 && <button className="btn" onClick={() => onRetryWrong(wrong.map((q) => q.id))}>Practice the {wrong.length} I missed</button>}
        <button className="btn ghost" onClick={onBack}>Back to quiz setup</button>
      </div>

      <section className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>{mode === "exam" ? "Review your exam" : "Review what you missed"}</h3>
          <label className="check" style={{ margin: 0 }}>
            <input type="checkbox" checked={onlyWrong} onChange={(e) => setOnlyWrong(e.target.checked)} />
            Show only the ones I got wrong
          </label>
        </div>
        {shown.length === 0 && <p className="notice good" style={{ marginTop: "1rem" }}>Nothing to review. Every answer was correct.</p>}
        {shown.map((q) => {
          const a = answers[q.id];
          const n = questions.indexOf(q) + 1;
          return (
            <div key={q.id} style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid var(--line)" }}>
              <p style={{ fontWeight: 700, marginBottom: ".3rem" }}>{n}. {q.question}</p>
              <p style={{ marginBottom: ".2rem" }} className={a?.correct ? "notice good" : "notice error"}>
                {a?.correct ? "Correct: " : a?.given ? "Your answer: " : "No answer. "}
                {a?.given ? <strong>{a.given}</strong> : null}
              </p>
              {!a?.correct && <p style={{ marginBottom: ".2rem" }}>Correct answer: <strong>{q.answer}</strong></p>}
              <p className="muted small" style={{ marginBottom: ".2rem" }}>{q.explanation}</p>
              <Source sourceId={q.sourceId} evidence={q.evidence} sections={set.sections} />
              <div className="row" style={{ marginTop: ".4rem" }}>
                <ReadAloud text={`${q.question.replace(/_{3,}/g, "blank")} Answer: ${q.answer}. ${q.explanation}`} />
              </div>
              <ExplainSimpler itemId={q.id} text={`${q.question}\nAnswer: ${q.answer}\n${q.explanation}`} sourceId={q.sourceId} sections={set.sections} saved={set.simplified[q.id]} onSaved={(id, simple) => update((s) => { s.simplified[id] = simple; })} />
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
        })}
      </section>
    </div>
  );
}
