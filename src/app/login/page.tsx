"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase-browser";
import { Logo, LogoMark } from "@/components/Logo";
import { GoogleG, Icon } from "@/components/Icon";

type Mode = "signin" | "signup" | "reset";
type Msg = { kind: "error" | "ok"; text: string; resend?: boolean } | null;

function explain(error: { message?: string; code?: string; status?: number } | null): { text: string; resend?: boolean } {
  const m = (error?.message ?? "").toLowerCase();
  const code = error?.code ?? "";
  if (code === "invalid_credentials" || m.includes("invalid login credentials")) return { text: "Wrong email or password. If you signed up with Google, use the Continue with Google button." };
  if (code === "email_not_confirmed" || m.includes("email not confirmed")) return { text: "Please confirm your email first. Open the message we sent you and click the link.", resend: true };
  if (code === "user_already_exists" || m.includes("already registered")) return { text: "This email already has an account. Switch to Sign in." };
  if (code === "weak_password" || m.includes("password should")) return { text: "That password is too weak. Use at least 8 characters." };
  if (code === "over_email_send_rate_limit" || m.includes("rate limit") || error?.status === 429) return { text: "Too many emails were sent just now. Wait a few minutes and try again." };
  if (code === "signup_disabled" || m.includes("signups not allowed")) return { text: "New sign-ups are switched off for this site." };
  if (code === "provider_disabled" || m.includes("provider is not enabled") || m.includes("unsupported provider")) return { text: "Google sign-in is not switched on yet. The site owner needs to enable it in Supabase (see SETUP-GUIDE.md)." };
  if (m.includes("failed to fetch") || m.includes("network")) return { text: "Could not reach the sign-in service. Check your internet connection and try again." };
  return { text: "Something went wrong. Please try again." };
}

export default function Login() {
  const { status, configured } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => { if (status === "signed_in") router.replace("/"); }, [status, router]);

  const origin = () => window.location.origin;
  const callback = () => `${origin()}/auth/callback`;

  async function google() {
    setBusy(true); setMsg(null);
    const { error } = await getSupabase().auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback() } });
    if (error) { setMsg({ kind: "error", ...explain(error) }); setBusy(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const mail = email.trim();
    if (!mail) return setMsg({ kind: "error", text: "Type your email address." });
    const sb = getSupabase();
    setBusy(true);
    try {
      if (mode === "reset") {
        const { error } = await sb.auth.resetPasswordForEmail(mail, { redirectTo: callback() });
        if (error) setMsg({ kind: "error", ...explain(error) });
        else setMsg({ kind: "ok", text: "If that email has an account, we sent a link to set a new password. Open it on this device." });
      } else if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email: mail, password });
        if (error) setMsg({ kind: "error", ...explain(error) });
        else router.replace("/");
      } else {
        if (password.length < 8) { setMsg({ kind: "error", text: "Use a password with at least 8 characters." }); setBusy(false); return; }
        const { data, error } = await sb.auth.signUp({ email: mail, password, options: { data: { full_name: name.trim() }, emailRedirectTo: callback() } });
        if (error) setMsg({ kind: "error", ...explain(error) });
        else if (data.session) router.replace("/");
        else if (data.user && (data.user.identities?.length ?? 1) === 0) setMsg({ kind: "error", text: "This email already has an account. Switch to Sign in, or use Continue with Google." });
        else setMsg({ kind: "ok", text: `We sent a confirmation link to ${mail}. Click it, then come back here and sign in.` });
      }
    } catch (e) {
      setMsg({ kind: "error", ...explain(e as Error) });
    }
    setBusy(false);
  }

  async function resend() {
    setBusy(true);
    const { error } = await getSupabase().auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: callback() } });
    setMsg(error ? { kind: "error", ...explain(error) } : { kind: "ok", text: "We sent the confirmation email again." });
    setBusy(false);
  }

  const brand = (
    <aside className="auth-brand">
      <Logo size={44} />
      <h1>Got a huge PDF module? Just StudyIt.</h1>
      <ul>
        <li><Icon name="check" size={18} /> A reviewer, flashcards, and quizzes made only from your own pages</li>
        <li><Icon name="check" size={18} /> Timed exams, read aloud, and a progress dashboard</li>
        <li><Icon name="check" size={18} /> Every module is saved to your account, so you can come back to it</li>
      </ul>
    </aside>
  );

  if (!configured) {
    return (
      <div className="auth">
        {brand}
        <section className="auth-card" aria-labelledby="auth-h">
          <LogoMark size={44} />
          <h2 id="auth-h">Accounts are not set up yet</h2>
          <p className="muted">The site owner has not connected Supabase, so there is nothing to sign in to. You can still use StudyIt. Your modules are saved only in this browser.</p>
          <Link className="btn" href="/">Continue on this device</Link>
          <p className="small muted">Owner: follow Part 5 and Part 6 of SETUP-GUIDE.md to switch on accounts.</p>
        </section>
      </div>
    );
  }

  const title = mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password";
  return (
    <div className="auth">
      {brand}
      <section className="auth-card" aria-labelledby="auth-h">
        <LogoMark size={44} />
        <h2 id="auth-h">{title}</h2>
        <p className="muted">{mode === "reset" ? "We will email you a link to choose a new password." : "Sign in so your modules are saved and waiting for you on any device."}</p>

        {mode !== "reset" && (
          <>
            <button className="btn google" onClick={() => void google()} disabled={busy}><GoogleG /> Continue with Google</button>
            <p className="or" aria-hidden="true"><span>or use your email</span></p>
          </>
        )}

        <form onSubmit={submit} className="stack" noValidate>
          {mode === "signup" && (
            <div>
              <label htmlFor="name">Your name</label>
              <input id="name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </div>
          )}
          <div>
            <label htmlFor="email">Email</label>
            <input id="email" type="text" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {mode !== "reset" && (
            <div>
              <label htmlFor="password">Password {mode === "signup" && <span className="small muted">(at least 8 characters)</span>}</label>
              <div className="pw">
                <input id="password" type={show ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="btn ghost small" onClick={() => setShow((s) => !s)} aria-pressed={show}>{show ? "Hide" : "Show"}</button>
              </div>
            </div>
          )}
          <button className="btn" type="submit" disabled={busy}>{busy ? "Please wait..." : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}</button>
        </form>

        {msg && (
          <div className={`notice ${msg.kind === "error" ? "error" : "good"}`} role={msg.kind === "error" ? "alert" : "status"}>
            {msg.text}
            {msg.resend && <div style={{ marginTop: ".5rem" }}><button className="btn ghost small" onClick={() => void resend()} disabled={busy}>Send the confirmation email again</button></div>}
          </div>
        )}

        <div className="auth-links">
          {mode === "signin" && <><button className="link" onClick={() => { setMode("signup"); setMsg(null); }}>Create a new account</button><button className="link" onClick={() => { setMode("reset"); setMsg(null); }}>Forgot password?</button></>}
          {mode === "signup" && <button className="link" onClick={() => { setMode("signin"); setMsg(null); }}>I already have an account</button>}
          {mode === "reset" && <button className="link" onClick={() => { setMode("signin"); setMsg(null); }}>Back to sign in</button>}
        </div>
        <p className="small muted">Signed up with email first? Sign in with Google using the same email address and they join into one account.</p>
      </section>
    </div>
  );
}
