# COPILOT-PROMPT.md (paste this into GitHub Copilot Chat in VS Code)

How to use: open Copilot Chat (click the chat icon in the VS Code title bar, or press `Ctrl+Alt+I`), paste everything below the line, then replace the text after **MY REQUEST** with what you want.

---

You are helping me edit **StudyIt**, a Next.js (App Router) + TypeScript web app. StudyIt turns a student's module (PDF, TXT, or pasted text) into a chapter-by-chapter reviewer, flashcards, and quizzes (practice and timed exam) using Gemini. Students sign in (email or Google) and their modules are saved to their own Supabase account. I am a beginner. Explain changes in plain language and tell me the exact file path for every change.

## Hard rules (never break these)
1. Everything generated must come ONLY from the uploaded material. Every item has `sourceId` and `evidence`; the server checks that `evidence` really appears in that section (`src/lib/validate.ts`). "Explain simpler" also rejects new numbers and names (`newFactsIn`). Never remove these checks.
2. All Gemini calls happen on the server only (`src/lib/gemini.ts`, used by `src/app/api/*`). Never import it into a component.
3. Validate all JSON from Gemini before using it. If it fails, show a clear message and let the user retry.
4. The Gemini model name comes from `GEMINI_MODEL` (optional `GEMINI_FALLBACK_MODEL`). Never hard-code a model name. Check the installed SDK's TypeScript types before using SDK options.
5. **Supabase keys.** The browser may only use `SUPABASE_URL` and the PUBLISHABLE key (copied to `NEXT_PUBLIC_` names by `next.config.ts`). The SECRET key (`SUPABASE_SECRET_KEY`) is server-only and must never be put in a `NEXT_PUBLIC_` variable or sent to the browser; `next.config.ts` stops the build if a secret key is in the publishable variable. `sb_secret_...` goes only in the `apikey` header; add `Authorization: Bearer` only for old keys starting `eyJ`. `SUPABASE_URL` must be exactly `https://PROJECT-ID.supabase.co` (no path).
6. **Row level security stays ON** for every table. User data tables (`study_sets`, `study_set_texts`) must only allow `auth.uid() = user_id`. If you change a table, update `schema.sql` (safe to run twice) and the fake database in `scripts/mock-supabase.mjs`.
7. Database writes must be idempotent (upsert with a unique key or id) so running twice never double counts.
8. **Storage goes through `src/lib/store.ts`** (it picks cloud or local). Do not call Supabase tables or IndexedDB directly from components. All store functions are async. Saves run in order; the study set object can be changed in place while it is being built, so never skip a save just because the object is the same.
9. Routes that spend Gemini quota or write to the database must call `await checkAccess(req)` (`src/lib/server-auth.ts`): a valid sign-in token when accounts are on, `ACCESS_CODE` when accounts are off.
10. No random values (`Math.random`, `crypto.randomUUID`, `Date.now`, `new Date()` in output) while rendering. Create them in event handlers or `useEffect` (this prevents hydration errors). Use the `useNow()` hook for dates. Components that read saved data load it in `useEffect`.
11. Vercel limits: requests are about 4.5 MB and have time limits. PDFs are read in the browser (`src/lib/pdf-client.ts`) and never uploaded. Long generation runs in small batches with a progress bar (`src/lib/runner.ts`).
12. Plain CSS only (`src/app/globals.css`), no external font downloads. All colors are variables at the top of that file; dark mode only changes the variables, and the print block forces black on white. Keep it accessible (labels, keyboard use, visible focus, `aria-live` for status messages, reduced motion) and mobile friendly (the sidebar becomes a drawer under 62rem).
13. Typed answers are graded by `src/lib/grade.ts`. Change its rules only together with tests in `scripts/test-unit.ts`.
14. Do not add new npm packages unless I ask. Do not touch `.env.local` and never print secret values.

