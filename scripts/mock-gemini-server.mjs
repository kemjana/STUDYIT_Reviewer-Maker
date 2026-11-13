// A fake Google Gemini REST server used only by the tests. The REAL @google/genai SDK talks to it
// (via GEMINI_BASE_URL), so we test the real request format, the real error handling, and the retries.
// The model name picks the behaviour:
//   ok-model       normal answers          err-404   "model not found"      err-429   quota
//   err-key        "API key not valid"     err-503   overloaded             err-thinking  rejects thinking options once
//   err-schema     rejects the JSON schema option
import http from "node:http";

const sentence = (t) => { const m = t.replace(/\s+/g, " ").trim().match(/^.{20,160}?[.!?](\s|$)/); return (m ? m[0] : t.replace(/\s+/g, " ").trim().slice(0, 120)).trim(); };

function answer(prompt) {
  const secs = [...prompt.matchAll(/<section id="(s\d+)" label="([^"]*)">\n([\s\S]*?)\n<\/section>/g)].map((m) => ({ id: m[1], label: m[2], text: m[3] }));
  const n = Number((prompt.match(/Create exactly (\d+)/) ?? [])[1] ?? 3);
  const ev = (i) => sentence(secs[i % secs.length].text);
  if (prompt.includes('Reply with this JSON only')) return { ok: true };
  if (prompt.includes("Rewrite the text inside <original>")) return { simple: `In simple words: ${sentence(secs[0].text)}`, sourceId: secs[0].id, evidence: ev(0) };
  if (prompt.includes("Create a reviewer")) {
    return { topics: secs.slice(0, 3).map((s, i) => ({ title: `Topic ${i + 1}`, sourceId: s.id, summary: `${sentence(s.text)} Main idea.`, keyPoints: ["Point A", "Point B"], evidence: ev(i) })), terms: secs.slice(0, 2).map((s, i) => ({ term: `Term ${i + 1}`, definition: sentence(s.text), sourceId: s.id, evidence: ev(i) })) };
  }
  if (prompt.includes("flashcards")) return { cards: Array.from({ length: n }, (_, i) => ({ front: `Card ${i + 1} about ${secs[i % secs.length].label}?`, back: sentence(secs[i % secs.length].text), topic: "General", sourceId: secs[i % secs.length].id, evidence: ev(i) })) };
  const labelToType = { "Multiple choice": "multiple_choice", "True or false": "true_false", Identification: "identification", "Fill in the blank": "fill_blank" };
  const listed = (prompt.match(/Mix these types: ([^\n]*)\./) ?? [])[1];
  const types = listed ? listed.split(", ").map((l) => labelToType[l]).filter(Boolean) : Object.values(labelToType);
  return { questions: Array.from({ length: n }, (_, i) => {
    const s = secs[i % secs.length], type = types[i % types.length], sen = sentence(s.text);
    const word = (sen.split(" ").filter((w) => w.length > 4)[0] ?? "answer").replace(/[^\p{L}\p{N}]/gu, "");
    const base = { type, topic: "General", sourceId: s.id, evidence: ev(i), explanation: `The material says: ${sen}` };
    if (type === "multiple_choice") return { ...base, question: `Which word appears in ${s.label}? (${i + 1})`, choices: [word, "Zebra", "Quartz", "Nebula"], answer: word };
    if (type === "true_false") return { ...base, question: `${sen} (${i + 1})`, answer: "True" };
    if (type === "fill_blank") return { ...base, question: `${sen.replace(word, "_____")} (${i + 1})`, answer: word, alternates: [] };
    return { ...base, question: `Name a key word from ${s.label}. (${i + 1})`, answer: word };
  }) };
}

export function startMockGemini(port) {
  const state = { requests: [] };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (status, obj) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
      const err = (code, status, message) => send(code, { error: { code, message, status } });
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      state.requests.push({ method: req.method, path: url.pathname, headers: req.headers, body });
      if (!req.headers["x-goog-api-key"]) return err(403, "PERMISSION_DENIED", "Missing API key");
      if (req.method === "GET" && /\/models$/.test(url.pathname)) {
        return send(200, { models: [
          { name: "models/gemini-fake-flash", supportedGenerationMethods: ["generateContent", "countTokens"] },
          { name: "models/gemini-fake-lite", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-embedding-fake", supportedGenerationMethods: ["embedContent"] },
          { name: "models/imagen-fake", supportedGenerationMethods: ["predict"] },
        ] });
      }
      const m = url.pathname.match(/models\/([^/:]+):generateContent$/);
      if (req.method !== "POST" || !m) return err(404, "NOT_FOUND", `Unknown path ${url.pathname}`);
      const model = m[1];
      const json = JSON.parse(body || "{}");
      const gc = json.generationConfig ?? {};
      if (model === "err-404") return err(404, "NOT_FOUND", `models/${model} is not found for API version v1beta, or is not supported for generateContent.`);
      if (model === "err-429") return err(429, "RESOURCE_EXHAUSTED", "You exceeded your current quota, please check your plan and billing details.");
      if (model === "err-key") return err(400, "INVALID_ARGUMENT", "API key not valid. Please pass a valid API key.");
      if (model === "err-503") return err(503, "UNAVAILABLE", "The model is overloaded. Please try again later.");
      if (model === "err-thinking" && gc.thinkingConfig) return err(400, "INVALID_ARGUMENT", "Thinking level is not supported for this model.");
      if (model === "err-schema" && (gc.responseJsonSchema || gc.responseSchema)) return err(400, "INVALID_ARGUMENT", "Invalid JSON payload received. Unknown name responseJsonSchema: schema is not supported.");
      const prompt = json.contents?.[0]?.parts?.[0]?.text ?? "";
      send(200, {
        candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(answer(prompt)) }] }, finishReason: "STOP", index: 0 }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 },
      });
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ state, close: () => new Promise((r) => server.close(r)) })));
}
