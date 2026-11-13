"use client";
// Who is signed in. Everything else in the app asks this file; nothing else talks to Supabase Auth directly
// (except the login and account screens, which call the sign-in functions).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { accountsConfigured, getSupabase } from "./supabase-browser";
import { setStoreMode } from "./store";
import { resetCloudCache } from "./store-cloud";

export type AuthUser = { id: string; email: string; name: string; avatarUrl?: string; providers: string[] };
export type AuthStatus = "loading" | "signed_in" | "signed_out" | "local";

type Ctx = {
  status: AuthStatus;
  user: AuthUser | null;
  configured: boolean;
  recovering: boolean; // true after someone opens a "reset password" email link
  signOut: () => Promise<void>;
  reloadUser: () => Promise<void>;
};

const AuthContext = createContext<Ctx>({ status: "loading", user: null, configured: false, recovering: false, signOut: async () => {}, reloadUser: async () => {} });
export const useAuth = () => useContext(AuthContext);

export function toAuthUser(u: User): AuthUser {
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const email = u.email ?? "";
  const name = String(meta.full_name ?? meta.name ?? "").trim() || email.split("@")[0] || "Student";
  const providers = (u.identities ?? []).map((i) => i.provider);
  return { id: u.id, email, name, avatarUrl: typeof meta.avatar_url === "string" ? meta.avatar_url : undefined, providers: providers.length ? providers : ((u.app_metadata?.providers as string[] | undefined) ?? []) };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = accountsConfigured();
  const [status, setStatus] = useState<AuthStatus>(configured ? "loading" : "local");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!configured) { setStoreMode("local"); setStatus("local"); return; }
    const sb = getSupabase();
    let lastId = "";
    const apply = (session: Session | null) => {
      if (session) {
        if (lastId && lastId !== session.user.id) resetCloudCache();
        lastId = session.user.id;
        setStoreMode("cloud"); // set BEFORE the screens load data
        setUser(toAuthUser(session.user));
        setStatus("signed_in");
      } else {
        lastId = "";
        resetCloudCache();
        setUser(null);
        setStatus("signed_out");
      }
    };
    void sb.auth.getSession().then(({ data }) => apply(data.session));
    // Only set state in here; calling Supabase from inside this callback can freeze the library.
    const { data } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      apply(session);
    });
    return () => data.subscription.unsubscribe();
  }, [configured]);

  const signOut = useCallback(async () => { if (configured) await getSupabase().auth.signOut(); }, [configured]);
  const reloadUser = useCallback(async () => {
    if (!configured) return;
    const { data } = await getSupabase().auth.getUser();
    if (data.user) setUser(toAuthUser(data.user));
  }, [configured]);

  const value = useMemo(() => ({ status, user, configured, recovering, signOut, reloadUser }), [status, user, configured, recovering, signOut, reloadUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
