// A small fake of Supabase used only by the tests: sign-up and sign-in (GoTrue), Google sign-in, and the database
// REST API (PostgREST) with per-user row level security for study_sets and study_set_texts.
// It is NOT the real thing; it only checks what StudyIt sends. The real Supabase is checked by you with /check.
import http from "node:http";
import { randomUUID } from "node:crypto";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

export function startMockSupabase(port) {
  const origin = `http://127.0.0.1:${port}`;
  const state = {
    rows: new Map(), // bad_question_reports by report_key
    requests: [],
    users: new Map(), // email -> user
    sets: new Map(), // id -> row
    texts: new Map(), // set_id -> row
    refresh: new Map(), // refresh token -> user id
    emails: [], // pretend inbox: {type, email}
    autoconfirm: false,
    googleEmail: "gina.google@gmail.com",
    googleName: "Gina Google",
    linkCalls: 0,
    confirm(email) { const u = state.users.get(email); if (u) u.confirmed = true; },
  };

  const publicUser = (u) => ({
    id: u.id, aud: "authenticated", role: "authenticated", email: u.email, email_confirmed_at: u.confirmed ? new Date().toISOString() : null,
    app_metadata: { provider: [...u.providers][0], providers: [...u.providers] },
    user_metadata: { full_name: u.name, ...(u.providers.has("google") ? { name: u.name, avatar_url: "" } : {}) },
    identities: [...u.providers].map((p) => ({ provider: p, id: `${u.id}-${p}`, user_id: u.id, identity_data: { email: u.email } })),
    created_at: u.created, updated_at: new Date().toISOString(),
  });
  const session = (u) => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const access = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: u.id, email: u.email, role: "authenticated", aud: "authenticated", exp, iat: exp - 3600 })}.mock`;
    const refresh = `r-${randomUUID()}`;
    state.refresh.set(refresh, u.id);
    return { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: refresh, user: publicUser(u) };
  };
  const userFromBearer = (req) => {
    const t = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    try {
      const p = JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString());
      if (p.exp * 1000 < Date.now()) return null;
      return [...state.users.values()].find((u) => u.id === p.sub) ?? null;
    } catch { return null; }
  };
  const newUser = (email, password, name, provider, confirmed) => {
    const u = { id: randomUUID(), email, password, name, confirmed, providers: new Set([provider]), created: new Date().toISOString() };
    state.users.set(email, u);
    return u;
  };

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const url = new URL(req.url, origin);
      state.requests.push({ method: req.method, path: url.pathname, query: url.search, headers: req.headers, body });
      const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, prefer, accept, accept-profile, content-profile, range, x-supabase-api-version", "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS", "Access-Control-Expose-Headers": "content-range" };
      if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
      const send = (status, obj, extra = {}) => { res.writeHead(status, { "Content-Type": "application/json", ...cors, ...extra }); res.end(obj === undefined ? "" : JSON.stringify(obj)); };
      const authErr = (status, code, msg) => send(status, { code: status, error_code: code, msg });
      let json = {};
      try { json = body ? JSON.parse(body) : {}; } catch { /* leave empty */ }
      const path = url.pathname;

      // ---------- Auth (GoTrue) ----------
      if (path.startsWith("/auth/v1/")) {
        const route = path.slice("/auth/v1".length);
        // Like the real server: browser redirects (/authorize) carry no headers, so they need no API key.
        if (!req.headers.apikey && route !== "/authorize" && !route.startsWith("/mock-")) return authErr(401, "no_authorization", "No API key found in request");
        if (route === "/settings" && req.method === "GET") return send(200, { external: { email: true, google: true }, disable_signup: false, mailer_autoconfirm: state.autoconfirm });
        if (route === "/signup" && req.method === "POST") {
          const { email, password, data } = json;
          if (!email || !password) return authErr(422, "validation_failed", "Signup requires a valid password");
          if (password.length < 6) return authErr(422, "weak_password", "Password should be at least 6 characters.");
          const existing = state.users.get(email);
          if (existing) {
            if (state.autoconfirm) return authErr(422, "user_already_exists", "User already registered");
            return send(200, { ...publicUser({ ...existing, id: randomUUID(), providers: new Set() }), identities: [] }); // obfuscated, like the real one
          }
          const u = newUser(email, password, data?.full_name ?? "", "email", state.autoconfirm);
          if (state.autoconfirm) return send(200, session(u));
          state.emails.push({ type: "confirm", email });
          return send(200, publicUser(u));
        }
        if (route === "/resend" && req.method === "POST") { state.emails.push({ type: "confirm", email: json.email }); return send(200, {}); }
        if (route === "/token" && req.method === "POST") {
          const grant = url.searchParams.get("grant_type");
          if (grant === "password") {
            const u = state.users.get(json.email);
            if (!u || u.password !== json.password) return authErr(400, "invalid_credentials", "Invalid login credentials");
            if (!u.confirmed) return authErr(400, "email_not_confirmed", "Email not confirmed");
            return send(200, session(u));
          }
          if (grant === "refresh_token") {
            const id = state.refresh.get(json.refresh_token);
            const u = [...state.users.values()].find((x) => x.id === id);
            return u ? send(200, session(u)) : authErr(400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
          }
          if (grant === "pkce") {
            if (!String(json.auth_code ?? "").startsWith("mock-code")) return authErr(400, "bad_code", "invalid flow state");
            let u = state.users.get(state.googleEmail);
            if (!u) u = newUser(state.googleEmail, null, state.googleName, "google", true);
            else { u.providers.add("google"); u.confirmed = true; if (!u.name) u.name = state.googleName; }
            return send(200, session(u));
          }
        }
        if (route === "/authorize" && req.method === "GET") {
          if (url.searchParams.get("provider") !== "google") return authErr(400, "provider_disabled", "Unsupported provider: provider is not enabled");
          const back = new URL(url.searchParams.get("redirect_to"));
          back.searchParams.set("code", `mock-code-${randomUUID()}`);
          res.writeHead(302, { Location: back.toString(), ...cors });
          return res.end();
        }
        if (route === "/user/identities/authorize" && req.method === "GET") { state.linkCalls++; return send(200, { url: `${origin}/auth/v1/mock-link-page` }); }
        if (route === "/logout" && req.method === "POST") { res.writeHead(204, cors); return res.end(); }
        if (route === "/recover" && req.method === "POST") { state.emails.push({ type: "recover", email: json.email }); return send(200, {}); }
        if (route === "/user") {
          const u = userFromBearer(req);
          if (!u) return authErr(401, "bad_jwt", "invalid JWT: unable to parse or verify signature");
          if (req.method === "GET") return send(200, publicUser(u));
          if (req.method === "PUT") {
            if (json.password) { if (json.password === u.password) return authErr(422, "same_password", "New password should be different from the old password."); u.password = json.password; u.providers.add("email"); }
            if (json.data?.full_name !== undefined) u.name = json.data.full_name;
            return send(200, publicUser(u));
          }
        }
        return authErr(404, "not_found", `No mock route for ${req.method} ${path}`);
      }

      // ---------- Database (PostgREST) ----------
      if (!path.startsWith("/rest/v1/")) return send(405, { message: "Method not allowed (wrong path)" });
      const apikey = req.headers.apikey;
      if (!apikey) return send(401, { message: "No API key found in request" });
      const isSecret = apikey.startsWith("sb_secret_") || apikey.startsWith("eyJ");
      if (apikey.startsWith("sb_secret_") && req.headers.authorization) return send(401, { message: "sb_secret keys must not be sent as a Bearer token" });
      const table = path.slice("/rest/v1/".length);

      if (table === "bad_question_reports") {
        if (req.method === "GET") return send(200, [...state.rows.values()].slice(0, 1).map((r) => ({ id: r.report_key })));
        if (req.method === "POST") {
          const row = json;
          if (!row.report_key) return send(400, { message: "report_key is required" });
          const merge = String(req.headers.prefer ?? "").includes("resolution=merge-duplicates");
          if (state.rows.has(row.report_key) && !merge) return send(409, { message: "duplicate key value violates unique constraint" });
          state.rows.set(row.report_key, row);
          res.writeHead(201, cors); return res.end();
        }
      }

      if (table === "study_sets" || table === "study_set_texts") {
        const store = table === "study_sets" ? state.sets : state.texts;
        const key = table === "study_sets" ? "id" : "set_id";
        const user = userFromBearer(req);
        if (!user && !isSecret) return send(401, { code: "42501", message: `permission denied for table ${table}` });
        const mine = (row) => isSecret && !user ? true : row.user_id === user.id;
        const q = url.searchParams;
        const filters = [...q.entries()].filter(([k]) => !["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)).map(([k, v]) => [k, v.replace(/^eq\./, "")]);
        const matches = () => [...store.values()].filter(mine).filter((r) => filters.every(([k, v]) => String(r[k]) === v));

        if (req.method === "GET") {
          let rows = matches();
          const order = q.get("order");
          if (order) { const [col, dir] = order.split("."); rows = rows.sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (dir === "desc" ? -1 : 1)); }
          if (q.get("limit")) rows = rows.slice(0, Number(q.get("limit")));
          const sel = q.get("select") ?? "*";
          const out = rows.map((r) => {
            if (sel === "*") return r;
            const o = {};
            for (const part of sel.split(",")) {
              const m = part.match(/^(?:(\w+):)?(\w+)(?:->(\w+))?$/);
              if (!m) continue;
              const [, alias, col, sub] = m;
              o[alias ?? sub ?? col] = sub ? (r[col]?.[sub] ?? null) : r[col];
            }
            return o;
          });
          if (String(req.headers.accept ?? "").includes("vnd.pgrst.object")) return out.length === 1 ? send(200, out[0]) : send(406, { code: "PGRST116", message: "The result contains 0 rows" });
          return send(200, out);
        }
        if (req.method === "POST") {
          const rows = Array.isArray(json) ? json : [json];
          for (const row of rows) {
            if (!row.user_id) row.user_id = user?.id;
            if (user && row.user_id !== user.id) return send(403, { code: "42501", message: `new row violates row-level security policy for table "${table}"` });
            const k = row[key];
            const existing = store.get(k);
            if (existing && !mine(existing)) return send(403, { code: "42501", message: `new row violates row-level security policy for table "${table}"` });
            if (existing && !String(req.headers.prefer ?? "").includes("resolution=merge-duplicates")) return send(409, { code: "23505", message: "duplicate key value violates unique constraint" });
            if (table === "study_set_texts") {
              const parent = state.sets.get(row.set_id);
              if (!parent || parent.user_id !== row.user_id) return send(409, { code: "23503", message: "insert or update violates foreign key constraint" });
            }
            store.set(k, { ...(existing ?? {}), ...row });
          }
          res.writeHead(201, cors); return res.end();
        }
        if (req.method === "PATCH") {
          for (const r of matches()) Object.assign(r, json);
          res.writeHead(204, cors); return res.end();
        }
        if (req.method === "DELETE") {
          for (const r of matches()) { store.delete(r[key]); if (table === "study_sets") state.texts.delete(r.id); }
          res.writeHead(204, cors); return res.end();
        }
      }
      send(404, { code: "42P01", message: `relation "${table}" does not exist` });
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ state, origin, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) })));
}
