// Run with:  npm run build  and then  npm test
// Starts a fake Supabase and the real built app, then checks every API route, including failure cases.
// Gemini is replaced by the built-in mock (GEMINI_MOCK) so no real key or internet is needed.
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { startMockSupabase } from "./mock-supabase.mjs";
import { startMockGemini } from "./mock-gemini-server.mjs";

let current = null;
const APP_PORT = 3199, SB_PORT = 54399, GM_PORT = 54398;
const base = `http://127.0.0.1:${APP_PORT}`;
let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ok   ${name}`); } else { failed++; console.log(`  FAIL ${name} ${extra}`); }
}

async function startApp(env) {
  const child = spawn("npx", ["next", "start", "-p", String(APP_PORT)], { env: { ...process.env, NODE_ENV: "production", ...env }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  const killGroup = () => { try { process.kill(-child.pid, "SIGTERM"); } catch { /* already stopped */ } };
  current = { stop: async () => { killGroup(); await sleep(600); } };
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`${base}/api/health`); if (r.ok) return { stop: async () => { killGroup(); await sleep(600); }, log: () => log }; } catch { /* not ready */ }
    await sleep(500);
  }
  killGroup();
  throw new Error("App did not start:\n" + log);
}

const post = (path, body, headers = {}) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: await r.json() }));

const SECTIONS = [
  { id: "s1", label: "Page 1", text: "A firewall is a network security device that monitors incoming and outgoing traffic. It decides whether to allow or block traffic based on security rules." },
  { id: "s2", label: "Page 2", text: "Phishing is a social engineering attack that tricks people into revealing passwords. Attackers often pretend to be a trusted company in an email." },
  { id: "s3", label: "Page 3", text: "Encryption converts readable data into unreadable ciphertext. Only someone with the correct key can turn the ciphertext back into readable data." },
];

const sb = await startMockSupabase(SB_PORT);
const gm = await startMockGemini(GM_PORT);
const baseEnv = { SUPABASE_ALLOW_LOCAL: "1", GEMINI_MOCK: "ok", GEMINI_MODEL: "mock-model", SUPABASE_URL: `http://127.0.0.1:${SB_PORT}`, SUPABASE_SECRET_KEY: "sb_secret_testkey123" };

