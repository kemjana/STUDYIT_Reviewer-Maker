"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Section, StudySet, QuestionType } from "@/lib/types";
import { QUESTION_TYPES } from "@/lib/types";
import { MAX_MATERIAL_CHARS, autoCount, sectionsFromPages, sectionsFromText, totalChars } from "@/lib/sections";
import { extractPdfPages, PdfReadError } from "@/lib/pdf-client";
import { buildTasks } from "@/lib/runner";
import { newId, requestPersistence, saveSet } from "@/lib/store";
import { useSets } from "./SetsContext";
import { CountPicker, TypePicker, resolveCount, type CountChoice } from "./Options";
import { RunPanel, useRunner } from "./useRunner";
import { AccessGate, type AccessState } from "./AccessGate";

type Loaded = { sections: Section[]; sourceType: StudySet["sourceType"]; fileName?: string; pages: number | null };

export function CreateForm({ initialMode = "paste" }: { initialMode?: "paste" | "file" }) {
  const { refresh } = useSets();
  const router = useRouter();
  const runner = useRunner();
  const working = useRef<StudySet | null>(null);

  const [access, setAccess] = useState<AccessState>("checking");
  const [mode, setMode] = useState<"paste" | "file">(initialMode);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState("");
  const [problem, setProblem] = useState("");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(0);
  const [wantReviewer, setWantReviewer] = useState(true);
  const [wantFlash, setWantFlash] = useState(true);
  const [wantQuiz, setWantQuiz] = useState(true);
  const [flash, setFlash] = useState<CountChoice>({ choice: "auto", custom: "25" });
  const [quiz, setQuiz] = useState<CountChoice>({ choice: "auto", custom: "25" });
  const [types, setTypes] = useState<QuestionType[]>([...QUESTION_TYPES]);

  const slice = useMemo(() => (loaded ? loaded.sections.slice(from, to + 1) : []), [loaded, from, to]);
  const auto = slice.length ? autoCount(slice) : null;

  async function readMaterial() {
    setProblem("");
    setReadNote("");
    setLoaded(null);
    setReading(true);
    try {
      let result: Loaded;
      if (mode === "paste") {
        if (text.length > MAX_MATERIAL_CHARS) throw new Error("That text is very long. Paste a smaller part, or upload a PDF.");
        const sections = sectionsFromText(text);
        if (!sections.length) throw new Error("Paste some text first.");
        result = { sections, sourceType: "text", pages: null };
      } else {
        if (!file) throw new Error("Choose a PDF or TXT file first.");
        const lower = file.name.toLowerCase();
        const baseTitle = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 80) || "Untitled material";
        if (/\.(docx|pptx)$/.test(lower)) throw new Error("Word and PowerPoint files are coming in a later phase. For now, save the file as PDF, or paste the text.");
        if (lower.endsWith(".txt") || file.type === "text/plain") {
          // The file is read right here in the browser. It is never uploaded.
          const t = (await file.text()).slice(0, MAX_MATERIAL_CHARS);
          const sections = sectionsFromText(t);
          if (!sections.length) throw new Error("That text file has no readable text.");
          result = { sections, sourceType: "txt", fileName: file.name, pages: null };
        } else if (lower.endsWith(".pdf") || file.type === "application/pdf") {
          const pages = await extractPdfPages(file, (done, total) => setReadNote(`Reading page ${done} of ${total}...`));
          const sections = sectionsFromPages(pages);
          if (!sections.length) throw new PdfReadError("no_text", "No readable text was found. This PDF is probably scanned pictures. Use a PDF where you can select the text, or paste the text.");
          if (totalChars(sections) > MAX_MATERIAL_CHARS) throw new Error("That PDF has a huge amount of text. Split it into parts of a few hundred pages.");
          result = { sections, sourceType: "pdf", fileName: file.name, pages: pages.length };
        } else {
          throw new Error("Only PDF and TXT files are supported. You can also paste the text.");
        }
        if (!title) setTitle(baseTitle);
      }
      setLoaded(result);
      setFrom(0);
      setTo(result.sections.length - 1);
      if (!title && mode === "paste") setTitle(result.sections[0].label.includes(": ") ? result.sections[0].label.split(": ")[1] : "My pasted notes");
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Something went wrong reading the material.");
    } finally {
      setReading(false);
      setReadNote("");
    }
  }

  async function make() {
    if (!loaded) return;
    setProblem("");
    if (!wantReviewer && !wantFlash && !wantQuiz) return setProblem("Choose at least one thing to make.");
    const wanted = {
      reviewer: wantReviewer,
      flashcards: wantFlash ? resolveCount(flash, autoCount(slice)) : 0,
      quiz: wantQuiz ? resolveCount(quiz, autoCount(slice)) : 0,
      types,
    };
    const { tasks, tooBig } = buildTasks(slice, wanted);
    if (tooBig) return setProblem("That is a lot of material for one go. Pick a smaller page range (for example 40 pages at a time) and make another set for the rest.");
    const set: StudySet = {
      id: newId(),
      title: title.trim() || "Untitled material",
      createdAt: new Date().toISOString(),
      sourceType: loaded.sourceType,
      fileName: loaded.fileName,
      sections: slice,
      reviewer: { topics: [], terms: [] },
      flashcards: [],
      questions: [],
      attempts: [],
      reported: [],
      cardProgress: {},
      simplified: {},
    };
    const saved = await saveSet(set);
    if (!saved.ok) return setProblem(saved.message);
    void requestPersistence();
    void refresh();
    working.current = set;
    const outcome = await runner.start(set, tasks);
    await refresh();
    if (outcome === "done") router.push(`/set/${set.id}`);
  }

  const have = working.current ? working.current.flashcards.length + working.current.questions.length + working.current.reviewer.topics.length : 0;
  const busy = runner.running;
  const locked = access !== "open";
  const rangeLabel = (i: number) => loaded?.sections[i]?.label ?? "";

  return (
    <>
      <AccessGate onState={setAccess} />
      <section className="card stack" aria-labelledby="create-h">
        <h2 id="create-h">Add your material</h2>
        <div className="tabs" role="tablist" aria-label="How to add material">
          {(["paste", "file"] as const).map((m) => (
            <button key={m} role="tab" className="tab" aria-selected={mode === m} onClick={() => { setMode(m); setLoaded(null); setProblem(""); }} disabled={busy || reading}>
              {m === "paste" ? "Paste text" : "Upload PDF or TXT"}
            </button>
          ))}
        </div>

        {mode === "paste" ? (
          <div>
            <label htmlFor="paste">Paste your notes or module text</label>
            <textarea id="paste" value={text} onChange={(e) => { setText(e.target.value); setLoaded(null); }} placeholder="Paste a lesson, handout, or chapter here..." disabled={busy} />
          </div>
        ) : (
          <div className="dropzone">
            <label htmlFor="file">Choose a PDF or TXT file</label>
            <input id="file" type="file" accept=".pdf,.txt,application/pdf,text/plain" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setLoaded(null); }} disabled={busy || reading} />
            <p className="small muted" style={{ margin: ".5rem 0 0" }}>The file is read inside your browser and is never uploaded, so there is no size limit. Use a PDF where you can select the text. Scanned pictures cannot be read yet.</p>
          </div>
        )}

        {!loaded && (
          <div className="row">
            <button className="btn" onClick={readMaterial} disabled={reading || busy || (mode === "paste" ? !text.trim() : !file)}>
              {reading ? "Reading..." : "Read my material"}
            </button>
            {readNote && <span className="muted" role="status">{readNote}</span>}
          </div>
        )}

        {problem && <p className="notice error" role="alert">{problem}</p>}

        {loaded && (
          <div className="stack">
            <p className="notice good" role="status">
              Found {loaded.sections.length} {loaded.sourceType === "pdf" ? `pages with text${loaded.pages ? ` (of ${loaded.pages})` : ""}` : "sections"}, about {totalChars(loaded.sections).toLocaleString()} characters.
            </p>
            <div>
              <label htmlFor="title">Name this study set</label>
              <input id="title" type="text" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
            </div>

            {loaded.sections.length > 1 && (
              <div className="grid2">
                <div>
                  <label htmlFor="from">Start at</label>
                  <select id="from" value={from} onChange={(e) => { const v = Number(e.target.value); setFrom(v); if (v > to) setTo(v); }} disabled={busy}>
                    {loaded.sections.map((s, i) => <option key={s.id} value={i}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="to">End at</label>
                  <select id="to" value={to} onChange={(e) => { const v = Number(e.target.value); setTo(v); if (v < from) setFrom(v); }} disabled={busy}>
                    {loaded.sections.map((s, i) => <option key={s.id} value={i} disabled={i < from}>{s.label}</option>)}
                  </select>
                </div>
                <p className="small muted" style={{ gridColumn: "1 / -1", margin: 0 }}>
                  Using {rangeLabel(from)} to {rangeLabel(to)}. For a big module, work on one part at a time (about 40 pages or fewer per set works well).
                </p>
              </div>
            )}

            <fieldset>
              <legend>What should StudyIt make?</legend>
              <label className="check"><input type="checkbox" checked={wantReviewer} onChange={(e) => setWantReviewer(e.target.checked)} disabled={busy} />Reviewer (chapter-by-chapter outline with topics and key terms)</label>
              <label className="check"><input type="checkbox" checked={wantFlash} onChange={(e) => setWantFlash(e.target.checked)} disabled={busy} />Flashcards</label>
              <label className="check"><input type="checkbox" checked={wantQuiz} onChange={(e) => setWantQuiz(e.target.checked)} disabled={busy} />Quiz questions</label>
            </fieldset>

            {(wantFlash || wantQuiz) && (
              <div className="grid2">
                {wantFlash && <CountPicker id="n-flash" label="How many flashcards?" value={flash} onChange={setFlash} auto={auto} />}
                {wantQuiz && <CountPicker id="n-quiz" label="How many quiz questions?" value={quiz} onChange={setQuiz} auto={auto} />}
              </div>
            )}
            {wantQuiz && <TypePicker value={types} onChange={setTypes} />}

            <div className="row">
              <button className="btn" onClick={make} disabled={busy || locked}>{busy ? "Working..." : locked ? "Enter the access code first" : "Make my study set"}</button>
              <button className="btn ghost" onClick={() => setLoaded(null)} disabled={busy}>Change material</button>
            </div>
          </div>
        )}

        <RunPanel runner={runner} onOpenPartial={have > 0 && working.current ? () => router.push(`/set/${working.current!.id}`) : undefined} />
      </section>
    </>
  );
}
