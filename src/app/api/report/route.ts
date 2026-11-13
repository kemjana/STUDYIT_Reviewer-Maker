import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { fail, isDev, rateLimited } from "@/lib/http";
import { getSupabaseConfig, upsertRow, SupabaseConfigError } from "@/lib/supabase";
import { checkAccess } from "@/lib/server-auth";

export const runtime = "nodejs";

const KINDS = ["question", "flashcard", "reviewer"];

export async function POST(req: Request) {
  if (rateLimited(req, 20)) return fail(429, "rate_limited", "Too many reports. Wait a minute.", true);
  const denied = await checkAccess(req);
  if (denied) return denied;
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return fail(400, "bad_request", "The report was not valid JSON.", false);
  }
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const materialId = text(b.materialId, 80), itemId = text(b.itemId, 80), itemKind = text(b.itemKind, 20);
  if (!materialId || !itemId || !KINDS.includes(itemKind)) return fail(400, "bad_request", "The report is missing details.", false);

  // The key is the same every time for the same item, so sending the report twice never creates two rows.
  const reportKey = createHash("sha256").update(`${materialId}:${itemKind}:${itemId}`).digest("hex");
  const row = {
    report_key: reportKey,
    material_id: materialId,
    item_kind: itemKind,
    item_id: itemId,
    item_text: text(b.itemText, 600),
    source_label: text(b.sourceLabel, 120),
    reason: text(b.reason, 300),
  };

  try {
    const cfg = getSupabaseConfig();
    if (!cfg) return NextResponse.json({ ok: true, stored: false });
    await upsertRow(cfg, "bad_question_reports", row, "report_key");
    return NextResponse.json({ ok: true, stored: true });
  } catch (e) {
    console.error("report not stored:", e instanceof Error ? e.message : e);
    // The student's own flag is already saved in their browser, so this is not an error for them.
    return NextResponse.json({ ok: true, stored: false, ...(isDev || e instanceof SupabaseConfigError ? { note: e instanceof Error ? e.message : String(e) } : {}) });
  }
}
