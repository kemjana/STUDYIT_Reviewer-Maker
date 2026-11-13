// Turns raw text or PDF pages into "sections" (the units Gemini cites), and groups them into batches
// so that each Gemini request stays small (Vercel limits request size and time).

import type { Chapter, Section } from "./types";

export const MAX_MATERIAL_CHARS = 6_000_000;
export const BATCH_CHARS = 12_000;
export const MAX_BATCHES = 40;

function looksLikeHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 80) return false;
  if (/[.!?]$/.test(t)) return false;
  if (/^(chapter|module|lesson|unit|topic|week|part|section)\s+[\w.-]+/i.test(t)) return true;
  if (/^\d+(\.\d+)*[.)]?\s+[A-Z]/.test(t)) return true;
  const letters = t.replace(/[^A-Za-z]/g, "");
  return letters.length >= 4 && letters === letters.toUpperCase();
}

/** Pasted text or .txt: split into chunks of roughly 1,800 characters, labelled by heading when we can find one. */
export function sectionsFromText(raw: string): Section[] {
  const text = raw.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  if (!text) return [];
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const sections: Section[] = [];
  let buf: string[] = [];
  let size = 0;
  let heading = "";
  const flush = () => {
    if (!buf.length) return;
    const n = sections.length + 1;
    sections.push({
      id: `s${n}`,
      label: heading ? `Section ${n}: ${heading}` : `Section ${n}`,
      text: buf.join("\n\n"),
    });
    buf = [];
    size = 0;
  };
  for (const p of paragraphs) {
    const firstLine = p.split("\n")[0];
    if (looksLikeHeading(firstLine)) {
      flush();
      heading = firstLine.trim().slice(0, 60);
    }
    // very long single paragraphs are cut at sentence ends
    const pieces = p.length > 2400 ? p.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) ?? [p] : [p];
    for (const piece of pieces) {
      if (size + piece.length > 1800 && size > 0) flush();
      buf.push(piece.trim());
      size += piece.length;
    }
  }
  flush();
  return sections;
}

/** PDF: one section per page that has real text. The label is the real page number. */
export function sectionsFromPages(pages: string[]): Section[] {
  const out: Section[] = [];
  pages.forEach((pageText, i) => {
    const text = pageText.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (text.replace(/\s/g, "").length < 40) return; // blank or picture-only page
    out.push({ id: `s${out.length + 1}`, label: `Page ${i + 1}`, text });
  });
  return out;
}

export function totalChars(sections: Section[]): number {
  return sections.reduce((n, s) => n + s.text.length, 0);
}

export type Batch = { index: number; sections: Section[]; chars: number };

/** Split sections into `n` consecutive groups with similar sizes. */
export function planBatches(sections: Section[], wantedItems: number): Batch[] {
  if (!sections.length) return [];
  const total = totalChars(sections);
  const n = Math.max(1, Math.min(sections.length, Math.max(Math.ceil(total / BATCH_CHARS), Math.ceil(wantedItems / 12))));
  const target = total / n;
  const batches: Batch[] = [];
  let cur: Section[] = [];
  let curChars = 0;
  sections.forEach((s, i) => {
    cur.push(s);
    curChars += s.text.length;
    const remainingSections = sections.length - i - 1;
    const remainingBatches = n - batches.length - 1;
    const full = curChars >= target && remainingBatches > 0;
    if (full || (remainingSections === remainingBatches && remainingBatches > 0 && cur.length > 0)) {
      batches.push({ index: batches.length, sections: cur, chars: curChars });
      cur = [];
      curChars = 0;
    }
  });
  if (cur.length) batches.push({ index: batches.length, sections: cur, chars: curChars });
  return batches;
}

/** Share `count` items across batches in proportion to their size (largest remainder method). */
export function splitCount(count: number, batches: Batch[]): number[] {
  const total = batches.reduce((n, b) => n + b.chars, 0) || 1;
  const raw = batches.map((b) => (count * b.chars) / total);
  const base = raw.map(Math.floor);
  let left = count - base.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (left <= 0) break;
    base[i] += 1;
    left -= 1;
  }
  return base;
}

export function autoCount(sections: Section[]): number {
  return Math.max(8, Math.min(60, Math.round(totalChars(sections) / 900)));
}

/** Compact text used to check that a quote really appears in a section (ignores case, spaces and punctuation). */
export function squash(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "");
}

export function describeSource(section: Section | undefined): string {
  return section ? section.label : "Unknown source";
}

const CHAPTER_RE = /^(chapter|module|lesson|unit|topic|week|part|session)\s+([0-9]+|[ivxlcdm]+)\b[\s:.\-\u2013\u2014]*(.*)$/i;

/**
 * Finds chapter starts (lines like "Chapter 3", "Module 2: Networking") near the top of a page or section.
 * Running headers that repeat the same title on every page are ignored. If no chapters are found,
 * the material is cut into blocks so the reviewer still gets a tidy outline.
 */
export function detectChapters(sections: Section[]): Chapter[] {
  if (!sections.length) return [];
  const starts: { index: number; title: string }[] = [];
  sections.forEach((s, i) => {
    const lines = s.text.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 4);
    for (const line of lines) {
      const m = line.match(CHAPTER_RE);
      if (!m) continue;
      const word = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
      const rest = m[3].trim().slice(0, 60);
      const title = `${word} ${m[2].toUpperCase()}${rest ? `: ${rest}` : ""}`;
      const key = `${m[1].toLowerCase()}${m[2].toLowerCase()}`;
      const prev = starts[starts.length - 1];
      if (prev && prev.title.toLowerCase().replace(/[^a-z0-9]/g, "").startsWith(key)) break; // same chapter header repeated
      starts.push({ index: i, title });
      break;
    }
  });
  const chapters: Chapter[] = [];
  if (starts.length >= 2) {
    if (starts[0].index > 0) chapters.push({ id: "c0", title: "Introduction", from: 0, to: starts[0].index - 1 });
    starts.forEach((st, k) => {
      const to = k + 1 < starts.length ? starts[k + 1].index - 1 : sections.length - 1;
      chapters.push({ id: `c${chapters.length}`, title: st.title, from: st.index, to });
    });
    return chapters;
  }
  const block = 10;
  for (let from = 0; from < sections.length; from += block) {
    const to = Math.min(sections.length - 1, from + block - 1);
    const a = sections[from].label, b = sections[to].label;
    chapters.push({ id: `c${chapters.length}`, title: from === to ? a : `${a} to ${b}`, from, to });
  }
  return chapters;
}
