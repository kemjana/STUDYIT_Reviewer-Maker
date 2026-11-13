# StudyIt

**Got a huge PDF module? Just StudyIt.**

StudyIt is a web app that turns a student's own module (PDF, TXT, or pasted text) into a **chapter-by-chapter reviewer**, **flashcards**, and **quizzes** (multiple choice, true/false, identification, fill-in-the-blank) using Google Gemini. Every item shows the page or section it came from, and the student chooses how many items to make. Students sign in with email or Google, and every module is **saved to their own account**.

Built with Next.js (App Router), TypeScript, plain CSS, the `@google/genai` SDK, `pdf.js`, Supabase (Auth + Postgres with row level security), and Vercel.

## Features

**Accounts and saved modules**
- Login page with **email + password** (create account, forgot password) and **Continue with Google**. Email and Google accounts with the same address join into one account; a Profile page shows how you sign in and can link Google.
- Every module is saved to the signed-in person's account (Supabase) and is private to them (row level security).
- **Chats & tasks**: a sidebar list and a full page of saved modules, newest first and grouped by date (Today, Yesterday, Previous 7 days, Older), like a chat list. **Rename** in place (sidebar menu, list page, or the module page), **delete**, and search by name.
- Without Supabase keys the app still works in "local mode" (modules saved in the browser with IndexedDB), which is handy for trying it out.

**Dashboard UI** (light and dark)
- Sidebar with the StudyIt logo, navigation, and recent modules; top bar with greeting, search, theme button, and profile.
- Home dashboard: total cards, "New module" cards, Continue studying, monthly activity chart, study calendar, daily-goal ring, and day streak. Fully responsive (the sidebar becomes a drawer on phones).
- Custom **StudyIt logo** (page with a highlighter stripe) used in the app, the login page, the browser tab icon, and `public/studyit-logo.svg`.

**Make study material**
- Paste text, or open a PDF/TXT file. PDFs are read **inside the browser**, so there is no upload and no file-size limit (tested with a 5 MB, 300-page PDF). Pick a page range for a big module.
- Choose how many flashcards and quiz questions you want (Auto, a preset, or any number from 1 to 100) and which question types.
- Reviewer arranged as a **chapter-by-chapter outline**, in module order, under the chapter headings found in the module.
- Every card, question, and topic has a highlighted **source** (page or section) with the exact quote one click away.
- "Make more" adds items later without repeating what already exists.

**Study**
- Flashcards: flip, "I know this / Study again", shuffle, keyboard arrows, filter.
- **Practice quiz** with instant feedback, and **Exam mode**: timed, no answers or explanations until hand-in, question navigator, flags, automatic hand-in at time-up, full review.
- **Smarter typed-answer grading**: ignores capitals, punctuation, accents, "a/the", plurals, small typos in longer words, and one harmless extra word; still rejects different numbers, "not", look-alike short words, and missing words.
- **Explain simpler**: rewords an item using only its source section; rejects added numbers or names.
- **Read aloud** with the browser's free voices; **printable reviewer** (clean black on white); **progress dashboard** (streak, scores over time, weak topics).
- Report a bad question or card; reports are saved in the browser and sent to Supabase.

## How it keeps answers inside the material
1. The prompt tells Gemini to use only the supplied text and to treat the text as data, not instructions.
2. Every generated item must cite a section id and include a short **exact quote** from that section.
3. The server checks the quote against the real text (ignoring case, spacing, and punctuation). Items that fail are dropped. If nothing survives, the student gets a clear message and a Retry button.
4. All JSON from Gemini is parsed and shape-checked before use.
5. "Explain simpler" additionally rejects any number or capitalised name that is not in the material.

## Security design
- **Row level security.** `study_sets` and `study_set_texts` allow a signed-in person to read and change only rows where `user_id` is their own id. Signed-out visitors have no access. `schema.sql` also revokes the public role's access and grants only what is needed.
- **Publishable vs secret keys.** The browser only ever gets the URL and the **publishable** key (made to be public). The **secret** key is used only on the server (reports and the Setup check). The build **refuses to start** if a secret key (`sb_secret_...` or a `service_role` key) is placed in the publishable-key variable, so it can never be sent to browsers by mistake.
- **Your Gemini key is protected by sign-in.** When accounts are on, every route that spends Gemini quota or writes to the database needs a valid sign-in token, which the server verifies with Supabase (good answers are cached for a minute). A visitor who is not signed in cannot use your key. (When accounts are off, an optional shared `ACCESS_CODE` is used instead, compared in constant time and with a rate-limited check route.)
- Gemini calls run **only on the server**. The Gemini key never reaches the browser.
- `sb_secret_` keys go only in the `apikey` header; a `Bearer` header is added only for old JWT-style keys. `SUPABASE_URL` is validated (exactly `https://PROJECT-ID.supabase.co`, no path) with a clear message when wrong.
- Uploaded files stay private: PDFs and TXT files are read in the browser and never uploaded. Only the text of the batch being processed goes to Gemini. Nothing is logged on the server.
- Writes are idempotent (upsert by id or unique key), so repeating a request never double counts. Saves to the account run in order and quick repeats are merged.
- Request checks: size limits, type checks, and a per-route best-effort rate limit. Production errors hide internal details.
- `.env.local` is in `.gitignore`.

