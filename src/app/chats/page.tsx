"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { groupByDate } from "@/lib/dashboard";
import { useNow } from "@/lib/useNow";
import { Icon } from "@/components/Icon";
import { SetRow } from "@/components/SetRow";
import { useSets } from "@/components/SetsContext";

export default function Chats() {
  const { sets } = useSets();
  const now = useNow();
  const [q, setQ] = useState("");
  useEffect(() => { setQ(new URLSearchParams(window.location.search).get("q") ?? ""); }, []);

  const filtered = useMemo(() => (sets ?? []).filter((s) => s.title.toLowerCase().includes(q.trim().toLowerCase())), [sets, q]);
  const groups = now ? groupByDate(filtered, now) : [];

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 className="page-title">Chats &amp; tasks</h1>
          <p className="muted" style={{ marginBottom: 0 }}>Every module you add is saved here. Open one to study it, or use the ... menu to rename or delete it.</p>
        </div>
        <Link className="btn" href="/new"><Icon name="plus" size={18} /> New module</Link>
      </div>

      <div className="search wide" role="search">
        <Icon name="search" size={18} />
        <input type="text" aria-label="Filter your modules by name" placeholder="Search your modules" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {sets === null ? <p className="muted" role="status">Loading your modules...</p> : sets.length === 0 ? (
        <section className="card center">
          <h2>No modules yet</h2>
          <p className="muted" style={{ marginInline: "auto" }}>Upload a PDF or paste your notes. StudyIt saves each module here, so you can rename it, study it again, and keep your scores.</p>
          <Link className="btn" href="/new">Add your first module</Link>
        </section>
      ) : filtered.length === 0 ? (
        <p className="notice">No module matches &quot;{q}&quot;.</p>
      ) : (
        groups.map((g) => (
          <section key={g.label} aria-label={g.label}>
            <h2 className="section-title">{g.label}</h2>
            <div className="card listcard">{g.items.map((s) => <SetRow key={s.id} set={s} variant="page" />)}</div>
          </section>
        ))
      )}
    </div>
  );
}
