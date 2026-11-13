// The browser's Supabase client. It uses the PUBLISHABLE key (safe for browsers). People sign in with it, and every
// request then carries that person's own token, so row level security in the database keeps their data private.
// The secret key is never used here.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const accountsConfigured = (): boolean => Boolean(url && key);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!accountsConfigured()) throw new Error("Accounts are not set up (SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are missing).");
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
    });
  }
  return client;
}
