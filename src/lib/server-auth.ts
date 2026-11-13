// Who may use the routes that spend your Gemini quota or write to your database (server only).
//  - Accounts on (SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY set): the request must carry a valid sign-in token.
//  - Accounts off, ACCESS_CODE set: the request must carry the shared code.
//  - Neither: open (fine for testing alone on your own computer).
import { createHash, timingSafeEqual } from "node:crypto";
import { fail } from "./http";
import { getAuthConfig, SupabaseConfigError, userIdForToken } from "./supabase";

export function accessRequired(): boolean {
  return Boolean((process.env.ACCESS_CODE ?? "").trim());
}

export function authConfigured(): boolean {
  return Boolean((process.env.SUPABASE_URL ?? "").trim() && (process.env.SUPABASE_PUBLISHABLE_KEY ?? "").trim());
}

const digest = (s: string) => createHash("sha256").update(s).digest();

export function codeMatches(given: string): boolean {
  const expected = (process.env.ACCESS_CODE ?? "").trim();
  if (!expected) return true;
  return timingSafeEqual(digest(given.trim()), digest(expected));
}

/** Returns an error response when the request is not allowed, or null when it may continue. */
export async function checkAccess(req: Request) {
  if (authConfigured()) {
    try {
      const cfg = getAuthConfig();
      const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
      if (cfg && token && (await userIdForToken(cfg, token))) return null;
    } catch (e) {
      if (e instanceof SupabaseConfigError) return fail(500, "supabase_config", e.message, false);
    }
    return fail(401, "login_required", "Please sign in to use StudyIt.", false);
  }
  if (!accessRequired()) return null;
  if (codeMatches(req.headers.get("x-access-code") ?? "")) return null;
  return fail(401, "access_code", "This site needs an access code. Enter the code you were given on the home page.", false);
}
