"use client";
import { useState } from "react";
import type { ExplainResponse, Section } from "@/lib/types";
import { authHeaders } from "@/lib/access";
import { ReadAloud } from "./ReadAloud";

type Props = {
  itemId: string;
  text: string; // what to reword (the original wording)
  sourceId: string;
  sections: Section[];
  saved?: string; // earlier simpler wording, kept so we never ask twice
  onSaved: (itemId: string, simple: string) => void;
};

/** "Explain simpler": rewords an item using only the section it came from. The server rejects added numbers and names. */
export function ExplainSimpler({ itemId, text, sourceId, sections, saved, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shown, setShown] = useState(false);
  const section = sections.find((s) => s.id === sourceId);
  if (!section) return null;

  async function ask() {
    setError("");
    if (saved) return setShown(true);
    setBusy(true);
    try {
      const res = await fetch("/api/explain", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ text, section }) });
      const data = (await res.json()) as ExplainResponse;
      if (data.ok) { onSaved(itemId, data.simple); setShown(true); }
      else setError(data.error.message);
    } catch {
      setError("Could not reach the server. Check your internet connection and try again.");
    }
    setBusy(false);
  }

  return (
    <div>
      {!shown && <button className="btn ghost small no-print" onClick={ask} disabled={busy}>{busy ? "Making it simpler..." : saved ? "Show the simpler version" : "Explain simpler"}</button>}
      {error && <p className="notice error" role="alert" style={{ marginTop: ".5rem" }}>{error}</p>}
      {shown && saved && (
        <div className="simpler" role="note">
          <p><strong>Simpler wording</strong> <span className="muted small">(from your material only)</span></p>
          <p>{saved}</p>
          <div className="row">
            <ReadAloud text={saved} />
            <button className="btn ghost small no-print" onClick={() => setShown(false)}>Hide</button>
          </div>
          <p className="small" style={{ margin: 0 }}>Source: <span className="src">{section.label}</span></p>
        </div>
      )}
    </div>
  );
}
