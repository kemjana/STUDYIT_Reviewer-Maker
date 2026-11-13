// All Gemini calls live here. This file is only imported by API routes (server side), so the key never reaches the browser.
import { GoogleGenAI, ThinkingLevel, type GenerateContentConfig } from "@google/genai";
import type { ApiError } from "./types";
import { SYSTEM_INSTRUCTION } from "./prompts";

export class GeminiCallError extends Error {
  constructor(public api: ApiError, public status = 500) {
    super(api.message);
  }
}

export type ModelJob = {
  kind: "reviewer" | "flashcards" | "quiz" | "explain" | "ping";
  prompt: string;
  /** Called instead of Gemini when GEMINI_MOCK is set (tests only). */
  mock: (mode: string) => string;
};

const str = { type: "string" };
const strArr = { type: "array", items: str };
const schemas = {
  reviewer: {
    type: "object",
    properties: {
      topics: { type: "array", items: { type: "object", properties: { title: str, sourceId: str, summary: str, keyPoints: strArr, evidence: str }, required: ["title", "sourceId", "summary", "keyPoints", "evidence"] } },
      terms: { type: "array", items: { type: "object", properties: { term: str, definition: str, sourceId: str, evidence: str }, required: ["term", "definition", "sourceId", "evidence"] } },
    },
    required: ["topics", "terms"],
  },
  flashcards: {
    type: "object",
    properties: { cards: { type: "array", items: { type: "object", properties: { front: str, back: str, topic: str, sourceId: str, evidence: str }, required: ["front", "back", "topic", "sourceId", "evidence"] } } },
    required: ["cards"],
  },
  quiz: {
    type: "object",
    properties: { questions: { type: "array", items: { type: "object", properties: { type: str, question: str, choices: strArr, answer: str, alternates: strArr, explanation: str, topic: str, sourceId: str, evidence: str }, required: ["type", "question", "answer", "explanation", "topic", "sourceId", "evidence"] } } },
    required: ["questions"],
  },
  explain: { type: "object", properties: { simple: str, sourceId: str, evidence: str }, required: ["simple", "sourceId", "evidence"] },
  ping: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
} as const;

function thinkingConfig(): GenerateContentConfig["thinkingConfig"] | undefined {
  const mode = (process.env.GEMINI_THINKING ?? "low").trim().toLowerCase();
  if (mode === "off" || mode === "none" || mode === "") return undefined;
  if (mode === "minimal") return { thinkingLevel: ThinkingLevel.MINIMAL };
  if (mode === "medium") return { thinkingLevel: ThinkingLevel.MEDIUM };
  if (mode === "high") return { thinkingLevel: ThinkingLevel.HIGH };
  return { thinkingLevel: ThinkingLevel.LOW };
}

export function describeError(err: unknown, model = process.env.GEMINI_MODEL ?? "(not set)"): GeminiCallError {
  const message = err instanceof Error ? err.message : String(err);
  const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 0;
  const make = (code: string, msg: string, retryable: boolean, http: number) => new GeminiCallError({ code, message: msg, retryable, detail: message.slice(0, 500) }, http);
  if (/api key not valid|API_KEY_INVALID|permission denied|unauthenticated/i.test(message) || status === 401 || status === 403)
    return make("gemini_key", "Gemini rejected the API key. Check GEMINI_API_KEY in .env.local (or in Vercel), then restart or redeploy.", false, 502);
  if (status === 404 || /not found|is not supported for generateContent/i.test(message))
    return make("gemini_model", `Gemini could not find the model "${model}". Open the Setup check page to see which model names your key can use, then put one in GEMINI_MODEL.`, false, 502);
  if (status === 429 || /quota|rate limit|RESOURCE_EXHAUSTED/i.test(message))
    return make("gemini_rate", "Gemini says you are going too fast or used up today's free quota. Wait a minute and press Retry.", true, 429);
  if (status === 503 || status === 500 || /overloaded|unavailable|deadline|timeout|timed out|aborted|fetch failed/i.test(message))
    return make("gemini_busy", "Gemini is busy or took too long. Press Retry.", true, 503);
  return make("gemini_error", "Gemini returned an error. Press Retry; if it keeps happening, check the message in your terminal.", true, 502);
}

function client(apiKey: string): GoogleGenAI {
  const baseUrl = (process.env.GEMINI_BASE_URL ?? "").trim(); // optional: lets tests point the real SDK at a local fake
  return new GoogleGenAI(baseUrl ? { apiKey, httpOptions: { baseUrl } } : { apiKey });
}

