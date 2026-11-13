"use client";
import { useState } from "react";
import { authHeaders } from "@/lib/access";

type Settings = { emailEnabled: boolean; googleEnabled: boolean; confirmEmail: boolean; signupDisabled: boolean };
type Health = {
  gemini: { keySet: boolean; model: string | null; fallbackModel: string | null; thinking: string; mockMode: boolean; live?: { ok: boolean; ms?: number; model?: string; error?: { message: string; code: string; detail?: string } }; models?: { ok: boolean; names?: string[]; error?: { message: string } } };
  supabase: { configured: boolean; reachable: boolean | null; problem?: string; tables?: Record<string, boolean> };
  accounts: { configured: boolean; reachable: boolean | null; settings?: Settings; problem?: string };
  access: { required: boolean };
};

const Row = ({ ok, children }: { ok: boolean | null; children: React.ReactNode }) => (
  <li style={{ margin: ".5rem 0" }}><strong aria-hidden="true">{ok === null ? "-" : ok ? "OK" : "Fix"}</strong> <span className="muted">{ok === null ? "(optional)" : ok ? "(good)" : "(needs attention)"}</span> {children}</li>
);

export default function CheckPage() {
  const [h, setH] = useState<Health | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function run(deep: boolean) {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/health${deep ? "?live=1&models=1" : ""}`, { headers: await authHeaders() });
      const data = await res.json();
      if (!res.ok) setErr(data?.error?.message ?? "The check could not run.");
      else setH(data as Health);
    } catch {
      setErr("Could not reach the server.");
    }
    setBusy(false);
  }

  const a = h?.accounts;
  return (
    <div className="stack narrow">
      <div>
        <h1 className="page-title">Setup check</h1>
        <p className="muted">See if your settings are picked up, and test your real Gemini key with one tiny request. No secret values are ever shown here.</p>
      </div>
      <div className="row">
        <button className="btn ghost" onClick={() => run(false)} disabled={busy}>Quick check (free)</button>
        <button className="btn" onClick={() => run(true)} disabled={busy}>Test Gemini now (1 small request)</button>
      </div>
      {err && <p className="notice error" role="alert">{err}</p>}
      {h && (
        <section className="card" aria-live="polite">
          <h2>Results</h2>
          <h3>Gemini</h3>
          <ul style={{ listStyle: "none", padding: 0 }}>
            <Row ok={h.gemini.keySet}>Gemini key is {h.gemini.keySet ? "set" : "missing. Add GEMINI_API_KEY."}</Row>
            <Row ok={Boolean(h.gemini.model)}>Model: <code>{h.gemini.model ?? "missing. Add GEMINI_MODEL."}</code>{h.gemini.fallbackModel ? <> (fallback: <code>{h.gemini.fallbackModel}</code>)</> : null}. Thinking: {h.gemini.thinking}.</Row>
            {h.gemini.mockMode && <Row ok={false}>Test mode is ON (GEMINI_MOCK). Remove it so real Gemini is used.</Row>}
            {h.gemini.live && (
              <Row ok={h.gemini.live.ok}>
                {h.gemini.live.ok ? <>Real Gemini answered in {((h.gemini.live.ms ?? 0) / 1000).toFixed(1)} seconds. A full batch takes longer, usually a few seconds to about half a minute.</> : <>Gemini test failed: {h.gemini.live.error?.message}{h.gemini.live.error?.detail ? ` (${h.gemini.live.error.detail})` : ""}</>}
              </Row>
            )}
          </ul>

          <h3>Accounts and saving</h3>
          <ul style={{ listStyle: "none", padding: 0 }}>
            <Row ok={a?.configured ? a.reachable === true : null}>
              Sign-in: {!a?.configured ? "not set up. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to switch on accounts. Until then, modules are saved only in the browser." : a.reachable ? "the sign-in service answered." : `problem: ${a.problem ?? "unknown"}`}
            </Row>
            {a?.settings && <Row ok={a.settings.emailEnabled && !a.settings.signupDisabled}>Email sign-up is {a.settings.emailEnabled && !a.settings.signupDisabled ? "on" : "off. Turn it on in Supabase > Authentication."}{a.settings.emailEnabled && a.settings.confirmEmail ? " New people must confirm their email before signing in." : ""}</Row>}
            {a?.settings && <Row ok={a.settings.googleEnabled}>Google sign-in is {a.settings.googleEnabled ? "on." : "off. Turn it on in Supabase > Authentication > Sign In / Providers > Google (see SETUP-GUIDE.md Part 6)."}</Row>}
            <Row ok={h.supabase.configured ? h.supabase.reachable === true : null}>
              Database tables: {!h.supabase.configured ? "server database key not set (optional; only needed for the report button)." : h.supabase.reachable ? "all StudyIt tables found." : `problem: ${h.supabase.problem ?? "unknown"}. Did you run schema.sql?`}
            </Row>
            <Row ok={h.access.required}>
              Shared access code: {h.access.required ? "ON." : a?.configured ? "not needed. Signing in protects your Gemini key." : "OFF. Anyone with your link can use your Gemini key. Switch on accounts (or set ACCESS_CODE) before sharing the link."}
            </Row>
          </ul>

          {h.gemini.models && (
            <div>
              <h3>Models your key can use</h3>
              {h.gemini.models.ok ? (
                <>
                  <p className="small muted">Copy one of these names into GEMINI_MODEL. Names with &quot;flash&quot; are usually fastest. Names with &quot;lite&quot; are lighter.</p>
                  <ul className="points">{h.gemini.models.names?.slice(0, 25).map((n) => <li key={n}><code>{n}</code></li>)}</ul>
                </>
              ) : <p className="notice error">{h.gemini.models.error?.message}</p>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
