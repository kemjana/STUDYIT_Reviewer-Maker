import { NextResponse } from "next/server";
import { fail, rateLimited } from "@/lib/http";
import { askModel, GeminiCallError } from "@/lib/gemini";
import { checkAccess } from "@/lib/server-auth";
import { buildPrompt } from "@/lib/prompts";
import { mockModelText } from "@/lib/mock-gemini";
import { cleanFlashcards, cleanQuestions, cleanReviewer, ModelOutputError, parseModelJson } from "@/lib/validate";
import { QUESTION_TYPES, type GenerateKind, type GenerateRequest, type GenerateResponse, type QuestionType, type Section } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const KINDS: GenerateKind[] = ["reviewer", "flashcards", "quiz"];

function readBody(raw: unknown): GenerateRequest | string {
  if (typeof raw !== "object" || raw === null) return "The request was empty.";
  const b = raw as Record<string, unknown>;
  if (!KINDS.includes(b.kind as GenerateKind)) return "Unknown kind. Use reviewer, flashcards, or quiz.";
  if (!Array.isArray(b.sections) || b.sections.length < 1 || b.sections.length > 60) return "Send between 1 and 60 sections.";
  let chars = 0;
  const sections: Section[] = [];
  for (const s of b.sections) {
    const o = s as Record<string, unknown>;
    if (typeof o?.id !== "string" || !/^s\d{1,5}$/.test(o.id) || typeof o.label !== "string" || typeof o.text !== "string") return "A section is malformed.";
    chars += o.text.length;
    sections.push({ id: o.id, label: o.label.slice(0, 120), text: o.text });
  }
  if (chars > 60_000) return "That batch is too large. The app should send smaller batches.";
  const kind = b.kind as GenerateKind;
  const out: GenerateRequest = { kind, sections };
  if (kind !== "reviewer") {
    const count = Number(b.count);
    if (!Number.isInteger(count) || count < 1 || count > 20) return "count must be a whole number from 1 to 20 per request.";
    out.count = count;
  }
  if (Array.isArray(b.types)) {
    const types = b.types.filter((t): t is QuestionType => QUESTION_TYPES.includes(t as QuestionType));
    if (types.length) out.types = types;
  }
  if (Array.isArray(b.avoid)) out.avoid = b.avoid.filter((a): a is string => typeof a === "string").slice(0, 60);
  if (Array.isArray(b.focusTopics)) out.focusTopics = b.focusTopics.filter((a): a is string => typeof a === "string").slice(0, 10);
  return out;
}

export async function POST(req: Request) {
  if (rateLimited(req, 40)) return fail(429, "rate_limited", "Too many requests. Wait a minute and press Retry.", true);
  const denied = await checkAccess(req);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_request", "The request was not valid JSON.", false);
  }
  const parsed = readBody(body);
  if (typeof parsed === "string") return fail(400, "bad_request", parsed, false);

  try {
    // One quiet retry when the AI's answer is not usable. Network or quota problems are reported to the student instead.
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await askModel({ kind: parsed.kind, prompt: buildPrompt(parsed), mock: (m) => mockModelText(parsed, m) });
        const data = parseModelJson(text);
        let result: GenerateResponse;
        if (parsed.kind === "reviewer") {
          const r = cleanReviewer(data, parsed);
          result = { ok: true, kind: "reviewer", reviewer: { topics: r.topics, terms: r.terms }, dropped: r.dropped };
        } else if (parsed.kind === "flashcards") {
          const r = cleanFlashcards(data, parsed);
          result = { ok: true, kind: "flashcards", flashcards: r.items, dropped: r.dropped };
        } else {
          const r = cleanQuestions(data, parsed);
          result = { ok: true, kind: "quiz", questions: r.items, dropped: r.dropped };
        }
        return NextResponse.json(result);
      } catch (e) {
        lastError = e;
        if (e instanceof ModelOutputError) continue;
        throw e;
      }
    }
    throw lastError;
  } catch (e) {
    if (e instanceof GeminiCallError) {
      console.error("gemini error:", e.api.code, e.api.detail ?? "");
      return fail(e.status, e.api.code, e.api.message, e.api.retryable, e.api.detail);
    }
    if (e instanceof ModelOutputError) {
      console.error("model output rejected:", e.code, e.message);
      const msg =
        e.code === "nothing_valid"
          ? "The AI's answers could not be matched to your material, so none were kept. Press Retry. If it keeps happening, try a smaller page range."
          : "The AI sent an answer the app could not read. Press Retry.";
      return fail(502, e.code, msg, true, e.message);
    }
    console.error("generate failed:", e instanceof Error ? e.message : e);
    return fail(500, "server_error", "Something went wrong on the server. Press Retry.", true, e);
  }
}
