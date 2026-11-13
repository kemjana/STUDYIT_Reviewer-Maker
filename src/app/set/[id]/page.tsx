"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { StudySet } from "@/lib/types";
import { loadSet, saveSet } from "@/lib/store";
import { Reviewer } from "@/components/Reviewer";
import { Flashcards } from "@/components/Flashcards";
import { Quiz } from "@/components/Quiz";
import { MakeMore } from "@/components/MakeMore";
import { SpeechSettings } from "@/components/ReadAloud";
import { Icon } from "@/components/Icon";
import { useSets } from "@/components/SetsContext";
import { useAuth } from "@/lib/auth";

const TABS = [
  { id: "reviewer", label: "Reviewer" },
  { id: "flashcards", label: "Flashcards" },
  { id: "quiz", label: "Quiz" },
  { id: "more", label: "Make more" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function SetPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { status } = useAuth();
  const { sets, rename, remove, refresh } = useSets();
  const [set, setSet] = useState<StudySet | null>(null);
  const [missing, setMissing] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [tab, setTab] = useState<TabId>("reviewer");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<StudySet | null>(null);
  const ready = status === "signed_in" || status === "local";

  useEffect(() => {
    if (!ready) return;
    let live = true;
    void loadSet(params.id).then((found) => {
      if (!live) return;
      if (!found) { setMissing(true); return; }
      ref.current = found;
      setSet(found);
      setTab(found.reviewer.topics.length || found.reviewer.terms.length ? "reviewer" : found.flashcards.length ? "flashcards" : "quiz");
    });
    return () => { live = false; };
  }, [params.id, ready]);

  // If the module was renamed somewhere else (for example in the sidebar), pick up the new name here.
  // Otherwise the next save from this page would put the old name back.
  useEffect(() => {
    const listed = sets?.find((x) => x.id === params.id);
    if (listed && ref.current && listed.title !== ref.current.title) {
      const next = { ...ref.current, title: listed.title };
      ref.current = next;
      setSet(next);
    }
  }, [sets, params.id]);

  // Every change goes through here: copy, change, save (saving is an upsert by id), then show.
  const update = useCallback((fn: (s: StudySet) => void) => {
    if (!ref.current) return;
    // Copy everything except the long material text, which stays the same object so it is not rewritten on every click.
    const { sections, ...rest } = ref.current;
    const next: StudySet = { ...structuredClone(rest), sections };
    fn(next);
    ref.current = next;
    setSet(next);
    void saveSet(next).then((saved) => setSaveError(saved.ok ? "" : saved.message));
  }, []);

  async function commitTitle() {
    setEditing(false);
    const t = draft.trim().slice(0, 80);
    if (!set || !t || t === set.title) return;
    if (await rename(set.id, t) && ref.current) {
      const next = { ...ref.current, title: t };
      ref.current = next;
      setSet(next);
    }
  }

  if (missing) {
    return (
      <div className="stack">
        <h1 className="page-title">Module not found</h1>
        <p>It may have been deleted, or it belongs to a different account or browser.</p>
        <Link className="btn" href="/chats">Back to Chats &amp; tasks</Link>
      </div>
    );
  }
  if (!set) return <p className="muted" role="status">Loading...</p>;

  return (
    <div>
      <p><Link href="/chats">Back to Chats &amp; tasks</Link></p>
      {editing ? (
        <input
          className="rename-input title-input"
          aria-label="Module name"
          autoFocus
          value={draft}
          maxLength={80}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commitTitle()}
          onKeyDown={(e) => { if (e.key === "Enter") void commitTitle(); if (e.key === "Escape") setEditing(false); }}
        />
      ) : (
        <div className="row" style={{ gap: ".5rem" }}>
          <h1 className="page-title" style={{ margin: 0 }}>{set.title}</h1>
          <button className="icon-btn" aria-label="Rename this module" title="Rename" onClick={() => { setDraft(set.title); setEditing(true); }}><Icon name="pencil" size={18} /></button>
        </div>
      )}
      <p className="muted">
        {set.sections.length} {set.sourceType === "pdf" ? (set.sections.length === 1 ? "page" : "pages") : set.sections.length === 1 ? "section" : "sections"} used, {set.flashcards.length} flashcards, {set.questions.length} questions.
      </p>
      {saveError && <p className="notice error" role="alert">{saveError}</p>}
      <SpeechSettings />

      <div className="tabs" role="tablist" aria-label="Study tools">
        {TABS.map((t) => (
          <button key={t.id} id={`tab-${t.id}`} role="tab" className="tab" aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "reviewer" && <Reviewer set={set} update={update} />}
        {tab === "flashcards" && <Flashcards set={set} update={update} />}
        {tab === "quiz" && <Quiz set={set} update={update} />}
        {tab === "more" && (
          <>
            <MakeMore
              set={set}
              onDone={(s) => { ref.current = s; setSet(s); void refresh(); setTab(s.questions.length > set.questions.length ? "quiz" : "flashcards"); }}
            />
            <section className="card" style={{ marginTop: "2rem" }}>
              <h2>Delete this module</h2>
              <p className="muted">This removes the material, the generated items, and your scores for this module.</p>
              <button className="btn danger" onClick={async () => { if (window.confirm(`Delete "${set.title}"? This cannot be undone.`)) { await remove(set.id); router.push("/chats"); } }}>Delete this module</button>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
