// Saves study sets in the signed-in person's Supabase account (tables study_sets and study_set_texts, see schema.sql).
// Row level security makes sure a person can only see and change their own rows.
import type { Attempt, SaveResult, Section, SetSummary, StudySet } from "./types";
import { getSupabase } from "./supabase-browser";

type Row = {
  id: string; title: string; source_type: StudySet["sourceType"]; file_name: string | null;
  section_count: number; card_count: number; question_count: number;
  data: Pick<StudySet, "reviewer" | "flashcards" | "questions" | "attempts" | "reported" | "cardProgress" | "simplified">;
  created_at: string; updated_at: string;
};

function friendly(error: { message?: string; code?: string; status?: number } | null | undefined): string {
  const m = (error?.message ?? "").toLowerCase();
  if (error?.status === 413 || m.includes("payload too large") || m.includes("too large")) return "This module is too big to save to your account. Use a smaller page range.";
  if (error?.code === "42P01" || m.includes("does not exist") || m.includes("schema cache")) return "Your Supabase database is missing the StudyIt tables. Run schema.sql in the Supabase SQL Editor (see SETUP-GUIDE.md).";
  if (error?.code === "42501" || m.includes("row-level security") || m.includes("permission denied")) return "Supabase refused to save this. Make sure you are signed in, and that schema.sql was run completely.";
  if (m.includes("jwt") || m.includes("not authenticated") || error?.status === 401) return "Your sign-in expired. Please sign in again.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Could not reach Supabase. Check your internet connection and try again.";
  return "Your account could not save this. Try again in a moment.";
}

const persistedText = new Map<string, Section[]>(); // which long text was last written, so it is written only when it changes
const savedOnce = new Set<string>();
const seq = new Map<string, number>(); // how many saves were asked for, per module
const chain = new Map<string, Promise<SaveResult>>();

async function userId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.user.id ?? null;
}

async function writeOnce(set: StudySet): Promise<SaveResult> {
  const sb = getSupabase();
  const uid = await userId();
  if (!uid) return { ok: false, message: "Your sign-in expired. Please sign in again." };
  const { sections, ...rest } = set;
  const row = {
    id: set.id,
    user_id: uid,
    title: set.title,
    source_type: set.sourceType,
    file_name: set.fileName ?? null,
    section_count: sections.length,
    card_count: set.flashcards.length,
    question_count: set.questions.length,
    data: { reviewer: rest.reviewer, flashcards: rest.flashcards, questions: rest.questions, attempts: rest.attempts, reported: rest.reported, cardProgress: rest.cardProgress, simplified: rest.simplified },
    created_at: set.createdAt,
    updated_at: new Date().toISOString(),
  };
  // upsert = insert, or update if the id already exists, so saving twice never creates two rows
  const a = await sb.from("study_sets").upsert(row, { onConflict: "id" });
  if (a.error) return { ok: false, message: friendly(a.error) };
  if (persistedText.get(set.id) !== sections) {
    const b = await sb.from("study_set_texts").upsert({ set_id: set.id, user_id: uid, sections }, { onConflict: "set_id" });
    if (b.error) {
      if (!savedOnce.has(set.id)) await sb.from("study_sets").delete().eq("id", set.id); // do not leave a half-saved module behind
      return { ok: false, message: friendly(b.error) };
    }
    persistedText.set(set.id, sections);
  }
  savedOnce.add(set.id);
  return { ok: true };
}

/**
 * Saves run one after another for each module. If several saves are asked for quickly (for example a flashcard
 * clicked three times), only the last one actually writes, because it writes the newest state of the module.
 * (The study set object may be changed in place while it is being built, so we compare "which request is the newest",
 * not "is this the same object".)
 */
export function saveSet(set: StudySet): Promise<SaveResult> {
  const mine = (seq.get(set.id) ?? 0) + 1;
  seq.set(set.id, mine);
  const prev = chain.get(set.id) ?? Promise.resolve<SaveResult>({ ok: true });
  const next = prev.then(async () => (seq.get(set.id) === mine ? writeOnce(set) : ({ ok: true } as SaveResult)));
  chain.set(set.id, next.catch(() => ({ ok: true }) as SaveResult));
  return next;
}

export async function listSummaries(): Promise<SetSummary[]> {
  const { data, error } = await getSupabase()
    .from("study_sets")
    .select("id,title,created_at,updated_at,section_count,card_count,question_count,attempts:data->attempts")
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  return (data as unknown as Array<Pick<Row, "id" | "title" | "created_at" | "updated_at" | "section_count" | "card_count" | "question_count"> & { attempts: Attempt[] | null }>).map((r) => ({
    id: r.id, title: r.title, createdAt: r.created_at, updatedAt: r.updated_at, cards: r.card_count, questions: r.question_count, pages: r.section_count, attempts: Array.isArray(r.attempts) ? r.attempts : [],
  }));
}

export async function loadSet(id: string): Promise<StudySet | null> {
  const sb = getSupabase();
  const [a, b] = await Promise.all([
    sb.from("study_sets").select("*").eq("id", id).limit(1).maybeSingle(),
    sb.from("study_set_texts").select("sections").eq("set_id", id).limit(1).maybeSingle(),
  ]);
  const row = a.data as Row | null;
  const text = b.data as { sections: Section[] } | null;
  if (!row || !text) return null;
  persistedText.set(id, text.sections);
  savedOnce.add(id);
  const d = row.data ?? ({} as Row["data"]);
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceType: row.source_type,
    fileName: row.file_name ?? undefined,
    sections: text.sections,
    reviewer: d.reviewer ?? { topics: [], terms: [] },
    flashcards: d.flashcards ?? [],
    questions: d.questions ?? [],
    attempts: d.attempts ?? [],
    reported: d.reported ?? [],
    cardProgress: d.cardProgress ?? {},
    simplified: d.simplified ?? {},
  };
}

export async function renameSet(id: string, title: string): Promise<SaveResult> {
  const { error } = await getSupabase().from("study_sets").update({ title, updated_at: new Date().toISOString() }).eq("id", id);
  return error ? { ok: false, message: friendly(error) } : { ok: true };
}

export async function deleteSet(id: string): Promise<void> {
  await getSupabase().from("study_sets").delete().eq("id", id); // the long text is removed with it (on delete cascade)
  persistedText.delete(id);
  savedOnce.delete(id);
  seq.delete(id);
}

/** Forget everything remembered about the previous person (called when someone signs out or a different person signs in). */
export function resetCloudCache() {
  persistedText.clear();
  savedOnce.clear();
  seq.clear();
  chain.clear();
}