## Project map
| Path | What it does |
|---|---|
| `src/app/layout.tsx` | Root layout: theme script, `Providers`, `AppShell` |
| `src/components/AppShell.tsx` | The frame: sidebar (logo, navigation, Chats & tasks list), top bar (greeting, search, theme, profile). Redirects signed-out people to `/login`. `/login` and `/auth/callback` have no frame |
| `src/components/SetRow.tsx`, `SetsContext.tsx` | One saved module row (rename in place, delete menu) and the shared list of saved modules |
| `src/lib/auth.tsx` | `AuthProvider` and `useAuth()`: who is signed in; sets the store mode to cloud or local |
| `src/lib/supabase-browser.ts` | Browser Supabase client (publishable key only) |
| `src/lib/store.ts` | Picks `store-cloud.ts` (Supabase account) or `store-local.ts` (IndexedDB) |
| `src/app/page.tsx` | Home dashboard (stat cards, new module cards, continue studying, widgets) |
| `src/components/Widgets.tsx` | Stat card, study calendar, activity chart, daily-goal donut |
| `src/app/login/page.tsx`, `auth/callback/page.tsx` | Login (email, Google, forgot password) and the return page for Google and email links |
| `src/app/account/page.tsx` | Profile: name, sign-in methods, link Google, change password, delete all modules |
| `src/app/chats/page.tsx` | Chats & tasks: all saved modules grouped by date, search |
| `src/app/new/page.tsx` + `CreateForm.tsx` | New module: paste or upload, range, counts, generation with progress |
| `src/app/set/[id]/page.tsx` | One module with tabs (Reviewer, Flashcards, Quiz, Make more). All edits go through its `update()` function |
| `src/app/progress/page.tsx`, `settings/page.tsx`, `check/page.tsx` | Progress dashboard, settings (theme, daily goal, read aloud), Setup check |
| `src/app/api/generate`, `explain`, `report`, `access`, `health` | Server routes (Gemini batch, explain simpler, bad-question report, shared-code check, settings check with `?live=1` and `?models=1`) |
| `src/lib/types.ts`, `sections.ts`, `dashboard.ts`, `stats.ts`, `grade.ts` | Types, splitting and chapters, sidebar/calendar/chart helpers, streaks, answer grading |
| `src/lib/prompts.ts`, `gemini.ts`, `validate.ts` | Prompts, Gemini call and errors, JSON and evidence validation |
| `src/lib/server-auth.ts`, `supabase.ts`, `http.ts` | Who may call the API (token or code), Supabase server helpers, API helpers and rate limit |
| `src/lib/pdf-client.ts`, `runner.ts`, `activity.ts`, `prefs.ts`, `speech.ts`, `access.ts` | PDF reading in the browser, step-by-step generation, study days and daily count, small settings, read aloud, API headers |
| `src/lib/mock-gemini.ts` | Test-only fake Gemini (`GEMINI_MOCK`), never set on Vercel |
| `src/components/*` | Reviewer, Flashcards, Quiz, QuizPractice, QuizExam, Results, MakeMore, ExplainSimpler, ReadAloud, Logo, Icon, and more |
| `src/app/globals.css`, `src/app/icon.svg`, `public/studyit-logo.svg` | All styling (colors at the top, dark mode, print) and the logo files |
| `schema.sql` | Database setup pasted into the Supabase SQL Editor |
| `scripts/test-unit.ts`, `test-api.mjs`, `mock-supabase.mjs`, `mock-gemini-server.mjs` | Tests (`npm test`) and the fake Supabase and Gemini servers they use |

## Build phases
1. Done: reviewer outline, flashcards, practice quiz, exam mode, explain simpler, read aloud, print, dark mode, progress dashboard, in-browser PDF reading, accounts (email + Google), modules saved per account, Chats & tasks with rename, dashboard UI.
2. Original-file storage (Supabase Storage), Word and PowerPoint files, moving local modules into an account.
3. Leitner boxes, weak-topic tracking ("make more on my weak topics" using `focusTopics`, already supported by the API), Anki CSV export.
4. "Ask my module" chat limited to the uploaded file, exam-date study plan.

## Before you finish any change
- Run `npm run typecheck` and `npm run build` and tell me if they pass.
- Run `npm test` and tell me the result.
- List every file you changed with its full path.
- If you add an API route, add a test for it in `scripts/test-api.mjs`. If you change grading, stats, or helper logic, add a test in `scripts/test-unit.ts`. If you change the database, update `schema.sql` and `scripts/mock-supabase.mjs`.

## MY REQUEST
(Write what you want here. Example: "Make the Next button on the quiz green." Include the file name if you know it.)