async function callModel(ai: GoogleGenAI, model: string, job: ModelJob): Promise<string> {
  const config: GenerateContentConfig = {
    systemInstruction: SYSTEM_INSTRUCTION,
    responseMimeType: "application/json",
    responseJsonSchema: schemas[job.kind],
    temperature: 0.3,
    maxOutputTokens: 8192,
    thinkingConfig: thinkingConfig(),
    httpOptions: { timeout: 50_000 },
  };
  // If the model does not accept thinking or schema options, drop that option once and try again.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await ai.models.generateContent({ model, contents: job.prompt, config });
      const text = res.text;
      if (!text) throw new GeminiCallError({ code: "empty", message: "Gemini sent back an empty answer. Press Retry.", retryable: true }, 502);
      return text;
    } catch (err) {
      if (err instanceof GeminiCallError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === 0 && config.thinkingConfig && /thinking/i.test(msg)) { delete config.thinkingConfig; continue; }
      if (attempt <= 1 && config.responseJsonSchema && /schema|response_json|responseJson/i.test(msg)) { delete config.responseJsonSchema; continue; }
      throw describeError(err, model);
    }
  }
  throw describeError(new Error("Gemini kept rejecting the request options."), model);
}

/** Ask Gemini (or the test mock) and return the raw text of the answer. */
export async function askModel(job: ModelJob): Promise<string> {
  const mock = process.env.GEMINI_MOCK;
  if (mock) {
    try {
      return job.mock(mock);
    } catch (e) {
      throw describeError(e); // test errors take the same path as real Gemini errors
    }
  }
  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  const model = (process.env.GEMINI_MODEL ?? "").trim();
  const fallback = (process.env.GEMINI_FALLBACK_MODEL ?? "").trim();
  if (!apiKey) throw new GeminiCallError({ code: "no_key", message: "GEMINI_API_KEY is missing. Add it to .env.local (or to Vercel's environment variables) and restart.", retryable: false }, 500);
  if (!model) throw new GeminiCallError({ code: "no_model", message: "GEMINI_MODEL is missing. Add it to .env.local (for example GEMINI_MODEL=gemini-3.7-flash) and restart.", retryable: false }, 500);

  const ai = client(apiKey);
  try {
    return await callModel(ai, model, job);
  } catch (e) {
    // Optional safety net: if the main model is missing or overloaded, try GEMINI_FALLBACK_MODEL once.
    if (fallback && fallback !== model && e instanceof GeminiCallError && (e.api.code === "gemini_model" || e.api.code === "gemini_busy")) {
      console.error(`Model ${model} failed (${e.api.code}); trying fallback ${fallback}`);
      return callModel(ai, fallback, job);
    }
    throw e;
  }
}

/** For the Setup check page: which model names can this key use? */
export async function listModelNames(): Promise<{ ok: true; names: string[] } | { ok: false; error: ApiError }> {
  if (process.env.GEMINI_MOCK) return { ok: true, names: ["mock-model-a", "mock-model-b"] };
  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) return { ok: false, error: { code: "no_key", message: "GEMINI_API_KEY is missing.", retryable: false } };
  try {
    const pager = await client(apiKey).models.list({ config: { pageSize: 100 } });
    const names: string[] = [];
    for await (const m of pager) {
      const actions = m.supportedActions ?? []; // the SDK fills this from Google's "supportedGenerationMethods"
      const name = (m.name ?? "").replace(/^models\//, "");
      const canChat = actions.length ? actions.includes("generateContent") : !/embedding|imagen|veo|aqa|tts|image/i.test(name);
      if (name && canChat) names.push(name);
    }
    return { ok: true, names: names.filter((n) => n.startsWith("gemini")).sort().reverse() };
  } catch (e) {
    return { ok: false, error: describeError(e).api };
  }
}

/** A tiny real request, so you can see if your key and model work and how long one call takes. */
export async function pingGemini(): Promise<{ ok: true; ms: number; model: string } | { ok: false; error: ApiError }> {
  const started = Date.now();
  try {
    await askModel({ kind: "ping", prompt: 'Reply with this JSON only: {"ok": true}', mock: () => '{"ok":true}' });
    return { ok: true, ms: Date.now() - started, model: process.env.GEMINI_MODEL ?? "" };
  } catch (e) {
    return { ok: false, error: e instanceof GeminiCallError ? e.api : { code: "unknown", message: "Unknown error", retryable: true } };
  }
}
