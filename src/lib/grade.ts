// Smarter grading for typed answers (identification and fill-in-the-blank).
// Accepts: different capitalisation, punctuation, accents, leading "a/an/the", simple plurals,
// small typos in longer words, and one harmless extra word ("network firewall" for "firewall").
// Rejects: different numbers, flipped meaning ("not"), missing words, and look-alike short words.
// No imports on purpose, so it is easy to test.

const NEGATIONS = new Set(["not", "no", "never", "non", "without", "cannot", "cant", "dont", "isnt", "arent"]);

export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/&/g, " and ")
    .replace(/['\u2019]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^(a|an|the)\s+/, "")
    .replace(/\s+/g, " ");
}

const tokens = (s: string): string[] => normalizeAnswer(s).split(" ").filter(Boolean);

function stem(t: string): string {
  if (/^\d+$/.test(t) || t.length <= 3) return t;
  if (t.endsWith("ies") && t.length > 4) return `${t.slice(0, -3)}y`;
  if (t.endsWith("es") && /(s|x|z|ch|sh)es$/.test(t)) return t.slice(0, -2);
  if (t.endsWith("s") && !t.endsWith("ss") && !t.endsWith("us") && !t.endsWith("is")) return t.slice(0, -1);
  return t;
}

// Optimal string alignment distance (counts a swapped pair of letters as one mistake).
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (/\d/.test(a) || /\d/.test(b)) return false; // numbers must match exactly
  const sa = stem(a), sb = stem(b);
  if (sa === sb) return true;
  const len = Math.max(sa.length, sb.length);
  const allowed = len >= 10 ? 2 : len >= 6 ? 1 : 0; // short words must be exact
  return allowed > 0 && distance(sa, sb) <= allowed;
}

function matches(given: string, target: string): boolean {
  const G = tokens(given), A = tokens(target);
  if (!G.length || !A.length) return false;
  const gNeg = G.some((t) => NEGATIONS.has(t)), aNeg = A.some((t) => NEGATIONS.has(t));
  if (gNeg !== aNeg) return false;
  const used = new Set<number>();
  for (const a of A) {
    const k = G.findIndex((g, i) => !used.has(i) && sameWord(a, g));
    if (k < 0) return false;
    used.add(k);
  }
  const extra = G.length - used.size;
  return extra <= 1; // one harmless extra word is fine
}

export type Grade = { correct: boolean; how: "exact" | "close" | "wrong" };

export function gradeAnswer(given: string, answer: string, alternates: string[] = []): Grade {
  const g = normalizeAnswer(given);
  if (!g) return { correct: false, how: "wrong" };
  for (const target of [answer, ...alternates]) {
    if (normalizeAnswer(target) === g) return { correct: true, how: "exact" };
  }
  for (const target of [answer, ...alternates]) {
    if (matches(given, target)) return { correct: true, how: "close" };
  }
  return { correct: false, how: "wrong" };
}
