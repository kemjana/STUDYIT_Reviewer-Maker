// Every answer from Gemini goes through here before the app uses it.
// 1. The text must be valid JSON in the shape we asked for.
// 2. Each item must cite a real section of the uploaded material.
// 3. Each item's "evidence" quote must really appear in that section (this is what keeps outside facts out).
// Items that fail are dropped and counted. If nothing survives, the route reports a clear error.

import type { ExplainRequest, GenerateRequest, Question, QuestionType, Flashcard, Term, Topic, Section } from "./types";
import { QUESTION_TYPES } from "./types";
import { squash } from "./sections";

export class ModelOutputError extends Error {
  constructor(public code: "bad_json" | "bad_shape" | "nothing_valid", message: string) {
    super(message);
  }
}

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function parseModelJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    // Sometimes the model adds a sentence before or after the JSON. Try the outermost braces.
    const a = cleaned.indexOf("{");
    const b = cleaned.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(cleaned.slice(a, b + 1));
      } catch {
        /* fall through */
      }
    }
    throw new ModelOutputError("bad_json", "The AI answered with text that is not valid JSON.");
  }
}

function makeSourceCheck(sections: Section[]) {
  const squashed = new Map(sections.map((s) => [s.id, squash(s.text)]));
  return (sourceId: string, evidence: string): boolean => {
    const hay = squashed.get(sourceId);
    if (!hay) return false;
    const needle = squash(evidence);
    return needle.length >= 12 && hay.includes(needle);
  };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Cleaned<T> = { items: T[]; dropped: number };

export function cleanReviewer(data: unknown, req: GenerateRequest): Cleaned<never> & { topics: Omit<Topic, "id">[]; terms: Omit<Term, "id">[] } {
  if (!isObj(data)) throw new ModelOutputError("bad_shape", "The AI answer was not an object.");
  const ok = makeSourceCheck(req.sections);
  let dropped = 0;
  const topics: Omit<Topic, "id">[] = [];
  const terms: Omit<Term, "id">[] = [];
  for (const t of Array.isArray(data.topics) ? data.topics : []) {
    if (!isObj(t)) { dropped++; continue; }
    const sourceId = str(t.sourceId, 20), evidence = str(t.evidence, 400);
    const keyPoints = (Array.isArray(t.keyPoints) ? t.keyPoints : []).map((k) => str(k, 300)).filter(Boolean).slice(0, 6);
    const title = str(t.title, 120), summary = str(t.summary, 1200);
    if (!title || !summary || !ok(sourceId, evidence)) { dropped++; continue; }
    topics.push({ title, summary, keyPoints, sourceId, evidence });
  }
  for (const t of Array.isArray(data.terms) ? data.terms : []) {
    if (!isObj(t)) { dropped++; continue; }
    const sourceId = str(t.sourceId, 20), evidence = str(t.evidence, 400);
    const term = str(t.term, 100), definition = str(t.definition, 600);
    if (!term || !definition || !ok(sourceId, evidence)) { dropped++; continue; }
    terms.push({ term, definition, sourceId, evidence });
  }
  if (!topics.length && !terms.length) throw new ModelOutputError("nothing_valid", "None of the reviewer items could be matched to your material.");
  return { items: [] as never[], dropped, topics, terms };
}

export function cleanFlashcards(data: unknown, req: GenerateRequest): Cleaned<Omit<Flashcard, "id">> {
  if (!isObj(data) || !Array.isArray(data.cards)) throw new ModelOutputError("bad_shape", "The AI answer did not contain a list of cards.");
  const ok = makeSourceCheck(req.sections);
  const items: Omit<Flashcard, "id">[] = [];
  let dropped = 0;
  for (const c of data.cards) {
    if (!isObj(c)) { dropped++; continue; }
    const front = str(c.front, 400), back = str(c.back, 700);
    const sourceId = str(c.sourceId, 20), evidence = str(c.evidence, 400);
    if (!front || !back || !ok(sourceId, evidence)) { dropped++; continue; }
    items.push({ front, back, topic: str(c.topic, 60) || "General", sourceId, evidence });
  }
  if (!items.length) throw new ModelOutputError("nothing_valid", "None of the flashcards could be matched to your material.");
  return { items: items.slice(0, req.count ?? 50), dropped: dropped + Math.max(0, items.length - (req.count ?? 50)) };
}

export function cleanQuestions(data: unknown, req: GenerateRequest): Cleaned<Omit<Question, "id">> {
  if (!isObj(data) || !Array.isArray(data.questions)) throw new ModelOutputError("bad_shape", "The AI answer did not contain a list of questions.");
  const ok = makeSourceCheck(req.sections);
  const allowed: QuestionType[] = req.types?.length ? req.types : [...QUESTION_TYPES];
  const bySection = new Map(req.sections.map((s) => [s.id, squash(s.text)]));
  const items: Omit<Question, "id">[] = [];
  let dropped = 0;
  for (const q of data.questions) {
    if (!isObj(q)) { dropped++; continue; }
    const type = str(q.type, 30) as QuestionType;
    const question = str(q.question, 600), explanation = str(q.explanation, 600);
    let answer = str(q.answer, 300);
    const sourceId = str(q.sourceId, 20), evidence = str(q.evidence, 400);
    if (!allowed.includes(type) || !question || !answer || !explanation || !ok(sourceId, evidence)) { dropped++; continue; }
    const base = { type, question, explanation, topic: str(q.topic, 60) || "General", sourceId, evidence };
    // Other accepted typed answers are kept only if they really appear in the cited section.
    const alternates = (Array.isArray(q.alternates) ? q.alternates : [])
      .map((a) => str(a, 80))
      .filter((a) => a && squash(a) !== squash(answer) && (bySection.get(sourceId) ?? "").includes(squash(a)))
      .slice(0, 2);
    if (type === "multiple_choice") {
      const choices = [...new Set((Array.isArray(q.choices) ? q.choices : []).map((c) => str(c, 200)).filter(Boolean))];
      const match = choices.find((c) => squash(c) === squash(answer));
      if (choices.length !== 4 || !match) { dropped++; continue; }
      items.push({ ...base, choices: shuffle(choices), answer: match });
    } else if (type === "true_false") {
      const a = answer.toLowerCase();
      if (a !== "true" && a !== "false") { dropped++; continue; }
      items.push({ ...base, answer: a === "true" ? "True" : "False" });
    } else if (type === "fill_blank") {
      if (!/_{3,}/.test(question) || answer.length > 80 || !(bySection.get(sourceId) ?? "").includes(squash(answer))) { dropped++; continue; }
      items.push({ ...base, answer, ...(alternates.length ? { alternates } : {}) });
    } else {
      if (answer.length > 80) answer = answer.slice(0, 80);
      items.push({ ...base, answer, ...(alternates.length ? { alternates } : {}) });
    }
  }
  if (!items.length) throw new ModelOutputError("nothing_valid", "None of the questions could be matched to your material.");
  const want = req.count ?? 10;
  return { items: items.slice(0, want), dropped: dropped + Math.max(0, items.length - want) };
}

const STOP_CAPS = new Set(["The", "This", "That", "These", "Those", "It", "They", "You", "When", "If", "In", "On", "A", "An", "And", "But", "So", "For", "Each", "Every", "Some", "Many", "Most", "Also", "Then", "There", "Here", "Because", "Since", "Think", "Remember"]);

/**
 * "Explain simpler" may reword, but it must not bring in new facts. We check that every number and every
 * capitalised name in the simpler text already appears in the material or in the original text.
 */
export function newFactsIn(simple: string, allowed: string): string[] {
  const hay = allowed.toLowerCase().replace(/(\d),(\d)/g, "$1$2");
  const found: string[] = [];
  for (const m of simple.replace(/(\d),(\d)/g, "$1$2").matchAll(/\d+(?:\.\d+)?/g)) {
    if (!hay.includes(m[0])) found.push(m[0]);
  }
  for (const m of simple.matchAll(/\b[A-Z][A-Za-z]{2,}\b/g)) {
    const before = simple.slice(0, m.index).trimEnd();
    const sentenceStart = before === "" || /[.!?:\n]$/.test(before);
    if (sentenceStart || STOP_CAPS.has(m[0])) continue;
    if (!hay.includes(m[0].toLowerCase())) found.push(m[0]);
  }
  return found;
}

export function cleanExplain(data: unknown, req: ExplainRequest): { simple: string; sourceId: string; evidence: string } {
  if (!isObj(data)) throw new ModelOutputError("bad_shape", "The AI answer was not an object.");
  const simple = str(data.simple, 1200), evidence = str(data.evidence, 400);
  const sourceId = req.section.id;
  if (!simple) throw new ModelOutputError("bad_shape", "The simpler text was empty.");
  if (!makeSourceCheck([req.section])(sourceId, evidence)) throw new ModelOutputError("nothing_valid", "The quote did not match the material.");
  const extra = newFactsIn(simple, `${req.section.text}\n${req.text}`);
  if (extra.length) throw new ModelOutputError("nothing_valid", `The simpler text added things that are not in the material: ${extra.slice(0, 3).join(", ")}`);
  return { simple, sourceId, evidence };
}
