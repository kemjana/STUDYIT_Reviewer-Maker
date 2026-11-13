"use client";
import { useMemo, useState } from "react";
import type { StudySet } from "@/lib/types";
import { Source } from "./Source";
import { ReportButton } from "./ReportButton";
import { ReadAloud } from "./ReadAloud";
import { ExplainSimpler } from "./ExplainSimpler";
import { logStudyDay } from "@/lib/activity";

type Props = { set: StudySet; update: (fn: (s: StudySet) => void) => void };

export function Flashcards({ set, update }: Props) {
  const [filter, setFilter] = useState<"all" | "again">("all");
  const [order, setOrder] = useState<string[] | null>(null);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const deck = useMemo(() => {
    let cards = set.flashcards.filter((c) => !set.reported.includes(c.id));
    if (filter === "again") cards = cards.filter((c) => set.cardProgress[c.id] !== "known");
    if (order) {
      const pos = new Map(order.map((id, n) => [id, n]));
      cards = [...cards].sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
    }
    return cards;
  }, [set.flashcards, set.reported, set.cardProgress, filter, order]);

  const known = set.flashcards.filter((c) => set.cardProgress[c.id] === "known").length;
  if (!set.flashcards.length) return <p className="notice">No flashcards yet. Open the "Make more" tab and add some.</p>;
  if (!deck.length) {
    return (
      <div className="stack">
        <p className="notice good">Nothing left to study again. You know all {known} cards.</p>
        <button className="btn" onClick={() => { setFilter("all"); setI(0); }}>Show all cards</button>
      </div>
    );
  }
  const card = deck[Math.min(i, deck.length - 1)];
  const idx = Math.min(i, deck.length - 1);
  const go = (n: number) => { setI(Math.max(0, Math.min(deck.length - 1, n))); setFlipped(false); };
  const mark = (v: "known" | "again") => { update((s) => { s.cardProgress[card.id] = v; }); logStudyDay(1); if (idx < deck.length - 1 && filter === "all") go(idx + 1); else setFlipped(false); };

  return (
    <div
      className="stack"
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).tagName === "SELECT") return;
        if (e.key === "ArrowRight") go(idx + 1);
        if (e.key === "ArrowLeft") go(idx - 1);
      }}
    >
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Flashcards</h2>
        <p className="muted" style={{ margin: 0 }} role="status">Card {idx + 1} of {deck.length}. Known: {known} of {set.flashcards.length}.</p>
      </div>
      <div className="row">
        <div>
          <label htmlFor="deck-filter" className="small">Show</label>
          <select id="deck-filter" value={filter} onChange={(e) => { setFilter(e.target.value as "all" | "again"); setI(0); setFlipped(false); }}>
            <option value="all">All cards</option>
            <option value="again">Only cards I have not marked as known</option>
          </select>
        </div>
        <button className="btn ghost small" style={{ alignSelf: "end" }} onClick={() => { const ids = set.flashcards.map((c) => c.id); for (let k = ids.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [ids[k], ids[j]] = [ids[j], ids[k]]; } setOrder(ids); setI(0); setFlipped(false); }}>Shuffle</button>
      </div>
      <button className={`flash ${flipped ? "back flipped" : "front"}`} onClick={() => setFlipped((f) => !f)} aria-label={flipped ? "Answer side. Press to show the question." : "Question side. Press to show the answer."}>
        <span className="side">{flipped ? "Answer" : "Question"} (press to flip)</span>
        <span className="text">{flipped ? card.back : card.front}</span>
      </button>
      <div className="row">
        <button className="btn ghost" onClick={() => go(idx - 1)} disabled={idx === 0}>Previous</button>
        <button className="btn ghost" onClick={() => go(idx + 1)} disabled={idx >= deck.length - 1}>Next</button>
        <button className="btn" onClick={() => mark("known")}>I know this</button>
        <button className="btn ghost" onClick={() => mark("again")}>Study again</button>
      </div>
      <div className="row">
        <ReadAloud text={flipped ? card.back : card.front} label={flipped ? "Read the answer aloud" : "Read the question aloud"} />
      </div>
      <Source sourceId={card.sourceId} evidence={card.evidence} sections={set.sections} />
      {flipped && (
        <ExplainSimpler itemId={card.id} text={`${card.front}\n${card.back}`} sourceId={card.sourceId} sections={set.sections} saved={set.simplified[card.id]} onSaved={(id, simple) => update((s) => { s.simplified[id] = simple; })} />
      )}
      <ReportButton
        materialId={set.id}
        itemId={card.id}
        itemKind="flashcard"
        itemText={`${card.front} / ${card.back}`}
        sourceLabel={set.sections.find((s) => s.id === card.sourceId)?.label ?? ""}
        reported={set.reported.includes(card.id)}
        onReported={(id) => update((s) => { if (!s.reported.includes(id)) s.reported.push(id); })}
      />
    </div>
  );
}
