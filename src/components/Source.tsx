import type { Section } from "@/lib/types";

// Shows where an item came from: a highlighted page/section label with the exact quote one click away.
export function Source({ sourceId, evidence, sections }: { sourceId: string; evidence: string; sections: Section[] }) {
  const label = sections.find((s) => s.id === sourceId)?.label ?? "Unknown source";
  return (
    <details className="source">
      <summary>
        <span className="src">{label}</span> <span className="muted">(see the quote)</span>
      </summary>
      <blockquote>{evidence}</blockquote>
    </details>
  );
}
