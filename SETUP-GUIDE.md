# StudyIt Setup Guide (from zero to live)

This guide assumes you have never deployed a website. Follow the parts in order. Where you see a box of commands, type or paste them exactly. Commands are shown for **Windows (PowerShell)** first, with **Mac** notes where they differ. Website dashboards (Supabase, Google, Vercel) sometimes rename buttons; if a label is slightly different, look for the closest one.

**Words you will see**
- **Terminal**: a window where you type commands. In VS Code it is the panel opened with `Terminal > New Terminal`.
- **Environment variable**: a setting (like a password) the app reads when it starts. We keep them in a file called `.env.local` so they are never put on GitHub.
- **Repository (repo)**: a project folder stored on GitHub.
- **Deploy**: put the app on the internet so other people can open it.
- **Account / login**: people sign in with email and password, or with Google. Their modules are saved to their own account.
- **Publishable key vs secret key**: the publishable key is made to be public (the browser needs it to sign people in). The **secret key must stay private**.

---

## Part 1. Install the tools

### 1.1 Install Node.js
1. Go to https://nodejs.org
2. Click the green button that says **LTS** (the stable version) and run the installer. Keep all default choices.
3. Close and reopen VS Code afterwards.
4. Check it worked: in a VS Code terminal run

```
node -v
npm -v
```
You should see version numbers. Node 22 or newer (24 is best) avoids warnings. If `npm install` later prints yellow "EBADENGINE" warnings, the app still works, but installing the newest LTS removes them.

### 1.2 Install Git
1. Go to https://git-scm.com/downloads and install it with the default choices.
2. Check: `git --version`
3. Tell Git who you are (use your own name and the email of your GitHub account):

```
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

---

## Part 2. Open the project in VS Code
1. Unzip `studyit.zip`. You get a folder named `studyit`. Move it somewhere easy, like `Documents`.
2. Open VS Code. Click **File > Open Folder...**, choose the `studyit` folder, then **Select Folder**. If VS Code asks "Do you trust the authors", click **Yes, I trust the authors**.
3. Open a terminal: **Terminal > New Terminal**. Make sure the path shown in the terminal ends with `studyit`.
4. Install the project's packages (this can take 1 to 3 minutes):

```
npm install
```
When it finishes you will see a new `node_modules` folder. You will also see a line "copy-pdf-worker: copied pdf.worker.min.mjs to public/". That is normal; it is the file the PDF reader needs.

---

## Part 3. Create `.env.local` (your private settings file)

**Important facts**
- The file `.env.local` is **not in the zip**. You must create it yourself by copying `.env.example`.
- Files that start with a dot can look hidden. In VS Code's Explorer (left side) you will still see `.env.example`.
- Write values with **no spaces** around `=` and **no quotes**.
- Every time you edit `.env.local`, **stop the app (Ctrl+C in the terminal) and run `npm run dev` again**. The app only reads the file when it starts.

Create the file:
- **Windows PowerShell**: `copy .env.example .env.local`
- **Mac / Linux**: `cp .env.example .env.local`

Click `.env.local` in the Explorer to open it. It looks like this:

```
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.7-flash
GEMINI_FALLBACK_MODEL=
GEMINI_THINKING=low
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
ACCESS_CODE=
```
You will fill these in during the next parts.

---

## Part 4. Get a Gemini API key and choose the model
(You may reuse the key from your Cyber Lab project.)

1. Go to https://aistudio.google.com/apikey and sign in with Google.
2. Click **Create API key** (or copy your existing key).
3. In `.env.local`, paste it after `GEMINI_API_KEY=` with nothing else around it, for example: `GEMINI_API_KEY=AIzaSy...`
4. **Model name.** Google renames models often. The file comes set to `gemini-3.7-flash`. Do not worry about getting it perfect now: in Part 7 the app has a **Setup check** page that tests your key for real and shows the exact model names your key can use. If the first one does not work, copy another name there into `GEMINI_MODEL=`. A "flash-lite" name is faster and uses less of your free quota.
5. `GEMINI_THINKING=low` keeps answers fast. Other choices: `minimal` (fastest), `medium`, `high`, `off`.
6. `GEMINI_FALLBACK_MODEL=` is optional. If you put a second model name there, the app tries it when the first model is missing or overloaded.
7. **Keep your Google project on the free tier** (do not turn on billing). Then the worst case is that you hit the daily free limit, never a bill.

---

## Part 5. Supabase: the database that saves each person's modules

### 5.1 Create or open a project
1. Go to https://supabase.com/dashboard and sign in. Use your existing project, or click **New project**, give it a name (for example `studyit`), set a database password (save it somewhere safe), choose a region near you, and click **Create new project**. Wait until it finishes setting up.

### 5.2 Run `schema.sql`
1. In VS Code, open `schema.sql` and press `Ctrl+A` then `Ctrl+C` to copy everything.
2. In Supabase, click **SQL Editor** in the left menu, then **New query**.
3. Paste (`Ctrl+V`) and click **Run**. You should see "Success. No rows returned". It is safe to run again.
4. Check: click **Table Editor**. You should see `study_sets`, `study_set_texts`, and `bad_question_reports`. (If you ran an older `schema.sql`, you may also see empty tables named `materials` and `quiz_attempts`. StudyIt does not use them; you may delete them.)

What this does: every person's modules go into `study_sets` (and the long module text into `study_set_texts`). **Row level security** is switched on, which means the database itself only lets a signed-in person see and change their **own** rows.

### 5.3 Copy the URL and the two keys
1. **URL**: open **Project Settings** (gear icon) and look for **Data API** or **API** (the project URL is also at the top of the **Connect** dialog). It must look **exactly** like:

```
https://abcdefghijklmnop.supabase.co
```
No `/rest/v1`, no slash at the end. A wrong URL causes a `405` error.

2. **Keys**: open **Project Settings > API Keys**.
   - The **Publishable key** starts with `sb_publishable_`. If your project only shows older keys, use the one named `anon`.
   - The **Secret key** starts with `sb_secret_` (create one with **New secret key** if there is none). If you only see older keys, use `service_role`.
3. In `.env.local`:

```
SUPABASE_URL=https://abcdefghijklmnop.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxx
SUPABASE_SECRET_KEY=sb_secret_xxxxxxxxxxxx
```
**Never swap the two keys.** If you paste a secret key into `SUPABASE_PUBLISHABLE_KEY`, StudyIt refuses to start and tells you why, because that key would otherwise be sent to every visitor's browser. Never share the secret key or post it in chat.

When both `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are filled in, **login is switched on**: people must sign in, and every Gemini request needs a valid sign-in. If you leave them empty, StudyIt still works without accounts (modules are saved only in that browser), which is handy for a quick local test.

