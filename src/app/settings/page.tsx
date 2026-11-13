"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getGoal, getTheme, setGoal, setTheme, getAccessCode, setAccessCode, type Theme } from "@/lib/prefs";
import { storageEstimate } from "@/lib/store";
import { SpeechSettings } from "@/components/ReadAloud";

const THEMES: { id: Theme; label: string }[] = [{ id: "auto", label: "Auto (follow my device)" }, { id: "light", label: "Light" }, { id: "dark", label: "Dark" }];

export default function Settings() {
  const { configured, status } = useAuth();
  const [theme, setT] = useState<Theme>("auto");
  const [goal, setG] = useState(10);
  const [code, setCode] = useState("");
  const [space, setSpace] = useState<{ used: number; quota: number } | null>(null);
  useEffect(() => { setT(getTheme()); setG(getGoal()); setCode(getAccessCode()); void storageEstimate().then(setSpace); }, []);

  return (
    <div className="stack narrow">
      <h1 className="page-title">Settings</h1>

      <section className="card">
        <h2>Appearance</h2>
        <fieldset>
          <legend>Theme</legend>
          {THEMES.map((t) => (
            <label key={t.id} className="check"><input type="radio" name="theme" checked={theme === t.id} onChange={() => { setTheme(t.id); setT(t.id); }} />{t.label}</label>
          ))}
        </fieldset>
      </section>

      <section className="card">
        <h2>Daily goal</h2>
        <label htmlFor="goal">How many items make a full day?</label>
        <select id="goal" value={goal} onChange={(e) => { const n = Number(e.target.value); setGoal(n); setG(n); }}>
          {[5, 10, 15, 20, 30, 50, 100].map((n) => <option key={n} value={n}>{n} items</option>)}
        </select>
        <p className="small muted" style={{ marginTop: ".5rem" }}>Each flashcard you mark and each question you answer counts as one item. The donut on the Home page shows your progress.</p>
      </section>

      <section className="card">
        <h2>Read aloud</h2>
        <SpeechSettings startOpen />
      </section>

      <section className="card">
        <h2>Where your modules are saved</h2>
        {status === "signed_in" ? (
          <p>In your StudyIt account (Supabase), so they are there on any device where you sign in.</p>
        ) : (
          <p>Only in this browser{space ? ` (${(space.used / 1024 ** 2).toFixed(1)} MB used)` : ""}. {configured ? "" : "Accounts are off on this site."}</p>
        )}
      </section>

      {!configured && (
        <section className="card">
          <h2>Access code</h2>
          <p className="muted small">Only needed if the site owner set ACCESS_CODE. It is remembered on this device.</p>
          <div className="row" style={{ alignItems: "end" }}>
            <div style={{ flex: "1 1 14rem" }}><label htmlFor="ac">Code</label><input id="ac" type="password" autoComplete="off" value={code} onChange={(e) => { setCode(e.target.value); setAccessCode(e.target.value.trim()); }} /></div>
            <button className="btn ghost" onClick={() => { setCode(""); setAccessCode(""); }}>Forget the code</button>
          </div>
        </section>
      )}
    </div>
  );
}
