// Minimal Supabase REST helper (server only). Uses the REST API directly so we control the headers.
// Lessons from the last project are built in:
//  - new "sb_secret_..." keys go ONLY in the apikey header; Authorization: Bearer is added only for old JWT keys (eyJ...)
//  - SUPABASE_URL must be exactly https://PROJECT-ID.supabase.co (no path) or you get a 405
//  - writes are upserts so running them twice never double counts
// The secret key stays on the server. The publishable key is only used to ask Supabase "who is this token?".

export type SupabaseConfig = { url: string; key: string };

export class SupabaseConfigError extends Error {}

function normalizeUrl(rawUrl: string): string {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new SupabaseConfigError("SUPABASE_URL is not a valid web address. It must look like https://abcdefgh.supabase.co");
  }
  // Local addresses are accepted only while developing, or when the test script sets SUPABASE_ALLOW_LOCAL=1.
  const local = (process.env.NODE_ENV !== "production" || process.env.SUPABASE_ALLOW_LOCAL === "1") && ["localhost", "127.0.0.1"].includes(u.hostname);
  if (!local) {
    if (u.protocol !== "https:" || !/^[a-z0-9]+\.supabase\.(co|in)$/i.test(u.hostname)) {
      throw new SupabaseConfigError("SUPABASE_URL must look exactly like https://abcdefgh.supabase.co");
    }
  }
  if (u.pathname !== "/" || u.search || u.hash) {
    throw new SupabaseConfigError("SUPABASE_URL must have no path. Remove anything after .supabase.co (for example /rest/v1).");
  }
  return u.origin;
}

function cleanKey(key: string, name: string): string {
  if (/^["']|["']$/.test(key) || /\s/.test(key)) throw new SupabaseConfigError(`${name} has quotes or spaces in it. Paste the key with no quotes and no spaces.`);
  return key;
}

/** Server-side database access with the SECRET key (used for bad-question reports and the Setup check). */
export function getSupabaseConfig(): SupabaseConfig | null {
  const rawUrl = (process.env.SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
  if (!rawUrl && !key) return null; // not configured: the app still works without Supabase
  if (!rawUrl || !key) throw new SupabaseConfigError("Set both SUPABASE_URL and SUPABASE_SECRET_KEY (one of them is empty).");
  if (key.startsWith("sb_publishable_")) throw new SupabaseConfigError("SUPABASE_SECRET_KEY holds a PUBLISHABLE key. Use the key that starts with sb_secret_ here.");
  return { url: normalizeUrl(rawUrl), key: cleanKey(key, "SUPABASE_SECRET_KEY") };
}

/** For checking sign-in tokens. Needs only the URL and the publishable key. */
export function getAuthConfig(): SupabaseConfig | null {
  const rawUrl = (process.env.SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  if (!rawUrl || !key) return null;
  return { url: normalizeUrl(rawUrl), key: cleanKey(key, "SUPABASE_PUBLISHABLE_KEY") };
}

export function supabaseHeaders(key: string, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json", ...extra };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`; // old JWT-style keys only
  return headers;
}

export class SupabaseHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request(cfg: SupabaseConfig, path: string, init: RequestInit): Promise<Response> {
  const res = await fetch(`${cfg.url}/rest/v1/${path}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new SupabaseHttpError(res.status, `Supabase answered ${res.status} for ${path.split("?")[0]}: ${text.slice(0, 300)}`);
  }
  return res;
}

/** Insert or update one row by a unique column. Safe to run twice. */
export async function upsertRow(cfg: SupabaseConfig, table: string, row: Record<string, unknown>, conflictColumn: string) {
  await request(cfg, `${table}?on_conflict=${encodeURIComponent(conflictColumn)}`, {
    method: "POST",
    headers: supabaseHeaders(cfg.key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(row),
  });
}

/** Cheap connectivity check used by /api/health. */
export async function pingTable(cfg: SupabaseConfig, table: string) {
  await request(cfg, `${table}?select=*&limit=1`, { method: "GET", headers: supabaseHeaders(cfg.key) });
}

export type AuthSettings = { emailEnabled: boolean; googleEnabled: boolean; confirmEmail: boolean; signupDisabled: boolean };

/** What the Supabase Auth settings say (is Google on? must people confirm their email?). Uses only the publishable key. */
export async function fetchAuthSettings(cfg: SupabaseConfig): Promise<AuthSettings> {
  const res = await fetch(`${cfg.url}/auth/v1/settings`, { headers: { apikey: cfg.key }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new SupabaseHttpError(res.status, `Supabase Auth answered ${res.status}. Check SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.`);
  const j = (await res.json()) as { external?: Record<string, boolean>; disable_signup?: boolean; mailer_autoconfirm?: boolean };
  return { emailEnabled: j.external?.email !== false, googleEnabled: Boolean(j.external?.google), confirmEmail: !j.mailer_autoconfirm, signupDisabled: Boolean(j.disable_signup) };
}

const tokenCache = new Map<string, { id: string; until: number }>();

/** Asks Supabase who a sign-in token belongs to. Good answers are remembered for a minute to keep requests fast. */
export async function userIdForToken(cfg: SupabaseConfig, token: string): Promise<string | null> {
  const now = Date.now();
  const hit = tokenCache.get(token);
  if (hit && hit.until > now) return hit.id;
  try {
    const res = await fetch(`${cfg.url}/auth/v1/user`, { headers: { apikey: cfg.key, Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const id = ((await res.json()) as { id?: string }).id;
    if (!id) return null;
    if (tokenCache.size > 500) tokenCache.clear();
    tokenCache.set(token, { id, until: now + 60_000 });
    return id;
  } catch {
    return null;
  }
}
