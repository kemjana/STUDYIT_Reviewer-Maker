"use client";
import { useState } from "react";
import type { QuestionType, StudySet } from "@/lib/types";
import { QUESTION_TYPES } from "@/lib/types";
import { autoCount } from "@/lib/sections";
import { buildTasks } from "@/lib/runner";
import { CountPicker, TypePicker, resolveCount, type CountChoice } from "./Options";
import { RunPanel, useRunner } from "./useRunner";

export function MakeMore({ set, onDone }: { set: StudySet; onDone: (s: StudySet) => void }) {
  const runner = useRunner();
  const [reviewer, setReviewer] = useState(false);
  const [wantFlash, setWantFlash] = useState(true);
  const [wantQuiz, setWantQuiz] = useState(true);
  const [flash, setFlash] = useState<CountChoice>({ choice: "10", custom: "25" });
  const [quiz, setQuiz] = useState<CountChoice>({ choice: "10", custom: "25" });
  const [types, setTypes] = useState<QuestionType[]>([...QUESTION_TYPES]);
  const [problem, setProblem] = useState("");
  const [work, setWork] = useState<StudySet | null>(null);

  async function go() {
    setProblem("");
    if (!reviewer && !wantFlash && !wantQuiz) return setProblem("Choose at least one thing to make.");
    const auto = autoCount(set.sections);
    const { tasks, tooBig } = buildTasks(set.sections, {
      reviewer,
      flashcards: wantFlash ? resolveCount(flash, auto) : 0,
      quiz: wantQuiz ? resolveCount(quiz, auto) : 0,
      types,
    });
    if (tooBig) return setProblem("That is a lot of material for one go. Ask for fewer items, or make a new set from a smaller page range.");
    const { sections, ...rest } = set;
    const copy: StudySet = { ...structuredClone(rest), sections }; // the long text keeps its identity so it is not rewritten
    setWork(copy);
    // The old fronts and questions are sent along so Gemini does not repeat them.
    const outcome = await runner.start(copy, tasks, 0, { avoid: [...copy.flashcards.map((c) => c.front), ...copy.questions.map((q) => q.question)].slice(-60) });
    if (outcome === "done") onDone(copy);
  }

  return (
    <div className="stack">
      <h2>Make more</h2>
      <p className="muted">Add more items to this set. New items come only from the same material, and StudyIt avoids repeating what you already have.</p>
      <fieldset>
        <legend>Add</legend>
        <label className="check"><input type="checkbox" checked={reviewer} onChange={(e) => setReviewer(e.target.checked)} />More reviewer topics and terms</label>
        <label className="check"><input type="checkbox" checked={wantFlash} onChange={(e) => setWantFlash(e.target.checked)} />Flashcards</label>
        <label className="check"><input type="checkbox" checked={wantQuiz} onChange={(e) => setWantQuiz(e.target.checked)} />Quiz questions</label>
      </fieldset>
      <div className="grid2">
        {wantFlash && <CountPicker id="more-flash" label="How many more flashcards?" value={flash} onChange={setFlash} auto={autoCount(set.sections)} />}
        {wantQuiz && <CountPicker id="more-quiz" label="How many more questions?" value={quiz} onChange={setQuiz} auto={autoCount(set.sections)} />}
      </div>
      {wantQuiz && <TypePicker value={types} onChange={setTypes} />}
      {problem && <p className="notice error" role="alert">{problem}</p>}
      <div className="row"><button className="btn" onClick={go} disabled={runner.running}>{runner.running ? "Working..." : "Make more"}</button></div>
      <RunPanel runner={runner} onOpenPartial={work ? () => onDone(work) : undefined} />
    </div>
  );
}
