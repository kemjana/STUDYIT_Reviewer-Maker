// Small settings kept in this browser (theme, reading voice, access code). Reads never crash if storage is blocked.
const P = "studyit:v1:";

function read(key: string): string | null {
  try { return window.localStorage.getItem(P + key); } catch { return null; }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(P + key);
    else window.localStorage.setItem(P + key, value);
  } catch { /* blocked storage: the setting just will not be remembered */ }
}

export type Theme = "auto" | "light" | "dark";
export const THEME_KEY = `${P}theme`; // also read by the tiny script in layout.tsx

export function getTheme(): Theme {
  const v = read("theme");
  return v === "light" || v === "dark" ? v : "auto";
}
export function applyTheme(t: Theme) {
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
}
export function setTheme(t: Theme) {
  write("theme", t === "auto" ? null : t);
  applyTheme(t);
}

export type SpeechPrefs = { voice: string; rate: number };
export function getSpeechPrefs(): SpeechPrefs {
  const rate = Number(read("speech-rate"));
  return { voice: read("speech-voice") ?? "", rate: rate >= 0.5 && rate <= 2 ? rate : 1 };
}
export function setSpeechPrefs(p: Partial<SpeechPrefs>) {
  if (p.voice !== undefined) write("speech-voice", p.voice || null);
  if (p.rate !== undefined) write("speech-rate", String(p.rate));
}

export const getAccessCode = () => read("access-code") ?? "";
export const setAccessCode = (code: string) => write("access-code", code || null);

const DAYS_KEY = "days";
export function readDays(): string[] {
  try {
    const raw = read(DAYS_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch { return []; }
}
export function writeDays(days: string[]) { write(DAYS_KEY, JSON.stringify(days.slice(-800))); }

const GOAL_KEY = "goal";
/** Daily goal: how many items (flashcards marked plus questions answered) make a full day. */
export function getGoal(): number {
  const n = Number(read(GOAL_KEY));
  return Number.isInteger(n) && n >= 1 && n <= 500 ? n : 10;
}
export function setGoal(n: number) { write(GOAL_KEY, String(Math.max(1, Math.min(500, Math.round(n))))); }

const TODAY_KEY = "today";
export function readToday(): { d: string; n: number } {
  try {
    const v = JSON.parse(read(TODAY_KEY) ?? "null") as { d?: unknown; n?: unknown } | null;
    return v && typeof v.d === "string" && typeof v.n === "number" ? { d: v.d, n: v.n } : { d: "", n: 0 };
  } catch { return { d: "", n: 0 }; }
}
export function writeToday(v: { d: string; n: number }) { write(TODAY_KEY, JSON.stringify(v)); }
