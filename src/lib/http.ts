// Small helpers shared by the API routes (server only).
import { NextResponse } from "next/server";
import type { ApiError } from "./types";

export const isDev = process.env.NODE_ENV !== "production";

export function fail(status: number, code: string, message: string, retryable: boolean, detail?: unknown) {
  const body: { ok: false; error: ApiError } = { ok: false, error: { code, message, retryable } };
  // Real error text only in development, so debugging is easy locally and nothing leaks in production.
  if (isDev && detail !== undefined) body.error.detail = String(detail instanceof Error ? detail.message : detail).slice(0, 600);
  return NextResponse.json(body, { status });
}

// Best-effort limiter: each serverless instance keeps its own counter, so this slows abuse but is not a hard guarantee.
const hits = new Map<string, number[]>();
export function rateLimited(req: Request, limit = 40, windowMs = 60_000): boolean {
  // Each route has its own counter, so busy generating does not block the Setup check (and the other way round).
  let route = "";
  try { route = new URL(req.url).pathname; } catch { /* keep empty */ }
  const ip = `${route}|${(req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim()}`;
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 2000) hits.clear();
  return recent.length > limit;
}
