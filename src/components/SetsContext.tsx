"use client";
// The list of saved modules ("Chats & tasks"). The sidebar, the dashboard, and the Chats & tasks page all share it,
// so renaming or deleting in one place updates the others straight away.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { SetSummary } from "@/lib/types";
import { deleteSet, listSummaries, renameSet } from "@/lib/store";
import { useAuth } from "@/lib/auth";

type Ctx = {
  sets: SetSummary[] | null; // null while loading
  refresh: () => Promise<void>;
  rename: (id: string, title: string) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
  notice: string;
  clearNotice: () => void;
};

const SetsContext = createContext<Ctx>({ sets: null, refresh: async () => {}, rename: async () => false, remove: async () => {}, notice: "", clearNotice: () => {} });
export const useSets = () => useContext(SetsContext);

export function SetsProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const pathname = usePathname();
  const [sets, setSets] = useState<SetSummary[] | null>(null);
  const [notice, setNotice] = useState("");
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  const ready = status === "signed_in" || status === "local";
  const refresh = useCallback(async () => {
    if (!ready) return;
    const list = await listSummaries();
    if (live.current) setSets(list);
  }, [ready]);

  // Load when the person is known, and again after moving to another page (a new module may have been saved).
  useEffect(() => { if (ready) void refresh(); else setSets(null); }, [ready, pathname, refresh]);

  const rename = useCallback(async (id: string, title: string) => {
    const clean = title.trim().slice(0, 80);
    if (!clean) return false;
    setSets((cur) => (cur ? cur.map((s) => (s.id === id ? { ...s, title: clean, updatedAt: new Date().toISOString() } : s)) : cur));
    const res = await renameSet(id, clean);
    if (!res.ok) setNotice(res.message);
    await refresh();
    return res.ok;
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    setSets((cur) => (cur ? cur.filter((s) => s.id !== id) : cur));
    await deleteSet(id);
    await refresh();
  }, [refresh]);

  const value = useMemo(() => ({ sets, refresh, rename, remove, notice, clearNotice: () => setNotice("") }), [sets, refresh, rename, remove, notice]);
  return <SetsContext.Provider value={value}>{children}</SetsContext.Provider>;
}