---

## Part 6. Switch on the sign-in methods

### 6.1 Email and password
1. In Supabase, open **Authentication** and find **Sign In / Providers** (older versions say **Providers**). Make sure **Email** is enabled.
2. **Confirm email.** With "Confirm email" ON, new people must click a link in an email before they can sign in. That is safer, but Supabase's built-in email sender only allows a few emails per hour, which is fine for testing but not for a class. Choices:
   - Keep it ON for a small group, or set up your own email sender later in Supabase (Authentication > SMTP settings).
   - Turn it OFF while you test on your own. People then get in right after signing up.
3. **URL Configuration.** In **Authentication > URL Configuration**:
   - **Site URL**: `http://localhost:3000` while testing on your computer. After you deploy (Part 10), change it to your Vercel address, for example `https://studyit.vercel.app`.
   - **Redirect URLs**: add both `http://localhost:3000/**` and (after deploying) `https://YOUR-SITE.vercel.app/**`. Without this, links in emails and the Google sign-in cannot return to your site.

### 6.2 Google sign-in ("Continue with Google")
This lets people use their Gmail account. It takes about 10 minutes and is done once.

1. In Supabase open **Authentication > Sign In / Providers > Google**. Do not enable it yet. Copy the **Callback URL (for OAuth)** shown there. It looks like `https://abcdefghijklmnop.supabase.co/auth/v1/callback`.
2. Go to https://console.cloud.google.com and sign in with your Google account. At the top, click the project picker and choose **New project**. Name it `StudyIt` and create it.
3. Open the menu **APIs & Services > OAuth consent screen** (in newer versions it is called **Google Auth Platform**) and click **Get started** or **Configure**:
   - App name: `StudyIt`. User support email: your email.
   - Audience / user type: **External**.
   - Contact email: your email. Agree and create.
   - While the app is in **Testing**, only people you add under **Test users** can sign in with Google. Add your own Gmail and your classmates' Gmail addresses. To let **anyone** sign in, click **Publish app** (Google asks for no review for the basic email and profile information StudyIt uses).