## Built for Vercel's limits
Requests are limited to about 4.5 MB and have time limits. PDFs never go through the server, and generation runs as many small requests with a progress bar, automatic retries, and a "retry from where it stopped" button. An optional `GEMINI_FALLBACK_MODEL` covers a missing or overloaded model.

## Testing (all automated, all included)
```bash
npm run typecheck
npm run build
npm test            # 75 unit tests + 89 API tests
```
- **Unit tests**: grading, streaks and scores (month change, daylight saving), chapter detection, batching, answer validation, explain-simpler fact checks, speech splitting, chat-list date grouping, calendar grids, activity totals, and the build guard against a secret key in the publishable variable.
- **API tests** (against the built app): validation, bad or invented Gemini output, rate limits, missing settings, sign-in token protection (no token, fake token, real token, old shared code no longer bypasses login), a wrong Supabase URL, a publishable key in the secret slot, idempotent saves, and the **real `@google/genai` SDK against a fake Gemini server** (exact request, 404/429/503/invalid-key errors, retries, fallback model).
- A real-browser run (Playwright, Chromium, not shipped) with accounts off (about 65 checks: dashboard, sidebar, rename and delete, exam timing with a fake clock, dark mode, print, read aloud, 300-page PDF, access code, mobile drawer) and with accounts on against a fake Supabase (54 checks: sign-up, email confirmation, wrong password, sign-in, saving to the account, rename in three places, a second user who cannot see or overwrite the first user's modules, sign-out protection, Google sign-in, linking by same email, adding a password, forgot password, delete all).

**Honest note:** the tests could not reach Google or a real Supabase project. Real Gemini is checked by you with the built-in **Setup check** page (`/check`), and the real Supabase sign-in and Google flow by following Part 6 of the setup guide. The Setup check also reports whether Google and email sign-in are switched on and whether all tables exist.

## Limitations
- PDFs must contain selectable text; scanned pictures need OCR (not included). Up to 2,500 pages and about 6 million characters per PDF; work on one part at a time for big modules. Very large modules may be too big to save to an account; use a page range.
- Only the extracted module text is saved, not the original PDF file.
- Reading PDFs needs a reasonably recent browser. Word and PowerPoint files are not supported yet.
- Modules made while accounts were off stay in that browser and are not moved into an account.
- The streak and daily goal for flashcard-only days are remembered per device; quiz and exam days come from the account.
- Closing the tab in the same instant a save starts can lose that last change (the app saves as you go).
- Linking Google from the Profile page needs "Allow manual linking" in Supabase; joining by same email always works. Closing an account completely is done by the site owner in Supabase.
- Read aloud depends on the voices installed on the device. "Explain simpler" is checked for quotes, numbers, and names, but a rewording can still be imperfect.
- The rate limiter is per server instance. AI can still make mistakes inside the material; the source quote and report button exist for that.
- The free Gemini tier and Supabase's built-in email sender have limits.

## Roadmap
1. Accounts, saved modules, dashboard UI, and study tools (this release)
2. Store the original file in Supabase Storage; Word and PowerPoint files; move local modules into an account
3. Leitner boxes, "make more on my weak topics" (the API already accepts `focusTopics`), Anki CSV export
4. "Ask my module" chat limited to the uploaded file (the "Chats & tasks" list is ready for it), exam-date study plan

## Setup
Full beginner steps are in [SETUP-GUIDE.md](./SETUP-GUIDE.md). Short version:

```bash
npm install
cp .env.example .env.local     # then fill in the values (no quotes, no spaces)
npm run dev                    # open http://localhost:3000, sign in, then open /check
```

Environment variables: `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` (optional), `GEMINI_THINKING`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `ACCESS_CODE` (only when accounts are off). Run `schema.sql` in the Supabase SQL Editor first.

## Project map
See [COPILOT-PROMPT.md](./COPILOT-PROMPT.md) for the file-by-file map and the rules used when editing with GitHub Copilot.
