// TEST-ONLY stand-in for Gemini. It runs only when GEMINI_MOCK is set (never set it on Vercel).
// GEMINI_MOCK=ok          good, grounded answers built from the text itself
// GEMINI_MOCK=badjson     answers with text that is not JSON
// GEMINI_MOCK=fabricate   cites quotes that are NOT in the material (should be rejected)
// GEMINI_MOCK=quota       behaves like a rate-limit error
// GEMINI_MOCK=newfacts    "explain simpler" adds a number that is not in the material (should be rejected)
import type { ExplainRequest, GenerateRequest } from "./types";

function firstSentence(t: string): string {
  const m = t.replace(/\s+/g, " ").trim().match(/^.{20,160}?[.!?](\s|$)/);
  return (m ? m[0] : t.replace(/\s+/g, " ").trim().slice(0, 120)).trim();
}

function guard(mode: string) {
  if (mode === "badjson") return "Sure! Here are your cards: {not json";
  if (mode === "quota") throw Object.assign(new Error("429 RESOURCE_EXHAUSTED quota"), { status: 429 });
  return null;
}

export function mockExplainText(req: ExplainRequest, mode: string): string {
  const bad = guard(mode);
  if (bad) return bad;
  const ev = mode === "fabricate" ? "Penguins are known to build igloos in the Sahara desert every spring" : firstSentence(req.section.text);
  const simple = mode === "newfacts" ? "In simple words: this happened in 1987 and was studied by Einstein." : `In simple words: ${firstSentence(req.section.text)}`;
  return JSON.stringify({ simple, sourceId: req.section.id, evidence: ev });
}

const FAKE_QUOTE = "Penguins are known to build igloos in the Sahara desert every spring";

function pickSpread<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  return Array.from({ length: n }, (_, k) => arr[Math.floor((k * arr.length) / n)]);
}

export function mockModelText(req: GenerateRequest, mode: string): string {
  const bad = guard(mode);
  if (bad) return bad;
  const fab = mode === "fabricate";
  const secs = req.sections.length ? req.sections : [];
  const ev = (i: number) => (fab ? FAKE_QUOTE : firstSentence(secs[i % secs.length].text));
  const n = req.count ?? 3;
  if (req.kind === "reviewer") {
    return JSON.stringify({
      topics: pickSpread(secs, 6).map((s, i) => ({ title: `Topic ${s.label}`, sourceId: s.id, summary: `${firstSentence(s.text)} This is the main idea of ${s.label}.`, keyPoints: ["Point A", "Point B"], evidence: fab ? FAKE_QUOTE : firstSentence(s.text) })),
      terms: secs.slice(0, 2).map((s, i) => ({ term: `Term ${i + 1}`, definition: firstSentence(s.text), sourceId: s.id, evidence: fab ? FAKE_QUOTE : firstSentence(s.text) })),
    });
  }
  if (req.kind === "flashcards") {
    return JSON.stringify({ cards: Array.from({ length: n }, (_, i) => ({ front: `What does ${secs[i % secs.length].label} say? (${i + 1})`, back: firstSentence(secs[i % secs.length].text), topic: "General", sourceId: secs[i % secs.length].id, evidence: ev(i) })) });
  }
  const types = req.types?.length ? req.types : (["multiple_choice", "true_false", "identification", "fill_blank"] as const);
  return JSON.stringify({
    questions: Array.from({ length: n }, (_, i) => {
      const s = secs[i % secs.length];
      const type = types[i % types.length];
      const sentence = firstSentence(s.text);
      const words = sentence.split(" ").filter((w) => w.length > 4);
      const word = (words[0] ?? "answer").replace(/[^\p{L}\p{N}]/gu, "");
      const base = { type, topic: i % 2 ? "Second topic" : "First topic", sourceId: s.id, evidence: ev(i), explanation: `The material says: ${sentence}` };
      if (type === "multiple_choice") return { ...base, question: `Which word appears in ${s.label}? (${i + 1})`, choices: [word, "Zebra", "Quartz", "Nebula"], answer: word };
      if (type === "true_false") return { ...base, question: `${sentence} (${i + 1})`, answer: "True" };
      if (type === "fill_blank") return { ...base, question: `${sentence.replace(word, "_____")} (${i + 1})`, answer: word };
      return { ...base, question: `Name a key word from ${s.label}. (${i + 1})`, answer: word };
    }),
  });
}
