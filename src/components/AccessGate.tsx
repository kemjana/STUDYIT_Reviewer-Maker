"use client";
import { useEffect, useState } from "react";
import { getAccessCode, setAccessCode } from "@/lib/prefs";
import { accountsConfigured } from "@/lib/supabase-browser";

export type AccessState = "checking" | "open" | "needed";

async function verify(code: string): Promise<boolean> {
  try {
    const res = await fetch("/api/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    return res.ok;
  } catch {
    return false;
  }
}

/** If the site owner set ACCESS_CODE, this asks for it once and remembers it in this browser. Otherwise it shows nothing. */
export function AccessGate({ onState }: { onState: (s: AccessState) => void }) {
  const [state, setState] = useState<AccessState>("checking");
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  const change = (s: AccessState) => { setState(s); onState(s); };

  useEffect(() => {
    if (accountsConfigured()) { change("open"); return; } // with accounts, signing in is the protection, not a shared code
    let live = true;
    (async () => {
      try {
        const info = (await (await fetch("/api/health")).json()) as { access?: { required?: boolean } };
        if (!live) return;
        if (!info.access?.required) return change("open");
        const saved = getAccessCode();
        if (saved && (await verify(saved))) return live ? change("open") : undefined;
        if (saved) setAccessCode("");
        if (live) change("needed");
      } catch {
        if (live) change("open"); // if the check itself fails, the real request will show the real error
      }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state !== "needed") return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem("");
    if (await verify(code)) { setAccessCode(code.trim()); change("open"); }
    else setProblem("That code is not right. Check it and try again.");
    setBusy(false);
  }

  return (
    <section className="card" aria-labelledby="gate-h">
      <h2 id="gate-h">Enter the access code</h2>
      <p className="muted">This site is shared with a small group. Ask the owner for the code. You only need to enter it once on this device.</p>
      <form onSubmit={submit} className="row">
        <div style={{ flex: "1 1 14rem" }}>
          <label htmlFor="code">Access code</label>
          <input id="code" type="password" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <button className="btn" type="submit" disabled={busy || !code.trim()} style={{ alignSelf: "end" }}>{busy ? "Checking..." : "Unlock"}</button>
      </form>
      {problem && <p className="notice error" role="alert" style={{ marginTop: ".75rem" }}>{problem}</p>}
    </section>
  );
}
