// Runs generation in small steps from the browser: one Gemini request per batch and kind.
// This keeps every request short (Vercel has time limits) and lets us show a real progress bar.
import type { ApiError, GenerateKind, GenerateRequest, GenerateResponse, QuestionType, Section, StudySet } from "./types";
import { type Batch, planBatches, splitCount, squash } from "./sections";
import { newId, saveSet } from "./store";
import { authHeaders } from "./access";

export type Task = { key: string; kind: GenerateKind; batch: Batch; count: number; types?: QuestionType[] };

export type Wanted = { reviewer: boolean; flashcards: number; quiz: number; types: QuestionType[] };

export const MAX_PER_KIND = 100;
export const MAX_BATCHES = 40;

export function buildTasks(sections: Section[], wanted: Wanted): { tasks: Task[]; tooBig: boolean } {
  const items = Math.max(wanted.flashcards, wanted.quiz, 1);
  const batches = planBatches(sections, items);
  const tooBig = batches.length > MAX_BATCHES;
  const fc = splitCount(wanted.flashcards, batches);
  const qz = splitCount(wanted.quiz, batches);
  const tasks: Task[] = [];
  batches.forEach((b, i) => {
    if (wanted.reviewer) tasks.push({ key: `r${i}`, kind: "reviewer", batch: b, count: 0 });
    if (wanted.flashcards > 0 && fc[i] > 0) tasks.push({ key: `f${i}`, kind: "flashcards", batch: b, count: Math.min(fc[i], 20) });
    if (wanted.quiz > 0 && qz[i] > 0) tasks.push({ key: `q${i}`, kind: "quiz", batch: b, count: Math.min(qz[i], 20), types: wanted.types });
  });
  return { tasks, tooBig };
}

export type RunState = { done: number; total: number; message: string };
export type RunResult = { ok: true } | { ok: false; error: ApiError; stoppedAt: number };

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Stopped", "AbortError")); }, { once: true });
  });

export async function callGenerate(body: GenerateRequest, signal?: AbortSignal): Promise<GenerateResponse> {
  try {
    const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(body), signal });
    const data = (await res.json()) as GenerateResponse;
    return data;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return { ok: false, error: { code: "network", message: "Could not reach the server. Check your internet connection, then press Retry.", retryable: true } };
  }
}

/** Merge one answer into the study set (skipping duplicates) and save it. Returns a message if the browser could not save. */
export async function mergeResult(set: StudySet, res: Extract<GenerateResponse, { ok: true }>): Promise<string | null> {
  if (res.reviewer) {
    const seenT = new Set(set.reviewer.topics.map((t) => squash(t.title)));
    const seenD = new Set(set.reviewer.terms.map((t) => squash(t.term)));
    for (const t of res.reviewer.topics) if (!seenT.has(squash(t.title))) set.reviewer.topics.push({ ...t, id: newId() });
    for (const t of res.reviewer.terms) if (!seenD.has(squash(t.term))) set.reviewer.terms.push({ ...t, id: newId() });
  }
  if (res.flashcards) {
    const seen = new Set(set.flashcards.map((c) => squash(c.front)));
    for (const c of res.flashcards) if (!seen.has(squash(c.front))) { seen.add(squash(c.front)); set.flashcards.push({ ...c, id: newId() }); }
  }
  if (res.questions) {
    const seen = new Set(set.questions.map((q) => squash(q.question)));
    for (const q of res.questions) if (!seen.has(squash(q.question))) { seen.add(squash(q.question)); set.questions.push({ ...q, id: newId() }); }
  }
  const saved = await saveSet(set);
  return saved.ok ? null : saved.message;
}

/**
 * Run tasks one by one starting at `from`. Retries temporary problems a couple of times with a pause.
 * On a real failure it stops and says where, so the Retry button can continue from that task.
 */
export async function runTasks(
  set: StudySet,
  tasks: Task[],
  from: number,
  onState: (s: RunState) => void,
  signal: AbortSignal,
  extra?: { avoid?: string[]; focusTopics?: string[] },
): Promise<RunResult> {
  const label: Record<GenerateKind, string> = { reviewer: "reviewer", flashcards: "flashcards", quiz: "quiz questions" };
  for (let i = from; i < tasks.length; i++) {
    const t = tasks[i];
    const first = t.batch.sections[0]?.label ?? "";
    const last = t.batch.sections[t.batch.sections.length - 1]?.label ?? "";
    onState({ done: i, total: tasks.length, message: `Making ${label[t.kind]} from ${first}${first !== last ? ` to ${last}` : ""}` });
    let attempt = 0;
    for (;;) {
      const res = await callGenerate(
        {
          kind: t.kind,
          sections: t.batch.sections,
          count: t.count || undefined,
          types: t.types,
          avoid: extra?.avoid ?? [...set.flashcards.map((c) => c.front), ...set.questions.map((q) => q.question)].slice(-40),
          focusTopics: extra?.focusTopics,
        },
        signal,
      );
      if (res.ok) {
        const saveProblem = await mergeResult(set, res);
        if (saveProblem) return { ok: false, error: { code: "storage", message: saveProblem, retryable: false }, stoppedAt: i + 1 };
        break;
      }
      attempt++;
      if (res.error.retryable && attempt <= 2) {
        const wait = res.error.code === "gemini_rate" ? 12_000 : 2_500 * attempt;
        onState({ done: i, total: tasks.length, message: `${res.error.message.split(".")[0]}. Trying again in ${Math.round(wait / 1000)} seconds...` });
        await sleep(wait, signal);
        continue;
      }
      return { ok: false, error: res.error, stoppedAt: i };
    }
  }
  onState({ done: tasks.length, total: tasks.length, message: "Done" });
  return { ok: true };
}
