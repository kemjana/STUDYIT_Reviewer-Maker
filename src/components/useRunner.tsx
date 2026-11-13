"use client";
import { useCallback, useRef, useState } from "react";
import type { ApiError, StudySet } from "@/lib/types";
import { runTasks, type RunState, type Task } from "@/lib/runner";

type Job = { set: StudySet; tasks: Task[]; from: number; extra?: { avoid?: string[]; focusTopics?: string[] } };

export function useRunner() {
  const [running, setRunning] = useState(false);
  const [state, setState] = useState<RunState | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const job = useRef<Job | null>(null);
  const stoppedAt = useRef(0);
  const lastDone = useRef(0);

  const start = useCallback(async (set: StudySet, tasks: Task[], from = 0, extra?: Job["extra"]): Promise<"done" | "failed" | "stopped"> => {
    job.current = { set, tasks, from, extra };
    ctl.current = new AbortController();
    setRunning(true);
    setError(null);
    try {
      lastDone.current = from;
      const res = await runTasks(set, tasks, from, (s) => { lastDone.current = s.done; setState(s); }, ctl.current.signal, extra);
      if (res.ok) return "done";
      stoppedAt.current = res.stoppedAt;
      setError(res.error);
      return "failed";
    } catch {
      stoppedAt.current = lastDone.current;
      setError({ code: "stopped", message: "You stopped it. Your progress so far is saved.", retryable: true });
      return "stopped";
    } finally {
      setRunning(false);
    }
  }, []);

  const retry = useCallback(() => {
    const j = job.current;
    if (!j) return Promise.resolve("failed" as const);
    return start(j.set, j.tasks, stoppedAt.current, j.extra);
  }, [start]);

  const cancel = useCallback(() => ctl.current?.abort(), []);

  return { running, state, error, start, retry, cancel };
}

export type Runner = ReturnType<typeof useRunner>;

export function RunPanel({ runner, onOpenPartial }: { runner: Runner; onOpenPartial?: () => void }) {
  const { running, state, error } = runner;
  if (!running && !error) return null;
  const pct = state && state.total ? Math.round((state.done / state.total) * 100) : 0;
  return (
    <div className="card stack" aria-live="polite">
      <div
        className="progress"
        role="progressbar"
        aria-label="Making your study set"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div style={{ width: `${pct}%` }} />
      </div>
      {state && <p className="muted" style={{ margin: 0 }}>Step {Math.min(state.done + 1, state.total)} of {state.total}. {state.message}</p>}
      {error && (
        <div className="notice error" role="alert">
          <strong>Generation stopped.</strong> {error.message}
          {error.detail && <p className="small" style={{ margin: ".4rem 0 0" }}>Details (shown only while developing): {error.detail}</p>}
        </div>
      )}
      <div className="row">
        {running && <button className="btn ghost" onClick={runner.cancel}>Stop</button>}
        {!running && error && error.retryable && <button className="btn" onClick={() => void runner.retry()}>Retry from where it stopped</button>}
        {!running && error && onOpenPartial && <button className="btn ghost" onClick={onOpenPartial}>Open what is ready</button>}
      </div>
    </div>
  );
}
