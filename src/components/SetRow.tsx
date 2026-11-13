"use client";
// One saved module in a list. Click the title to open it. The "..." menu has Rename and Delete.
// Rename works in place: type the new name, press Enter to save or Escape to cancel.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SetSummary } from "@/lib/types";
import { Icon } from "./Icon";
import { useSets } from "./SetsContext";

type Props = { set: SetSummary; variant: "sidebar" | "page"; active?: boolean; onNavigate?: () => void };

export function SetRow({ set, variant, active, onNavigate }: Props) {
  const { rename, remove } = useSets();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(set.title);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [menu]);

  useEffect(() => { if (editing) { input.current?.focus(); input.current?.select(); } }, [editing]);

  const startRename = () => { setMenu(false); setDraft(set.title); done.current = false; setEditing(true); };
  const commit = async () => {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    if (draft.trim() && draft.trim() !== set.title) await rename(set.id, draft);
  };
  const cancel = () => { done.current = true; setEditing(false); };
  const del = async () => {
    setMenu(false);
    if (!window.confirm(`Delete "${set.title}"? This removes the module, its flashcards, questions, and scores. This cannot be undone.`)) return;
    await remove(set.id);
    if (active) router.push("/chats");
  };

  const best = set.attempts.length ? Math.max(...set.attempts.map((a) => Math.round((a.correct / Math.max(1, a.total)) * 100))) : null;

  return (
    <div className={`setrow v-${variant}${active ? " active" : ""}`} ref={wrap}>
      {editing ? (
        <input
          ref={input}
          className="rename-input"
          aria-label={`Rename ${set.title}`}
          value={draft}
          maxLength={80}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void commit(); if (e.key === "Escape") cancel(); }}
          onBlur={() => void commit()}
        />
      ) : (
        <Link href={`/set/${set.id}`} className="setrow-link" onClick={onNavigate} title={set.title} aria-current={active ? "page" : undefined}>
          {variant === "page" && <span className="setrow-icon"><Icon name="file" /></span>}
          <span className="setrow-text">
            <span className="setrow-title">{set.title}</span>
            {variant === "page" && (
              <span className="small muted">
                {set.pages} pages or sections · {set.cards} flashcards · {set.questions} questions{best !== null ? ` · best score ${best}%` : ""} · {new Date(set.updatedAt).toLocaleDateString()}
              </span>
            )}
          </span>
        </Link>
      )}
      {!editing && (
        <>
          <button className="icon-btn setrow-menu-btn" aria-label={`Options for ${set.title}`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            <Icon name="dots" size={18} />
          </button>
          {menu && (
            <div className="menu" role="menu">
              <button role="menuitem" onClick={startRename}><Icon name="pencil" size={16} /> Rename</button>
              <button role="menuitem" className="danger-item" onClick={() => void del()}><Icon name="trash" size={16} /> Delete</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
