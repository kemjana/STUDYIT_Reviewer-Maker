import { NextResponse } from "next/server";
import { fail, rateLimited } from "@/lib/http";
import { listModelNames, pingGemini } from "@/lib/gemini";
import { accessRequired, authConfigured, checkAccess } from "@/lib/server-auth";
import { fetchAuthSettings, getAuthConfig, getSupabaseConfig, pingTable, type AuthSettings } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLES = ["bad_question_reports", "study_sets", "study_set_texts"] as const;

// Open /api/health to see if your settings are picked up. It never shows any secret value.
//   /api/health?live=1    also makes ONE tiny real Gemini request (tests your key, model and speed)
//   /api/health?models=1  also lists the model names your key can use
export async function GET(req: Request) {
  const url = new URL(req.url);
  const wantLive = url.searchParams.get("live") === "1";
  const wantModels = url.searchParams.get("models") === "1";
  if ((wantLive || wantModels) && rateLimited(req, 6)) return fail(429, "rate_limited", "Slow down. Try again in a minute.", true);
  if (wantLive || wantModels) {
    const denied = await checkAccess(req); // only signed-in people (or people with the code) can spend quota here
    if (denied) return denied;
  }

  const gemini: Record<string, unknown> = {
    keySet: Boolean((process.env.GEMINI_API_KEY ?? "").trim()),
    model: (process.env.GEMINI_MODEL ?? "").trim() || null,
    fallbackModel: (process.env.GEMINI_FALLBACK_MODEL ?? "").trim() || null,
    thinking: process.env.GEMINI_THINKING ?? "low",
    mockMode: Boolean(process.env.GEMINI_MOCK),
  };
  if (wantLive) gemini.live = await pingGemini();
  if (wantModels) gemini.models = await listModelNames();

  // Database (secret key): can the server reach the tables?
  let supabase: { configured: boolean; reachable: boolean | null; problem?: string; tables?: Record<string, boolean> } = { configured: false, reachable: null };
  try {
    const cfg = getSupabaseConfig();
    if (cfg) {
      supabase = { configured: true, reachable: null, tables: {} };
      const problems: string[] = [];
      for (const t of TABLES) {
        try {
          await pingTable(cfg, t);
          supabase.tables![t] = true;
        } catch (e) {
          supabase.tables![t] = false;
          problems.push(`${t}: ${e instanceof Error ? e.message.slice(0, 160) : "unknown"}`);
        }
      }
      supabase.reachable = problems.length === 0;
      if (problems.length) supabase.problem = problems.join(" | ");
    }
  } catch (e) {
    supabase = { configured: true, reachable: false, problem: e instanceof Error ? e.message : "bad settings" };
  }

  // Accounts (publishable key): are sign-in methods switched on?
  let accounts: { configured: boolean; reachable: boolean | null; settings?: AuthSettings; problem?: string } = { configured: authConfigured(), reachable: null };
  if (accounts.configured) {
    try {
      const cfg = getAuthConfig();
      accounts = { configured: true, reachable: true, settings: cfg ? await fetchAuthSettings(cfg) : undefined };
    } catch (e) {
      accounts = { configured: true, reachable: false, problem: e instanceof Error ? e.message.slice(0, 300) : "unknown" };
    }
  }

  return NextResponse.json({ ok: true, gemini, supabase, accounts, access: { required: accessRequired() && !authConfigured() } });
}
