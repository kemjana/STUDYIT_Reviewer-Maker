"use client";
import { useEffect, useMemo, useState } from "react";
import type { StudySet } from "@/lib/types";
import { detectChapters } from "@/lib/sections";
import { Source } from "./Source";
import { ReadAloud } from "./ReadAloud";
import { ExplainSimpler } from "./ExplainSimpler";

type Props = { set: StudySet; update: (fn: (s: StudySet) => void) => void };

export function Reviewer({ set, update }: Props) {
  const [quotes, setQuotes] = useState(false);
  const { topics, terms } = set.reviewer;

  // Chapter-by-chapter outline: items are put in the order of the module and grouped under the chapter headings we can find.
  const outline = useMemo(() => {
    const index = new Map(set.sections.map((s, i) => [s.id, i]));
    const at = (id: string) => index.get(id) ?? 0;
    return detectChapters(set.sections)
      .map((c) => ({
        ...c,
        topics: topics.filter((t) => at(t.sourceId) >= c.from && at(t.sourceId) <= c.to).sort((a, b) => at(a.sourceId) - at(b.sourceId)),
        terms: terms.filter((t) => at(t.sourceId) >= c.from && at(t.sourceId) <= c.to).sort((a, b) => at(a.sourceId) - at(b.sourceId)),
      }))
      .filter((c) => c.topics.length || c.terms.length);
  }, [set.sections, topics, terms]);

  // Closed sections do not print, so open everything just before printing.
  useEffect(() => {
    const openAll = () => document.querySelectorAll("details").forEach((d) => { d.open = true; });
    window.addEventListener("beforeprint", openAll);
    return () => window.removeEventListener("beforeprint", openAll);
  }, []);

  if (!topics.length && !terms.length) return <p className="notice">No reviewer yet. Open the "Make more" tab and add one.</p>;

  const whole = outline
    .map((c) => `${c.title}. ${c.topics.map((t) => `${t.title}. ${t.summary} ${t.keyPoints.join(". ")}`).join(" ")} ${c.terms.map((t) => `${t.term}: ${t.definition}`).join(" ")}`)
    .join(" ");
  const saveSimple = (id: string, simple: string) => update((s) => { s.simplified[id] = simple; });

  return (
    <div className={quotes ? "print-quotes" : ""}>
      <div className="print-only">
        <h1 style={{ fontSize: "20pt" }}>{set.title}: reviewer</h1>
        <p>Made with StudyIt from the student's own material. Source labels show where each item came from.</p>
      </div>
      <div className="row no-print" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Reviewer</h2>
        <div className="row">
          <ReadAloud text={whole} label="Read the whole reviewer" />
          <button className="btn small" onClick={() => window.print()}>Print or save as PDF</button>
        </div>
      </div>
      <label className="check no-print" style={{ marginTop: ".5rem" }}>
        <input type="checkbox" checked={quotes} onChange={(e) => setQuotes(e.target.checked)} />
        Include the source quotes when printing
      </label>

      {outline.length > 1 && (
        <nav aria-label="Chapters" className="no-print" style={{ marginTop: "1rem" }}>
          <p className="label">Outline</p>
          <ol className="toc">
            {outline.map((c) => <li key={c.id}><a href={`#ch-${c.id}`}>{c.title}</a></li>)}
          </ol>
        </nav>
      )}

      {outline.map((c) => (
        <details key={c.id} id={`ch-${c.id}`} className="chapter" open>
          <summary>{c.title} <span className="muted small">({set.sections[c.from].label}{c.from !== c.to ? ` to ${set.sections[c.to].label}` : ""})</span></summary>
          <div className="chapter-body">
            {c.topics.map((t) => (
              <article key={t.id} className="card">
                <h3>{t.title}</h3>
                <p>{t.summary}</p>
                {t.keyPoints.length > 0 && <ul className="points">{t.keyPoints.map((k, i) => <li key={i}>{k}</li>)}</ul>}
                <Source sourceId={t.sourceId} evidence={t.evidence} sections={set.sections} />
                <div className="row" style={{ marginTop: ".5rem" }}>
                  <ReadAloud text={`${t.title}. ${t.summary} ${t.keyPoints.join(". ")}`} />
                </div>
                <ExplainSimpler itemId={t.id} text={`${t.title}\n${t.summary}\n${t.keyPoints.join("\n")}`} sourceId={t.sourceId} sections={set.sections} saved={set.simplified[t.id]} onSaved={saveSimple} />
              </article>
            ))}
            {c.terms.length > 0 && (
              <section className="card">
                <h3>Key terms</h3>
                <dl className="terms">
                  {c.terms.map((t) => (
                    <div key={t.id}>
                      <dt>{t.term}</dt>
                      <dd>{t.definition}</dd>
                      <dd><Source sourceId={t.sourceId} evidence={t.evidence} sections={set.sections} /></dd>
                      <dd><ExplainSimpler itemId={t.id} text={`${t.term}: ${t.definition}`} sourceId={t.sourceId} sections={set.sections} saved={set.simplified[t.id]} onSaved={saveSimple} /></dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
