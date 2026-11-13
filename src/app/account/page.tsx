"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase-browser";
import { GoogleG, Icon } from "@/components/Icon";
import { useSets } from "@/components/SetsContext";

export default function Account() {
  const { user, status, reloadUser, signOut } = useAuth();
  const { sets, remove } = useSets();
  const router = useRouter();
  const [recovery, setRecovery] = useState(false);
  const [name, setName] = useState("");
  const [nameMsg, setNameMsg] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [linkMsg, setLinkMsg] = useState("");

  useEffect(() => { setRecovery(new URLSearchParams(window.location.search).get("recovery") === "1"); }, []);
  useEffect(() => { if (user) setName(user.name); }, [user]);
  useEffect(() => { if (status === "local") router.replace("/login"); }, [status, router]);
  if (!user) return null;

  const hasGoogle = user.providers.includes("google");
  const hasEmail = user.providers.includes("email");

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await getSupabase().auth.updateUser({ data: { full_name: name.trim() } });
    if (!error) await reloadUser(); // refresh the name shown everywhere first, then say "Saved."
    setNameMsg(error ? "Could not save your name. Try again." : "Saved.");
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setPwMsg({ ok: false, text: "Use at least 8 characters." });
    if (pw !== pw2) return setPwMsg({ ok: false, text: "The two passwords are not the same." });
    const { error } = await getSupabase().auth.updateUser({ password: pw });
    if (error) setPwMsg({ ok: false, text: /same|different/i.test(error.message) ? "Choose a password you have not used before." : "Could not change the password. If your sign-in is old, sign out, sign in again, and retry." });
    else { setPwMsg({ ok: true, text: hasEmail ? "Password changed." : "Password saved. You can now also sign in with your email and this password." }); setPw(""); setPw2(""); await reloadUser(); }
  }

  async function linkGoogle() {
    setLinkMsg("");
    const { error } = await getSupabase().auth.linkIdentity({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback` } });
    if (error) setLinkMsg(/manual linking|not enabled|disabled/i.test(error.message) ? "Linking is switched off in Supabase. Either turn on 'Allow manual linking' in Supabase Authentication settings, or just use Continue with Google with the same email address, which joins automatically." : "Could not start linking. Try again.");
  }

  async function deleteAll() {
    const n = sets?.length ?? 0;
    if (!n || !window.confirm(`Delete all ${n} of your modules from your account? This cannot be undone.`)) return;
    for (const s of [...(sets ?? [])]) await remove(s.id);
  }

  return (
    <div className="stack narrow">
      <h1 className="page-title">Profile</h1>

      {recovery && <p className="notice good" role="status">You are signed in from your reset link. Choose a new password below.</p>}

      <section className="card">
        <div className="row" style={{ gap: "1rem" }}>
          <span className="avatar big" aria-hidden="true">{user.avatarUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" /> : user.name.slice(0, 1).toUpperCase()}</span>
          <div><h2 style={{ margin: 0 }}>{user.name}</h2><p className="muted" style={{ margin: 0 }}>{user.email}</p></div>
        </div>
        <form onSubmit={saveName} className="row" style={{ marginTop: "1rem", alignItems: "end" }}>
          <div style={{ flex: "1 1 14rem" }}>
            <label htmlFor="dn">Display name</label>
            <input id="dn" type="text" value={name} maxLength={60} onChange={(e) => { setName(e.target.value); setNameMsg(""); }} />
          </div>
          <button className="btn" type="submit" disabled={!name.trim() || name.trim() === user.name}>Save name</button>
        </form>
        {nameMsg && <p className="small muted" role="status" style={{ marginTop: ".5rem", marginBottom: 0 }}>{nameMsg}</p>}
      </section>

      <section className="card">
        <h2>How you sign in</h2>
        <ul className="methods">
          <li><Icon name="user" /> Email and password {hasEmail ? <span className="chip on">Set up</span> : <span className="chip">Not set</span>}</li>
          <li><GoogleG /> Google {hasGoogle ? <span className="chip on">Linked</span> : <span className="chip">Not linked</span>}</li>
        </ul>
        {!hasGoogle && <button className="btn ghost" onClick={() => void linkGoogle()}><Icon name="link" size={18} /> Link my Google account</button>}
        {linkMsg && <p className="notice" role="status" style={{ marginTop: ".75rem" }}>{linkMsg}</p>}
      </section>

      <section className="card">
        <h2>{hasEmail ? "Change password" : "Add a password"}</h2>
        <form onSubmit={savePassword} className="stack">
          <div><label htmlFor="np">New password <span className="small muted">(at least 8 characters)</span></label><input id="np" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
          <div><label htmlFor="np2">Type it again</label><input id="np2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
          <div><button className="btn" type="submit" disabled={!pw}>Save password</button></div>
        </form>
        {pwMsg && <p className={`notice ${pwMsg.ok ? "good" : "error"}`} role={pwMsg.ok ? "status" : "alert"} style={{ marginTop: ".75rem" }}>{pwMsg.text}</p>}
      </section>

      <section className="card">
        <h2>Your data</h2>
        <p className="muted">You have {sets === null ? "..." : sets.length} saved module{sets?.length === 1 ? "" : "s"}. Only you can see them. To close your account completely, ask the site owner to delete it from Supabase.</p>
        <div className="row">
          <button className="btn danger" onClick={() => void deleteAll()} disabled={!sets?.length}>Delete all my modules</button>
          <button className="btn ghost" onClick={() => void signOut()}><Icon name="logout" size={18} /> Log out</button>
        </div>
      </section>
    </div>
  );
}
