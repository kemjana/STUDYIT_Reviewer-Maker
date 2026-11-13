import type { NextConfig } from "next";

// The Supabase URL and the PUBLISHABLE key are designed to be public (the browser needs them to sign people in).
// We copy them from the server-side names into NEXT_PUBLIC_ names so you only have to set each value once.
// The SECRET key must never reach the browser, so we stop the build if a secret key is put in the wrong place.
const url = (process.env.SUPABASE_URL ?? "").trim();
const publishable = (process.env.SUPABASE_PUBLISHABLE_KEY ?? "").trim();

function looksSecret(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  if (key.startsWith("eyJ")) {
    try {
      const payload = JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString("utf8")) as { role?: string };
      return payload.role === "service_role";
    } catch {
      return false;
    }
  }
  return false;
}
if (publishable && looksSecret(publishable)) {
  throw new Error(
    "SUPABASE_PUBLISHABLE_KEY contains a SECRET key (sb_secret_... or service_role). That key would be exposed to every visitor. " +
      "Put the key that starts with sb_publishable_ (or the old 'anon' key) there, and keep the secret key only in SUPABASE_SECRET_KEY.",
  );
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR || ".next", // tests build into a separate folder
  env: {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable,
  },
};

export default nextConfig;
