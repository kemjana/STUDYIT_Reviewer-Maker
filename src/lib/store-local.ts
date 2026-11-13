// Browser storage using IndexedDB (a much bigger browser database than localStorage, roughly a share of free disk space).
// Study sets stay on the student's device in Phase 1. Phase 2 will add the same functions backed by Supabase.
//
// Layout: store "sets" holds everything except the long material text; store "sections" holds the text.
// Marking a flashcard therefore rewrites a few KB, not the whole module.
import type { SaveResult, Section, SetSummary, StudySet } from "./types";

const DB_NAME = "studyit";
const DB_VERSION = 1;

export type StoredSet = Omit<StudySet, "sections"> & { sectionCount: number };

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no-indexeddb"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("sets")) db.createObjectStore("sets", { keyPath: "id" });
      if (!db.objectStoreNames.contains("sections")) db.createObjectStore("sections", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("open-failed"));
    req.onblocked = () => reject(new Error("blocked"));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("aborted"));
  });

const get = <T,>(store: IDBObjectStore, key: string) =>
  new Promise<T | undefined>((resolve, reject) => {
    const r = store.get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => reject(r.error);
  });

const getAll = <T,>(store: IDBObjectStore) =>
  new Promise<T[]>((resolve, reject) => {
    const r = store.getAll();
    r.onsuccess = () => resolve(r.result as T[]);
    r.onerror = () => reject(r.error);
  });

function friendly(e: unknown): string {
  const name = (e as { name?: string })?.name ?? (e instanceof Error ? e.message : "");
  if (name === "QuotaExceededError") return "Your browser has no room left to save this. Delete an older study set from the home page, or use a smaller page range.";
  if (name === "no-indexeddb" || name === "blocked" || name === "SecurityError" || name === "InvalidStateError")
    return "Your browser would not open its saving area. Private browsing windows can block saving. Try a normal window.";
  return "Your browser could not save this study set. Try again, or free up space.";
}

function withDefaults(s: StoredSet): StoredSet {
  return {
    ...s,
    reviewer: s.reviewer ?? { topics: [], terms: [] },
    flashcards: s.flashcards ?? [],
    questions: s.questions ?? [],
    attempts: s.attempts ?? [],
    reported: s.reported ?? [],
    cardProgress: s.cardProgress ?? {},
    simplified: s.simplified ?? {},
  };
}

/** Every study set without its long text (used by the home page and the progress dashboard). */
export async function listStored(): Promise<StoredSet[]> {
  try {
    const db = await openDb();
    const rows = await getAll<StoredSet>(db.transaction("sets", "readonly").objectStore("sets"));
    return rows.map(withDefaults).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function listSummaries(): Promise<SetSummary[]> {
  return (await listStored())
    .map((s) => ({ id: s.id, title: s.title, createdAt: s.createdAt, updatedAt: s.updatedAt ?? s.createdAt, cards: s.flashcards.length, questions: s.questions.length, pages: s.sectionCount, attempts: s.attempts }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function renameSet(id: string, title: string): Promise<SaveResult> {
  try {
    const db = await openDb();
    const tx = db.transaction("sets", "readwrite");
    const row = await get<StoredSet>(tx.objectStore("sets"), id);
    if (!row) return { ok: false, message: "That module no longer exists." };
    tx.objectStore("sets").put({ ...row, title, updatedAt: new Date().toISOString() });
    await done(tx);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: friendly(e) };
  }
}

export async function loadSet(id: string): Promise<StudySet | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(["sets", "sections"], "readonly");
    const [meta, sec] = await Promise.all([get<StoredSet>(tx.objectStore("sets"), id), get<{ id: string; sections: Section[] }>(tx.objectStore("sections"), id)]);
    if (!meta || !sec) return null;
    persistedSections.set(id, sec.sections);
    const { sectionCount: _unused, ...rest } = withDefaults(meta);
    void _unused;
    return { ...rest, sections: sec.sections };
  } catch {
    return null;
  }
}

// Remembers which sections array was last written for each set, so we write the long text only when it changed.
const persistedSections = new Map<string, Section[]>();
let queue: Promise<unknown> = Promise.resolve();

/** Saving is "upsert by id": saving the same set twice just overwrites it, nothing is counted twice. Saves run one at a time, in order. */
export function saveSet(set: StudySet): Promise<SaveResult> {
  const run = async (): Promise<SaveResult> => {
    try {
      const db = await openDb();
      const { sections, ...rest } = set;
      const meta: StoredSet = { ...rest, sectionCount: sections.length, updatedAt: new Date().toISOString() };
      const writeText = persistedSections.get(set.id) !== sections;
      const tx = db.transaction(["sets", "sections"], "readwrite");
      tx.objectStore("sets").put(meta);
      if (writeText) tx.objectStore("sections").put({ id: set.id, sections });
      await done(tx);
      persistedSections.set(set.id, sections);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: friendly(e) };
    }
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

export async function deleteSet(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(["sets", "sections"], "readwrite");
    tx.objectStore("sets").delete(id);
    tx.objectStore("sections").delete(id);
    await done(tx);
    persistedSections.delete(id);
  } catch { /* nothing else to do */ }
}

export function newId(): string {
  // Only call this from event handlers or effects (never while rendering) to avoid hydration errors.
  // A full UUID, so the same id works as the primary key in Supabase.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${h()}${h()}-${h()}-4${h().slice(1)}-a${h().slice(1)}-${h()}${h()}${h()}`;
}

export async function storageEstimate(): Promise<{ used: number; quota: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const e = await navigator.storage.estimate();
    return e.usage !== undefined && e.quota !== undefined ? { used: e.usage, quota: e.quota } : null;
  } catch { return null; }
}

/** Asks the browser not to clear our data when space is low. The browser may say no; that is fine. */
export async function requestPersistence(): Promise<void> {
  try { await navigator.storage?.persist?.(); } catch { /* ignore */ }
}