4. Open **Credentials > Create credentials > OAuth client ID**:
   - Application type: **Web application**. Name: `StudyIt`.
   - Under **Authorized redirect URIs** click **Add URI** and paste the Supabase Callback URL from step 1.
   - Click **Create**. Copy the **Client ID** and **Client secret**.
5. Back in Supabase, on **Google**: turn it **On**, paste the Client ID and Client secret, and **Save**.

**How accounts join together.** If someone first signed up with email (for example `ana@gmail.com`) and later clicks **Continue with Google** with the same Gmail address, Supabase joins them into **one** account, so their modules are still there. On the **Profile** page there is also a **Link my Google account** button. That button only works if you turn on **Allow manual linking** in Supabase (Authentication > Settings). The automatic same-email joining always works.

---

## Part 7. Run it on your computer and test everything

1. In the terminal (path ends with `studyit`):

```
npm run dev
```
2. Wait for "Ready", then open http://localhost:3000 in your browser. If you filled in the Supabase lines, you will see the **login page**.
3. **Create an account** (or press **Continue with Google**). If email confirmation is ON, open the email, click the link, then sign in.
4. **Run the Setup check.** Click **Setup check** in the left menu (or open http://localhost:3000/check).
   - **Quick check (free)** shows your settings, whether sign-in and Google are switched on, and whether the database tables were found.
   - **Test Gemini now (1 small request)** sends one tiny real request to Google. You should see "Real Gemini answered in ... seconds" and a list of model names your key can use. **This is the most important test of the whole project.**
   - If it fails, read the message (for example "model not found"), copy a name from the list into `GEMINI_MODEL=` in `.env.local`, press `Ctrl+C`, run `npm run dev`, and test again.
5. **Add your first module**: click **New module**, upload a PDF (it is read inside your browser, no size limit) or paste text, choose how many flashcards and questions you want, and press **Make my study set**. It appears in the left menu under **Chats & tasks**.
6. To stop the app press `Ctrl+C` in the terminal.

**Optional automatic checks** (these use a fake Gemini and fake Supabase, so they cost nothing and need no keys):

```
npm run typecheck
npm run build
npm test
```
`npm test` prints how many checks passed. It should say 0 failed at the end of both parts.

---

## Part 8. If you do NOT use accounts: the shared access code
Skip this part if you did Part 5 and Part 6. With accounts, signing in already protects your Gemini key, and `ACCESS_CODE` is ignored.

Without accounts, anyone who opens your site can use **your** Gemini quota. To prevent that, put a code (8 or more characters, like `purple-tiger-notes`) after `ACCESS_CODE=` in `.env.local`, restart, and give the code only to people you trust. They type it once on the **New module** page. The Setup check tells you whether the code is ON or OFF.

---

## Part 9. Push to GitHub (with a safety check)

### 9.1 Make sure your secrets will NOT be uploaded
Run these two commands. The second must print a line that mentions `.gitignore`.

```
git init
git check-ignore -v .env.local
```
If it prints something like `.gitignore:...:.env.local   .env.local`, you are safe. If it prints nothing, STOP and open `.gitignore` to make sure it contains the line `.env.local`.

### 9.2 Create an empty repo on GitHub
1. Go to https://github.com/new while signed in as `kemjana`.
2. Repository name: `studyit`. Choose **Public** (recruiters can see it) or **Private**.
3. **Do not** tick "Add a README", ".gitignore", or "license". Click **Create repository**.

### 9.3 Commit and push

```
git add .
git status
```
Read the list. **`.env.local` must NOT appear.** (`.env.example` is fine and should appear.) Then:

```
git commit -m "StudyIt"
git branch -M main
git remote add origin https://github.com/kemjana/studyit.git
git push -u origin main
```
If a window asks you to sign in to GitHub, sign in and allow it.

### 9.4 Final safety check on GitHub
Open https://github.com/kemjana/studyit and look at the file list. There must be **no** `.env.local` file. If you ever see one, delete the repo, **create new keys** in Gemini and Supabase (the old ones are now unsafe), and start again.

---

## Part 10. Deploy to Vercel
1. Go to https://vercel.com/new and sign in with GitHub.
2. Find `kemjana/studyit` and click **Import**. (If it is not listed, click **Adjust GitHub App Permissions** and allow the repo.)
3. Leave **Framework Preset** as **Next.js**.
4. Open **Environment Variables** and add these one by one (name, then value, then **Add**). Same values as `.env.local`, again with no quotes:
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL`
   - `GEMINI_FALLBACK_MODEL` (only if you filled it in)
   - `GEMINI_THINKING`
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `ACCESS_CODE` (only if you are not using accounts)

   Do **not** add `GEMINI_MOCK`, `GEMINI_BASE_URL`, `SUPABASE_ALLOW_LOCAL`, or `NEXT_DIST_DIR` (those are for the automated tests only).
5. Click **Deploy** and wait about 1 to 2 minutes. When you see the confetti, click the preview image to open your live site. Copy its address (for example `https://studyit-abc123.vercel.app`).
6. **Tell Supabase about your live address** (this step is easy to forget, and sign-in will not work without it): in Supabase open **Authentication > URL Configuration**, set **Site URL** to your live address, and add `https://YOUR-SITE.vercel.app/**` to **Redirect URLs** (keep the `http://localhost:3000/**` one too). Google needs nothing extra, because it only talks to Supabase.
7. Open `https://YOUR-SITE.vercel.app/check` after signing in and run **Test Gemini now** again on the live site.

### Updating the live site later
**After you change code**
```
git add .
git status
git commit -m "describe your change"
git push
```
Vercel redeploys by itself within a minute.

**After you change an environment variable in Vercel** (Project > **Settings > Environment Variables**): the running site does NOT pick it up until you redeploy. Go to **Deployments**, click the three dots next to the latest deployment, click **Redeploy**, and confirm. (Changes to `SUPABASE_URL` or `SUPABASE_PUBLISHABLE_KEY` always need this, because the browser copy is made when the site is built.)

---

## Part 11. A quick tour of what you can do

- **Home**: your totals, quick buttons to add a module, your recent modules, a study calendar, your monthly activity, your daily goal ring, and your streak.
- **Chats & tasks** (left menu): every module you add is saved here, newest first, grouped by date. Hover a module and press the **...** button to **Rename** (type, then Enter) or **Delete**. You can also rename from the module's own page with the pencil next to its title. The search box at the top filters by name.
- **Inside a module**: Reviewer (chapter outline, read aloud, print, explain simpler), Flashcards, Quiz (Practice or timed Exam), and Make more.
- **Progress**: your day streak, scores over time, and your weakest topics.
- **Profile**: your name, how you sign in (email and Google), change password, and **Delete all my modules**.
- **Settings**: theme (Auto, Light, Dark), daily goal, and reading voice and speed. The moon/sun button in the top bar switches theme quickly.

---

## Part 12. Using Copilot for small edits
Open `COPILOT-PROMPT.md`, copy everything under the line, paste it into Copilot Chat, and write your change after **MY REQUEST**. After any change, run `npm run typecheck`, `npm run build`, and `npm test` before you push.

---

## Troubleshooting

| What you see | Likely cause | Fix |
|---|---|---|
| `npm` or `node` "is not recognized" | Node not installed, or VS Code was open during install | Install Node LTS, then close and reopen VS Code |
| Yellow "EBADENGINE" warnings during `npm install` | Your Node is older than the newest LTS | Harmless. Install the newest Node LTS to remove them |
| App refuses to start with "SUPABASE_PUBLISHABLE_KEY contains a SECRET key" | The secret key was pasted on the publishable line | Put the `sb_publishable_` key there and the `sb_secret_` key only in `SUPABASE_SECRET_KEY` |
| Setup check says Gemini key is missing | `.env.local` missing, in the wrong folder, or app not restarted | The file must be in the `studyit` folder (next to `package.json`). Save it, press `Ctrl+C`, run `npm run dev` again |
| Changes to `.env.local` do nothing | App reads it only at start | Stop with `Ctrl+C` and run `npm run dev` again |
| "Gemini rejected the API key" | Key typo, extra space, or quotes | Re-copy the key; no quotes, no spaces; restart |
| "Gemini could not find the model" | Model name changed or is not available to your key | Open `/check`, press **Test Gemini now**, copy a name from the list into `GEMINI_MODEL`; restart or redeploy |
| "going too fast or used up today's free quota" (429) | Free tier limits | Wait a minute and press **Retry from where it stopped**; ask for fewer items or use a smaller page range |
| Gemini is slow or "busy" | Big model or heavy load | Set `GEMINI_THINKING=minimal` and/or choose a "lite" model |
| "could not be matched to your material" | The AI quoted things that are not in your text, so the app rejected them | Press Retry; try a smaller page range |
| Login page says "Accounts are not set up yet" | `SUPABASE_URL` or `SUPABASE_PUBLISHABLE_KEY` is empty (or the site was built before you added them) | Fill both, restart `npm run dev` (or Redeploy on Vercel) |
| "Wrong email or password" | Typo, or the account was made with Google | Retry, use **Forgot password?**, or press **Continue with Google** |
| "Please confirm your email first" | Email confirmation is ON and the link was not clicked | Open the email and click the link, or press **Send the confirmation email again** |
| "Too many emails were sent just now" | Supabase's built-in email sender has a low hourly limit | Wait, turn off **Confirm email** while testing, or add your own SMTP in Supabase |
| "Google sign-in is not switched on yet" | Google is not enabled in Supabase | Part 6.2 step 5 |
| Google says `redirect_uri_mismatch` | The Supabase Callback URL is missing or mistyped in Google Cloud | Part 6.2 steps 1 and 4: paste the exact Callback URL into **Authorized redirect URIs** |
| Google says "Access blocked" or "app not verified" for a classmate | The app is in Testing mode and they are not a test user | Add their Gmail as a **Test user**, or **Publish app** |
| After Google or email-link sign-in the page stays on "Finishing sign-in..." or says the link did not work | Your site address is missing from Redirect URLs, or the link was opened on another device | Part 6.1 step 3 and Part 10 step 6; open the link in the same browser you started from |
| "Link my Google account" says linking is switched off | Manual linking is off in Supabase | Turn on **Allow manual linking**, or sign in with Google using the same email (joins automatically) |
| "Your Supabase database is missing the StudyIt tables" | `schema.sql` was not run | Run it in SQL Editor (Part 5.2) |
| "Supabase refused to save this" | `schema.sql` was only partly run, or you are signed out | Run all of `schema.sql` again; sign in again |
| "This module is too big to save to your account" | Very large module text | Use a smaller page range (about 40 pages per module works well) |
| "Please sign in to use StudyIt" | Your sign-in expired or you are signed out | Sign in again |
| Setup check shows Supabase problem with "no path" | `SUPABASE_URL` has `/rest/v1` or a slash at the end | Use exactly `https://PROJECT-ID.supabase.co` |
| Supabase `405` error | Wrong URL (path added, or wrong project id) | Copy it again from the Supabase dashboard |
| Supabase `401` or "Invalid API key" | Wrong or mistyped key, or quotes around it | Copy the key again; no quotes; restart/redeploy |
| I signed in on Vercel but my modules are missing locally (or the other way round) | Each website address keeps its own sign-in | Sign in on both; the same account shows the same modules |
| My modules from before accounts are not in my account | Modules made while accounts were off live only in that browser | Make them again while signed in (only the account's modules are saved online) |
| Where is my old module? Study set "not found" | It belongs to a different account, or was deleted | Sign in with the account you made it with |
| PDF says "could not be read" or the page stays on "Reading..." | The PDF reader file is missing from `public/` | Run `node scripts/copy-pdf-worker.mjs` (or `npm install`), restart `npm run dev`, and hard-refresh (`Ctrl+Shift+R`) |
| PDF says "No readable text was found" | Scanned PDF (pictures of pages) | Use a PDF where you can select text, or paste the text |
| PDF says "password-protected" | The PDF has a password | Remove the password in a PDF viewer, then try again |
| "Word and PowerPoint files are coming" | Only PDF/TXT/pasted text work now | Save the file as PDF |
| "Read aloud" buttons are missing | Your browser has no speech voices | Use Chrome, Edge, or Safari |
| Exam timer ran out and handed in by itself | That is how Exam mode works | Choose a longer time limit, or use Practice mode |
| Progress or the calendar looks empty | No quiz, exam, or flashcard finished yet | Finish one; it appears straight away. Flashcard-only days are remembered per device |
| Renamed a module but the old name came back | An old page was open | Reload; renaming saves to your account right away |
| `.env.local` shows in `git status` | `.gitignore` is missing the line | Add `.env.local` to `.gitignore`, run `git rm --cached .env.local`, and **create new keys** if it was ever pushed |
| `port 3000 is already in use` | Another app is running | Close the other terminal, or run `npm run dev -- -p 3001` (then add that address in Supabase Redirect URLs) |
| Vercel build fails | Missing package, typo, or a key on the wrong line | Run `npm run build` locally; fix what it shows; push again |
| Site works locally but not on Vercel | Variables not added in Vercel, or not redeployed | Add them in Vercel settings and **Redeploy** |
| Blank page or odd text after a code change | Old cached build | Stop the app, delete the `.next` folder, run `npm run dev` |
