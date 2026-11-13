"use client";
import { useState } from "react";
import { authHeaders } from "@/lib/access";

type Props = {
  materialId: string;
  itemId: string;
  itemKind: "question" | "flashcard";
  itemText: string;
  sourceLabel: string;
  reported: boolean;
  onReported: (itemId: string) => void;
};

const REASONS = ["The answer is wrong", "It is not in my material", "It is confusing", "Something else"];

export function ReportButton({ materialId, itemId, itemKind, itemText, sourceLabel, reported, onReported }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    // The flag is saved in this browser first, so it works even if the server is unreachable.
    onReported(itemId);
    try {
      await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ materialId, itemId, itemKind, itemText: itemText.slice(0, 500), sourceLabel, reason }),
      });
    } catch {
      /* the local flag is enough */
    }
    setBusy(false);
    setOpen(false);
  }

  if (reported) return <p className="small muted" role="status">Reported. We will skip this {itemKind} in your quizzes.</p>;
  if (!open) return <button className="btn ghost small" onClick={() => setOpen(true)}>Report a bad {itemKind}</button>;
  return (
    <div className="card" style={{ margin: ".5rem 0" }}>
      <label htmlFor={`why-${itemId}`}>What is wrong?</label>
      <select id={`why-${itemId}`} value={reason} onChange={(e) => setReason(e.target.value)}>
        {REASONS.map((r) => <option key={r}>{r}</option>)}
      </select>
      <p className="small muted" style={{ marginTop: ".5rem" }}>This sends only the {itemKind} text and your reason, not your whole material.</p>
      <div className="row">
        <button className="btn small" onClick={send} disabled={busy}>{busy ? "Sending..." : "Send report"}</button>
        <button className="btn ghost small" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
