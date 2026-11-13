"use client";
import { QUESTION_TYPES, QUESTION_TYPE_LABELS, type QuestionType } from "@/lib/types";
import { MAX_PER_KIND } from "@/lib/runner";

export type CountChoice = { choice: string; custom: string };

export function resolveCount(c: CountChoice, auto: number): number {
  if (c.choice === "auto") return auto;
  if (c.choice === "custom") return Math.max(1, Math.min(MAX_PER_KIND, parseInt(c.custom, 10) || 1));
  return parseInt(c.choice, 10);
}

export function CountPicker({ id, label, value, onChange, auto }: { id: string; label: string; value: CountChoice; onChange: (v: CountChoice) => void; auto: number | null }) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value.choice} onChange={(e) => onChange({ ...value, choice: e.target.value })}>
        <option value="auto">Auto{auto ? ` (about ${auto})` : " (based on length)"}</option>
        {[5, 10, 15, 20, 30, 50].map((n) => <option key={n} value={String(n)}>{n}</option>)}
        <option value="custom">Another number...</option>
      </select>
      {value.choice === "custom" && (
        <input aria-label={`${label}, custom number`} type="number" min={1} max={MAX_PER_KIND} value={value.custom} onChange={(e) => onChange({ ...value, custom: e.target.value })} style={{ marginTop: ".5rem" }} />
      )}
      <p className="small muted" style={{ margin: ".3rem 0 0" }}>Pick any number from 1 to {MAX_PER_KIND}.</p>
    </div>
  );
}

export function TypePicker({ value, onChange }: { value: QuestionType[]; onChange: (v: QuestionType[]) => void }) {
  return (
    <fieldset>
      <legend>Question types</legend>
      {QUESTION_TYPES.map((t) => (
        <label className="check" key={t}>
          <input
            type="checkbox"
            checked={value.includes(t)}
            onChange={(e) => {
              const next = e.target.checked ? [...value, t] : value.filter((x) => x !== t);
              onChange(next.length ? next : value); // always keep at least one type
            }}
          />
          {QUESTION_TYPE_LABELS[t]}
        </label>
      ))}
    </fieldset>
  );
}
