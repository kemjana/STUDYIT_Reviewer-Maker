"use client";
import { useEffect, useState } from "react";
import { CreateForm } from "@/components/CreateForm";

export default function NewModule() {
  const [mode, setMode] = useState<"paste" | "file" | undefined>(undefined);
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("mode");
    setMode(m === "file" ? "file" : "paste");
  }, []);
  if (!mode) return null;
  return (
    <div className="stack">
      <div>
        <h1 className="page-title">New module</h1>
        <p className="muted">Add your module and get a chapter-by-chapter reviewer, flashcards, and quizzes made only from your own pages. It is saved to your list so you can come back to it.</p>
      </div>
      <CreateForm initialMode={mode} />
    </div>
  );
}
