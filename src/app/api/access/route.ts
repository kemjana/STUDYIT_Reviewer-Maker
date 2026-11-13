import { NextResponse } from "next/server";
import { fail, rateLimited } from "@/lib/http";
import { accessRequired, authConfigured, codeMatches } from "@/lib/server-auth";

export const runtime = "nodejs";

// Checks the shared access code (only used when accounts are not set up). Strictly rate limited so the code cannot be guessed quickly.
export async function POST(req: Request) {
  if (rateLimited(req, 10)) return fail(429, "rate_limited", "Too many tries. Wait a minute and try again.", true);
  let code = "";
  try {
    const b = (await req.json()) as { code?: unknown };
    code = typeof b.code === "string" ? b.code.slice(0, 200) : "";
  } catch {
    return fail(400, "bad_request", "Send the code as JSON.", false);
  }
  if (authConfigured() || !accessRequired()) return NextResponse.json({ ok: true, required: false });
  if (!codeMatches(code)) return fail(401, "access_code", "That code is not right. Check it and try again.", false);
  return NextResponse.json({ ok: true, required: true });
}
