// Browser side of API protection. When accounts are on, every request carries the signed-in person's token.
// When accounts are off, an optional shared ACCESS_CODE is sent instead.
import { getAccessCode } from "./prefs";
import { accountsConfigured, getSupabase } from "./supabase-browser";

export async function authHeaders(): Promise<Record<string, string>> {
  if (accountsConfigured()) {
    const { data } = await getSupabase().auth.getSession(); // refreshes the token if it is about to expire
    return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }
  const code = getAccessCode();
  return code ? { "x-access-code": code } : {};
}
