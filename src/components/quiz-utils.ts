import type { Question } from "@/lib/types";
import { squash } from "@/lib/sections";
import { gradeAnswer } from "@/lib/grade";

/** Multiple choice and true/false must match exactly; typed answers use the smarter grader. */
export function gradeQuestion(q: Question, given: string): boolean {
  if (!given.trim()) return false;
  if (q.type === "multiple_choice" || q.type === "true_false") return squash(given) === squash(q.answer);
  return gradeAnswer(given, q.answer, q.alternates ?? []).correct;
}

export function optionsFor(q: Question): string[] {
  return q.type === "multiple_choice" ? q.choices ?? [] : q.type === "true_false" ? ["True", "False"] : [];
}

export function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function questionSpeech(q: Question): string {
  const opts = optionsFor(q);
  return opts.length && q.type === "multiple_choice" ? `${q.question} ${opts.map((o, i) => `Choice ${String.fromCharCode(65 + i)}: ${o}.`).join(" ")}` : q.question.replace(/_{3,}/g, "blank");
}

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
