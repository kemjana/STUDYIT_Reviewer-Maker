# StudyIt - Source-Cited AI Reviewer, Flashcard & Exam Maker

**Live demo:** [https://studyit-reviewer-maker.vercel.app](https://studyit-reviewer-maker.vercel.app)
<img width="1917" height="923" alt="image" src="https://github.com/user-attachments/assets/f34dfec2-5ebd-4ebc-808c-eddca98b9925" />
<img width="1917" height="923" alt="image" src="https://github.com/user-attachments/assets/2dfd0625-20ac-49a3-8a6d-3a350f68c95b" />
<img width="1917" height="923" alt="image" src="https://github.com/user-attachments/assets/fd1b5687-deed-4c8f-a6f7-8fc3eb813961" />
Studying from a long PDF module is slow. StudyIt takes a student's own learning material (a PDF, a TXT file, or pasted text) and uses Google Gemini to turn it into a **chapter-by-chapter reviewer, flashcards, and quizzes** (multiple choice, true/false, identification, fill-in-the-blank). The student chooses how many items to make.

The key rule is that **everything comes only from the uploaded material**. Every card and question shows the page or section it came from, with the exact quote one click away. Students sign in, and every module is saved to their own account.

## About this project (please read)

**StudyIt is a learning project.** I built it to explore how to design, secure and deploy a full-stack app with Next.js, Supabase and the Gemini API. It is not a production service.

### Known limitations of the live demo
- **Free tiers.** The demo runs on free plans (Vercel, Supabase, Google Gemini). These have usage limits, so the demo may be slow, rate-limited, or temporarily unavailable.
- **Paused database.** Supabase pauses free projects after about a week of low activity. If the demo does not load or fails to sign in, the database may be paused.
- **AI limits.** Gemini has per-minute and daily request limits. When they are reached, AI features (generating reviewers, flashcards, quizzes, or "Explain simpler") show an error or wait until the quota resets.
- **Not built for many users.** I added request size limits and per-route rate limits, but I have not load-tested the app. It is meant for one person or a few testers at a time.
- **AI can be wrong.** Even with exact-quote verification, feedback and generated items come from a language model and can be inaccurate. Treat it as practice, not as an official assessment.
- **No sensitive data.** Please do not upload confidential files, real passwords, personal data or private company documents.

### If the demo is not working
You can run the whole project yourself with your own free Supabase and Gemini accounts. Setup steps are in **Run locally** below.

### What I would change for real production use
Paid hosting and database plans, OCR support for scanned PDFs, background jobs for large textbooks, CAPTCHA and stronger abuse protection, load testing, and self-service account deletion.

## Features

### Accounts and saved modules
- **Sign in** with email and password or **Continue with Google**. Forgot-password is included.
- **Private workspaces**: every module is saved to the signed-in student's account and is private to them.
- **Chats & tasks sidebar and page**: saved modules are listed newest first and grouped by date. Each one can be renamed or deleted, and searched by name.
- **Profile page**: change name or password, see how you sign in, and link Google.

### Making study material
- **Paste text, or open a PDF/TXT file.** PDFs are read inside the browser, so nothing is uploaded and there is no file-size limit.
- **Custom generation**: choose how many flashcards and questions you want and which question types. Pick a page range for big modules.
- **Chapter-by-chapter reviewer**: an outline with topics, summaries, and key terms.
- **Source proof**: every item has a highlighted source (page or section) and the exact quote it came from.
- **"Make more"**: adds new items without repeating existing ones.

### Studying
- **Flashcards**: flip mode, "I know this / Study again", shuffle, and keyboard arrows.
- **Practice quiz**: instant feedback, explanations, and sources.
- **Exam mode**: timed, with no answers until you hand in. You can jump between questions and flag them, and it hands in automatically when time runs out.
- **Smarter typed-answer grading**: tolerates capitals, `"a/the"`, plurals, and small typos, but still rejects wrong numbers and `"not"`.
- **Explain simpler**: rewords an item using only its source section.
- **Read aloud** with free browser voices, and a **printable reviewer**.
- **Progress dashboard**: day streak, study calendar, monthly activity, scores over time, weak topics, and a daily goal.
- **Also**: Light and dark mode, a responsive layout that works on phones, and a "report a bad question" button.

## Security design
- **Row level security.** Each student's rows in the database can only be read or changed by that student. Signed-out visitors can access nothing.
- **Publishable vs secret keys.** The browser only gets the Supabase URL and the publishable key. The secret key stays on the server. The build refuses to start if a secret key is pasted where the publishable key belongs.
- **Server-only Gemini calls.** The Gemini API key is never in the browser. All Gemini calls run on the server, and every call requires a valid sign-in that the server checks with Supabase. A visitor who isn't signed in cannot use the key.
- **Answers stay inside the material.** Gemini must cite a section and copy an exact quote. The server checks the quote against the real text and drops any item that fails. All AI output is validated before use.
- **"Explain simpler" is checked** and rejects any number or name that isn't in the material.
- **Private files.** PDFs are read in the browser and never uploaded. Only the text of the batch being processed is sent to the server.
- **Safe repeats & abuse protection.** Saves are upserts, so repeating a request never double counts. Includes request size limits, a per-route rate limit, and production error messages that hide internal details.
- **Secrets management.** Secrets live in `.env.local`, which is listed in `.gitignore` and never committed.

## Limitations (honest)
- **PDFs must contain selectable text.** Scanned PDFs need OCR, which isn't included yet. Very large modules should be split into page ranges.
- **Only the extracted module text is saved**, not the original PDF file.
- **Word and PowerPoint files** aren't supported yet.
- **AI can still make mistakes** inside the material, which is why sources and the report button exist.
- **Free tier limits.** The free Gemini tier and Supabase's built-in email sender have usage limits.
- **Read aloud** depends on the voices installed on the student's device.
- **Closing an account completely** is done by the site owner in Supabase.

## Run locally
1. Install Node.js (LTS), Git, and create a Gemini API key and a free Supabase project.
2. Clone and install:
   ```bash
   git clone [https://github.com/kemjana/studyit.git](https://github.com/kemjana/studyit.git)
   cd studyit
   npm install

```

3. Create the database tables: in Supabase, open SQL Editor, paste all of `schema.sql`, and press **Run**.
4. Copy `.env.example` to `.env.local` and fill it in with no spaces and no quotes (never commit `.env.local`):
```env
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-3.7-flash
SUPABASE_URL=[https://PROJECT-ID.supabase.co](https://PROJECT-ID.supabase.co)
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...

```


5. Turn on sign-in: in Supabase, enable **Email**. To use Google, enable **Google** and add its Client ID and secret. Under **Authentication > URL Configuration**, add `http://localhost:3000/**` to the Redirect URLs.
6. Start the app: `npm run dev`
7. Open `http://localhost:3000`, sign in, then open Setup check (`/check`) and press **Test Gemini now** to confirm your key and model work.
8. *(Optional, no keys needed)* Run the tests: `npm run typecheck`, `npm run build`, `npm test`.

Restart `npm run dev` whenever you edit `.env.local`. For deployment on Vercel, add the same variables in the Vercel project settings and redeploy after changing them.

## Stack

Next.js (App Router), TypeScript, plain CSS, Google Gemini (`@google/genai`), `pdf.js`, Supabase (Auth and Postgres), Vercel.

```

```

*Disclaimer: For educational and personal study purposes only. Do not upload confidential or sensitive documents. Built with Next.js, Supabase, and Google Gemini.*
