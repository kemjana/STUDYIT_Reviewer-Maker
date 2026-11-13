import { NextResponse } from "next/server";
import { fail, rateLimited } from "@/lib/http";
import { askModel, GeminiCallError } from "@/lib/gemini";
import { checkAccess } from "@/lib/server-auth";
import { buildExplainPrompt } from "@/lib/prompts";
import { mockExplainText } from "@/lib/mock-gemini";
import { cleanExplain, ModelOutputError, parseModelJson } from "@/lib/validate";
import type { ExplainRequest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (rateLimited(req, 30)) return fail(429, "rate_limited", "Too many requests. Wait a minute and try again.", true);
  const denied = await checkAccess(req);
  if (denied) return denied;
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return fail(400, "bad_request", "The request was not valid JSON.", false);
  }
  const s = b.section as Record<string, unknown> | undefined;
  if (typeof b.text !== "string" || !b.text.trim() || b.text.length > 3000) return fail(400, "bad_request", "Send the text to simplify (up to 3000 characters).", false);
  if (!s || typeof s.id !== "string" || !/^s\d{1,5}$/.test(s.id) || typeof s.label !== "string" || typeof s.text !== "string" || s.text.length > 30_000)
    return fail(400, "bad_request", "The source section is missing or too large.", false);
  const parsed: ExplainRequest = { text: b.text.trim(), section: { id: s.id, label: s.label.slice(0, 120), text: s.text } };

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await askModel({ kind: "explain", prompt: buildExplainPrompt(parsed), mock: (m) => mockExplainText(parsed, m) });
        const r = cleanExplain(parseModelJson(text), parsed);
        return NextResponse.json({ ok: true, ...r });
      } catch (e) {
        if (e instanceof ModelOutputError && attempt === 0) continue;
        throw e;
      }
    }
    throw new Error("unreachable");
  } catch (e) {
    if (e instanceof GeminiCallError) return fail(e.status, e.api.code, e.api.message, e.api.retryable, e.api.detail);
    if (e instanceof ModelOutputError) {
      console.error("explain rejected:", e.code, e.message);
      return fail(502, e.code, "StudyIt could not make a simpler version that stays inside your material. Press the button again, or read the original wording.", true, e.message);
    }
    console.error("explain failed:", e instanceof Error ? e.message : e);
    return fail(500, "server_error", "Something went wrong on the server. Try again.", true, e);
  }
}