try {
  console.log("\n[1] Normal run (mock Gemini, mock Supabase, new-style secret key)");
  let app = await startApp(baseEnv);

  let r, j;
  let h = await (await fetch(`${base}/api/health`)).json();
  check("health: mock mode on, model shown, no key leaked", h.gemini.mockMode === true && h.gemini.model === "mock-model" && !JSON.stringify(h).includes("sb_secret"));
  check("health: Supabase reachable", h.supabase.configured && h.supabase.reachable === true, JSON.stringify(h.supabase));
  const ping = sb.state.requests.at(-1);
  check("supabase: apikey header sent, NO Authorization header for sb_secret key", ping.headers.apikey === "sb_secret_testkey123" && !ping.headers.authorization);

  // generate
  let g = await post("/api/generate", { kind: "reviewer", sections: SECTIONS });
  check("generate reviewer: ok with topics and terms", g.status === 200 && g.json.ok && g.json.reviewer.topics.length > 0 && g.json.reviewer.terms.length > 0, JSON.stringify(g.json).slice(0, 200));
  g = await post("/api/generate", { kind: "flashcards", sections: SECTIONS, count: 5 });
  check("generate flashcards: 5 cards, each cites a real section", g.json.ok && g.json.flashcards.length === 5 && g.json.flashcards.every((c) => SECTIONS.some((s) => s.id === c.sourceId)), JSON.stringify(g.json).slice(0, 200));
  g = await post("/api/generate", { kind: "quiz", sections: SECTIONS, count: 8 });
  const qs = g.json.questions ?? [];
  check("generate quiz: 8 questions of all four types", g.json.ok && qs.length === 8 && new Set(qs.map((q) => q.type)).size === 4, JSON.stringify(qs.map((q) => q.type)));
  check("generate quiz: multiple choice has 4 choices incl. the answer; true/false is True/False", qs.filter((q) => q.type === "multiple_choice").every((q) => q.choices.length === 4 && q.choices.includes(q.answer)) && qs.filter((q) => q.type === "true_false").every((q) => ["True", "False"].includes(q.answer)));
  check("generate quiz: fill-in-the-blank has a blank", qs.filter((q) => q.type === "fill_blank").every((q) => /_{3,}/.test(q.question)));
  g = await post("/api/generate", { kind: "quiz", sections: SECTIONS, count: 4, types: ["true_false"] });
  check("generate quiz: only the requested type", g.json.ok && g.json.questions.every((q) => q.type === "true_false"));

  g = await post("/api/generate", { kind: "quiz", sections: SECTIONS, count: 25 });
  check("generate: count over 20 per request rejected (400)", g.status === 400 && g.json.ok === false);
  g = await post("/api/generate", { kind: "nonsense", sections: SECTIONS });
  check("generate: unknown kind rejected (400)", g.status === 400);
  g = await post("/api/generate", { kind: "quiz", sections: [{ id: "bad id", label: "x", text: "y" }], count: 3 });
  check("generate: malformed section rejected (400)", g.status === 400);
  g = await post("/api/generate", { kind: "flashcards", sections: [{ id: "s1", label: "p", text: "x".repeat(70_000) }], count: 3 });
  check("generate: oversize batch rejected (400)", g.status === 400);
  r = await fetch(`${base}/api/generate`, { method: "POST", body: "not json" });
  check("generate: invalid JSON body rejected (400)", r.status === 400);

  // explain simpler
  const sec1 = SECTIONS[0];
  let ex = await post("/api/explain", { text: "A firewall is a network security device.", section: sec1 });
  check("explain: simpler text returned with the section id", ex.status === 200 && ex.json.ok && ex.json.sourceId === "s1" && ex.json.simple.length > 5, JSON.stringify(ex.json));
  ex = await post("/api/explain", { text: "", section: sec1 });
  check("explain: empty text rejected (400)", ex.status === 400);
  ex = await post("/api/explain", { text: "x", section: { id: "bad", label: "p", text: "t" } });
  check("explain: bad section rejected (400)", ex.status === 400);

  // report + idempotency
  const rep = { materialId: "mat1", itemId: "q1", itemKind: "question", itemText: "What is a firewall?", sourceLabel: "Page 1", reason: "The answer is wrong" };
  let p1 = await post("/api/report", rep), p2 = await post("/api/report", rep);
  check("report: stored in Supabase", p1.json.ok && p1.json.stored === true, JSON.stringify(p1.json));
  check("report: sending the same report twice leaves ONE row (idempotent)", p2.json.stored === true && sb.state.rows.size === 1, `rows=${sb.state.rows.size}`);
  await post("/api/report", { ...rep, itemId: "q2" });
  check("report: a different item adds a second row", sb.state.rows.size === 2);
  const lastPost = sb.state.requests.filter((x) => x.method === "POST").at(-1);
  check("report: uses on_conflict upsert and no Authorization header", /on_conflict=report_key/.test(lastPost.query) && !lastPost.headers.authorization && /merge-duplicates/.test(lastPost.headers.prefer));
  p1 = await post("/api/report", { materialId: "m" });
  check("report: missing details rejected (400)", p1.status === 400);
  await app.stop();

  console.log("\n[2] Old JWT-style Supabase key (eyJ...) must ALSO send Authorization");
  sb.state.requests.length = 0;
  app = await startApp({ ...baseEnv, SUPABASE_SECRET_KEY: "eyJhbGciOiJIUzI1NiJ9.test.sig" });
  h = await (await fetch(`${base}/api/health`)).json();
  const jwtPing = sb.state.requests.at(-1);
  check("health: reachable with JWT key", h.supabase.reachable === true);
  check("JWT key: apikey AND Bearer header sent", jwtPing.headers.apikey?.startsWith("eyJ") && jwtPing.headers.authorization?.startsWith("Bearer eyJ"));
  await app.stop();

  console.log("\n[3] Wrong SUPABASE_URL (with /rest/v1 path) is caught with a clear message");
  app = await startApp({ ...baseEnv, SUPABASE_URL: `http://127.0.0.1:${SB_PORT}/rest/v1` });
  h = await (await fetch(`${base}/api/health`)).json();
  check("health: explains the URL must have no path", h.supabase.configured && h.supabase.reachable === false && /no path/i.test(h.supabase.problem), JSON.stringify(h.supabase));
  p1 = await post("/api/report", rep);
  check("report: still succeeds for the student (flag is kept in browser) but says not stored", p1.json.ok && p1.json.stored === false);
  await app.stop();

  console.log("\n[4] Supabase not configured at all: app still works");
  app = await startApp({ ...baseEnv, SUPABASE_URL: "", SUPABASE_SECRET_KEY: "" });
  h = await (await fetch(`${base}/api/health`)).json();
  check("health: supabase.configured is false", h.supabase.configured === false);
  p1 = await post("/api/report", rep);
  check("report: ok, stored=false", p1.json.ok && p1.json.stored === false);
  await app.stop();

  console.log("\n[5] Gemini returns invalid JSON");
  app = await startApp({ ...baseEnv, GEMINI_MOCK: "badjson" });
  g = await post("/api/generate", { kind: "flashcards", sections: SECTIONS, count: 3 });
  check("badjson: friendly retryable error, not a crash", g.status === 502 && g.json.error.code === "bad_json" && g.json.error.retryable === true && /Retry/.test(g.json.error.message), JSON.stringify(g.json));
  check("badjson: no internal detail leaks in production", g.json.error.detail === undefined);
  await app.stop();

  console.log("\n[6] Gemini invents facts (quotes not in the material)");
  app = await startApp({ ...baseEnv, GEMINI_MOCK: "fabricate" });
  for (const kind of ["reviewer", "flashcards", "quiz"]) {
    g = await post("/api/generate", { kind, sections: SECTIONS, count: 3 });
    check(`fabricate (${kind}): everything rejected, nothing_valid`, g.status === 502 && g.json.error.code === "nothing_valid" && g.json.error.retryable === true, JSON.stringify(g.json).slice(0, 200));
  }
  await app.stop();

  console.log("\n[7] Gemini quota / rate limit");
  app = await startApp({ ...baseEnv, GEMINI_MOCK: "quota" });
  g = await post("/api/generate", { kind: "quiz", sections: SECTIONS, count: 3 });
  check("quota: 429, gemini_rate, retryable, plain-language message", g.status === 429 && g.json.error.code === "gemini_rate" && g.json.error.retryable === true && /Wait a minute/.test(g.json.error.message), JSON.stringify(g.json));
  await app.stop();

  console.log("\n[8] Missing Gemini settings");
  app = await startApp({ ...baseEnv, GEMINI_MOCK: "", GEMINI_API_KEY: "", GEMINI_MODEL: "gemini-test" });
  g = await post("/api/generate", { kind: "flashcards", sections: SECTIONS, count: 3 });
  check("no key: clear message naming GEMINI_API_KEY, not retryable", g.json.error.code === "no_key" && /GEMINI_API_KEY/.test(g.json.error.message) && g.json.error.retryable === false, JSON.stringify(g.json));
  await app.stop();
  app = await startApp({ ...baseEnv, GEMINI_MOCK: "", GEMINI_API_KEY: "fake-key", GEMINI_MODEL: "" });
  g = await post("/api/generate", { kind: "flashcards", sections: SECTIONS, count: 3 });
  check("no model: clear message naming GEMINI_MODEL", g.json.error.code === "no_model" && /GEMINI_MODEL/.test(g.json.error.message), JSON.stringify(g.json));
  await app.stop();

  console.log("\n[7b] 'Explain simpler' must not add facts");
  app = await startApp({ ...baseEnv, GEMINI_MOCK: "newfacts" });
  ex = await post("/api/explain", { text: "A firewall is a network security device.", section: SECTIONS[0] });
  check("explain: a simpler text with new numbers/names is rejected", ex.status === 502 && ex.json.error.code === "nothing_valid" && ex.json.error.retryable === true, JSON.stringify(ex.json));
  await app.stop();
  app = await startApp({ ...baseEnv, GEMINI_MOCK: "fabricate" });
  ex = await post("/api/explain", { text: "A firewall is a network security device.", section: SECTIONS[0] });
  check("explain: a quote that is not in the section is rejected", ex.status === 502 && ex.json.error.code === "nothing_valid", JSON.stringify(ex.json));
  await app.stop();

  console.log("\n[7c] Access code (ACCESS_CODE)");
  app = await startApp({ ...baseEnv, ACCESS_CODE: "open-sesame" });
  h = await (await fetch(`${base}/api/health`)).json();
  check("health: says an access code is required, never shows it", h.access.required === true && !JSON.stringify(h).includes("open-sesame"));
  g = await post("/api/generate", { kind: "flashcards", sections: SECTIONS, count: 3 });
  check("generate without code -> 401 access_code", g.status === 401 && g.json.error.code === "access_code", JSON.stringify(g.json));
  g = await post("/api/generate", { kind: "flashcards", sections: SECTIONS, count: 3 }, { "x-access-code": "wrong" });
  check("generate with wrong code -> 401", g.status === 401);
  g = await post("/api/generate", { kind: "flashcards", sections: SECTIONS, count: 3 }, { "x-access-code": "open-sesame" });
  check("generate with the right code works", g.status === 200 && g.json.ok);
  ex = await post("/api/explain", { text: "A firewall is a network security device.", section: SECTIONS[0] });
  check("explain without code -> 401", ex.status === 401);
  ex = await post("/api/explain", { text: "A firewall is a network security device.", section: SECTIONS[0] }, { "x-access-code": "open-sesame" });
  check("explain with the right code works", ex.status === 200 && ex.json.ok);
  p1 = await post("/api/report", rep);
  check("report without code -> 401 (protects your database)", p1.status === 401);
  p1 = await post("/api/report", { ...rep, itemId: "q9" }, { "x-access-code": "open-sesame" });
  check("report with the code works", p1.json.ok && p1.json.stored === true);
  let ac = await post("/api/access", { code: "nope" });
  check("access check: wrong code -> 401", ac.status === 401 && ac.json.error.code === "access_code");
  ac = await post("/api/access", { code: "open-sesame" });
  check("access check: right code -> ok", ac.status === 200 && ac.json.ok && ac.json.required === true);
  r = await fetch(`${base}/api/health?live=1`);
  check("health?live=1 is blocked without the code (cannot burn your quota)", r.status === 401);
  r = await fetch(`${base}/api/health?live=1&models=1`, { headers: { "x-access-code": "open-sesame" } });
  j = await r.json();
  check("health?live=1 works with the code (mock Gemini)", r.status === 200 && j.gemini.live.ok === true && j.gemini.models.ok === true, JSON.stringify(j.gemini));
  let hit = 0;
  for (let i = 0; i < 14; i++) { const x = await post("/api/access", { code: "guess" + i }); if (x.status === 429) hit++; }
  check("guessing the code is rate limited (429 after a few tries)", hit > 0, `rate-limited ${hit} times`);
  await app.stop();

  console.log("\n[7d] No ACCESS_CODE set: open, and the Setup check says so");
  app = await startApp(baseEnv);
  ac = await post("/api/access", { code: "" });
  check("access: not required when ACCESS_CODE is empty", ac.status === 200 && ac.json.required === false);
  r = await fetch(`${base}/api/health?live=1`);
  j = await r.json();
  check("health?live=1 in mock mode reports ok", r.status === 200 && j.gemini.live.ok === true && j.access.required === false);
  await app.stop();

  console.log("\n[7e] Accounts ON (SUPABASE_PUBLISHABLE_KEY): sign-in tokens protect Gemini, and the shared code no longer counts");
  sb.state.autoconfirm = true;
  const mk = async (email) => {
    await fetch(`http://127.0.0.1:${SB_PORT}/auth/v1/signup`, { method: "POST", headers: { apikey: "sb_publishable_test", "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "password123", data: { full_name: "Test" } }) });
    const tk = await (await fetch(`http://127.0.0.1:${SB_PORT}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: "sb_publishable_test", "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "password123" }) })).json();
    return tk.access_token;
  };
  const token = await mk("api.user@example.com");
  app = await startApp({ ...baseEnv, SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test", ACCESS_CODE: "old-shared-code" });
  h = await (await fetch(`${base}/api/health`)).json();
  check("health: accounts configured and reachable; Google and email sign-in reported", h.accounts.configured && h.accounts.reachable && h.accounts.settings.googleEnabled && h.accounts.settings.emailEnabled, JSON.stringify(h.accounts));
  check("health: all three database tables found", h.supabase.reachable === true && h.supabase.tables.study_sets && h.supabase.tables.study_set_texts && h.supabase.tables.bad_question_reports, JSON.stringify(h.supabase));
  check("health: shared code reported as not needed once accounts are on", h.access.required === false);
  g = await post("/api/generate", { kind: "flashcards", sections: SECTIONS, count: 3 });
  check("generate without sign-in -> 401 login_required", g.status === 401 && g.json.error.code === "login_required", JSON.stringify(g.json));
  g = await post("/api/generate", { kind: "flashcards", sections: SECTIONS, count: 3 }, { "x-access-code": "old-shared-code" });
  check("the old shared code does NOT bypass sign-in", g.status === 401);
  g = await post("/api/generate", { kind: "flashcards", sections: SECTIONS, count: 3 }, { Authorization: "Bearer not.a.token" });
  check("a fake token is rejected", g.status === 401);
  g = await post("/api/generate", { kind: "flashcards", sections: SECTIONS, count: 3 }, { Authorization: `Bearer ${token}` });
  check("generate with a real sign-in token works", g.status === 200 && g.json.ok);
  g = await post("/api/generate", { kind: "quiz", sections: SECTIONS, count: 4 }, { Authorization: `Bearer ${token}` });
  check("a second call also works (token check is cached)", g.status === 200 && g.json.ok);
  ex = await post("/api/explain", { text: "A firewall is a network security device.", section: SECTIONS[0] }, { Authorization: `Bearer ${token}` });
  check("explain works with a token and is refused without one", ex.status === 200 && (await post("/api/explain", { text: "x", section: SECTIONS[0] })).status === 401);
  p1 = await post("/api/report", { ...rep, itemId: "acct1" });
  check("report needs sign-in", p1.status === 401);
  p1 = await post("/api/report", { ...rep, itemId: "acct1" }, { Authorization: `Bearer ${token}` });
  check("report works with sign-in", p1.json.ok && p1.json.stored === true);
  r = await fetch(`${base}/api/health?live=1`);
  check("health?live=1 is blocked without sign-in", r.status === 401);
  r = await fetch(`${base}/api/health?live=1`, { headers: { Authorization: `Bearer ${token}` } });
  check("health?live=1 works with sign-in", r.status === 200 && (await r.json()).gemini.live.ok === true);
  await app.stop();

  console.log("\n[7f] Wrong key in the wrong place");
  app = await startApp({ ...baseEnv, SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test", SUPABASE_SECRET_KEY: "sb_publishable_test" });
  h = await (await fetch(`${base}/api/health`)).json();
  check("a publishable key in SUPABASE_SECRET_KEY is caught with a clear message", h.supabase.reachable === false && /PUBLISHABLE key/.test(h.supabase.problem), JSON.stringify(h.supabase));
  await app.stop();
  app = await startApp({ ...baseEnv, SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test", SUPABASE_URL: `http://127.0.0.1:${SB_PORT}/rest/v1` });
  g = await post("/api/generate", { kind: "flashcards", sections: SECTIONS, count: 3 }, { Authorization: `Bearer ${token}` });
  check("a bad SUPABASE_URL gives a clear config error, not a crash", g.status === 500 && g.json.error.code === "supabase_config" && /no path/i.test(g.json.error.message), JSON.stringify(g.json));
  await app.stop();
  sb.state.autoconfirm = false;

  console.log("\n[9] REAL @google/genai SDK talking to a fake Gemini server (tests request format, errors, retries)");
  const realEnv = { ...baseEnv, GEMINI_MOCK: "", GEMINI_API_KEY: "fake-key", GEMINI_BASE_URL: `http://127.0.0.1:${GM_PORT}`, GEMINI_THINKING: "low" };
  const gmBodies = () => gm.state.requests.filter((x) => x.method === "POST").map((x) => JSON.parse(x.body));

  gm.state.requests.length = 0;
  app = await startApp({ ...realEnv, GEMINI_MODEL: "ok-model" });
  g = await post("/api/generate", { kind: "reviewer", sections: SECTIONS });
  check("real SDK: reviewer works", g.status === 200 && g.json.ok && g.json.reviewer.topics.length > 0, JSON.stringify(g.json).slice(0, 200));
  const sent = gmBodies()[0] ?? {};
  const gcfg = sent.generationConfig ?? {};
  check("real SDK request: model name comes from GEMINI_MODEL", gm.state.requests.at(-1).path.includes("models/ok-model:generateContent"), gm.state.requests.at(-1).path);
  check("real SDK request: API key header sent", gm.state.requests.at(-1).headers["x-goog-api-key"] === "fake-key");
  check("real SDK request: JSON mode, low thinking, token limit", gcfg.responseMimeType === "application/json" && JSON.stringify(gcfg.thinkingConfig).toUpperCase().includes("LOW") && gcfg.maxOutputTokens === 8192, JSON.stringify(gcfg).slice(0, 300));
  check("real SDK request: schema and system rules sent", Boolean(gcfg.responseJsonSchema || gcfg.responseSchema) && JSON.stringify(sent.systemInstruction ?? sent.system_instruction ?? "").includes("ONLY facts"), JSON.stringify(Object.keys(sent)));
  check("real SDK request: the material is wrapped in <material> tags", JSON.stringify(sent.contents).includes("<material>") && JSON.stringify(sent.contents).includes('section id=\\"s1\\"'));
  g = await post("/api/generate", { kind: "flashcards", sections: SECTIONS, count: 4 });
  check("real SDK: flashcards work", g.json.ok && g.json.flashcards.length === 4);
  g = await post("/api/generate", { kind: "quiz", sections: SECTIONS, count: 8 });
  check("real SDK: quiz works with all 4 types", g.json.ok && new Set(g.json.questions.map((q) => q.type)).size === 4, JSON.stringify(g.json).slice(0, 200));
  ex = await post("/api/explain", { text: "A firewall is a network security device.", section: SECTIONS[0] });
  check("real SDK: explain simpler works", ex.json.ok && /simple words/.test(ex.json.simple), JSON.stringify(ex.json));
  h = await (await fetch(`${base}/api/health?live=1&models=1`)).json();
  check("real SDK: live check ok and measures time", h.gemini.live.ok === true && typeof h.gemini.live.ms === "number", JSON.stringify(h.gemini.live));
  check("real SDK: model list keeps only gemini text models", h.gemini.models.ok && h.gemini.models.names.join() === "gemini-fake-lite,gemini-fake-flash", JSON.stringify(h.gemini.models));
  await app.stop();

  const scenario = async (label, model, env, expect) => {
    gm.state.requests.length = 0;
    app = await startApp({ ...realEnv, GEMINI_MODEL: model, ...env });
    g = await post("/api/generate", { kind: "flashcards", sections: SECTIONS, count: 3 });
    const n = gmBodies().length;
    check(label, expect(g, n), `${g.status} ${JSON.stringify(g.json).slice(0, 220)} requests=${n}`);
    await app.stop();
  };
  await scenario("real SDK: model not found (404) -> clear message naming the model, not retryable", "err-404", {}, (r) => r.status === 502 && r.json.error.code === "gemini_model" && r.json.error.message.includes("err-404") && r.json.error.retryable === false);
  await scenario("real SDK: model not found + GEMINI_FALLBACK_MODEL -> falls back and works", "err-404", { GEMINI_FALLBACK_MODEL: "ok-model" }, (r, n) => r.status === 200 && r.json.ok && n === 2);
  await scenario("real SDK: quota (429) -> gemini_rate, retryable", "err-429", {}, (r) => r.status === 429 && r.json.error.code === "gemini_rate" && r.json.error.retryable === true);
  await scenario("real SDK: invalid key -> gemini_key, not retryable", "err-key", {}, (r) => r.json.error?.code === "gemini_key" && r.json.error.retryable === false);
  await scenario("real SDK: overloaded (503) -> gemini_busy, retryable", "err-503", {}, (r) => r.status === 503 && r.json.error.code === "gemini_busy" && r.json.error.retryable === true);
  await scenario("real SDK: model rejects thinking option -> retried without it, works", "err-thinking", {}, (r, n) => r.status === 200 && r.json.ok && n === 2);
  await scenario("real SDK: model rejects schema option -> retried without it, works", "err-schema", {}, (r, n) => r.status === 200 && r.json.ok && n >= 2);
  await scenario("real SDK: GEMINI_THINKING=off sends no thinking option", "ok-model", { GEMINI_THINKING: "off" }, (r) => r.json.ok && !JSON.stringify(gmBodies()[0].generationConfig).includes("thinking"));
  await scenario("real SDK: GEMINI_THINKING=minimal is passed through", "ok-model", { GEMINI_THINKING: "minimal" }, (r) => r.json.ok && JSON.stringify(gmBodies()[0].generationConfig.thinkingConfig).toUpperCase().includes("MINIMAL"));

  console.log("\n[10] Real SDK pointed at nothing (no server): must fail politely");
  app = await startApp({ ...realEnv, GEMINI_MODEL: "ok-model", GEMINI_BASE_URL: "http://127.0.0.1:59999" });
  g = await post("/api/generate", { kind: "flashcards", sections: SECTIONS, count: 3 });
  check("unreachable Gemini -> gemini_busy (retryable), no crash", g.status === 503 && g.json.error.code === "gemini_busy" && g.json.error.retryable === true, JSON.stringify(g.json));
  await app.stop();
} catch (e) {
  failed++;
  console.error("TEST RUN CRASHED:", e);
} finally {
  await current?.stop();
  await sb.close();
  await gm.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
