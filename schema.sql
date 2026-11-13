-- StudyIt database setup. Paste this whole file into Supabase > SQL Editor > New query, then press Run.
-- It is safe to run more than once.

-- ========== PART 1: bad-question reports (written only by the server, with the secret key) ==========
create table if not exists public.bad_question_reports (
  id           uuid primary key default gen_random_uuid(),
  report_key   text not null unique,          -- same item reported twice = one row (idempotent)
  material_id  text,
  item_kind    text not null check (item_kind in ('question', 'flashcard', 'reviewer')),
  item_id      text not null,
  item_text    text,
  source_label text,
  reason       text,
  created_at   timestamptz not null default now()
);

-- Row level security ON with no policies: browsers (public or signed-in) can read and write nothing here.
-- Only the server, using the secret key, can touch this table.
alter table public.bad_question_reports enable row level security;
grant all on public.bad_question_reports to service_role;

-- ========== PART 2: each person's saved modules ("Chats & tasks") ==========
-- study_sets holds the title, counts, flashcards, questions, scores, and progress.
create table if not exists public.study_sets (
  id             uuid primary key,                                  -- made by the app, so saving twice never double counts
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title          text not null check (char_length(title) between 1 and 200),
  source_type    text not null default 'text' check (source_type in ('text', 'pdf', 'txt')),
  file_name      text,
  section_count  int  not null default 0,
  card_count     int  not null default 0,
  question_count int  not null default 0,
  data           jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- study_set_texts holds the long module text, kept apart so lists stay fast. Removed together with its module.
create table if not exists public.study_set_texts (
  set_id   uuid primary key references public.study_sets (id) on delete cascade,
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sections jsonb not null
);

create index if not exists study_sets_user_updated_idx on public.study_sets (user_id, updated_at desc);

-- Row level security: a signed-in person can only see and change their OWN rows.
alter table public.study_sets      enable row level security;
alter table public.study_set_texts enable row level security;

drop policy if exists "study_sets owner all" on public.study_sets;
create policy "study_sets owner all" on public.study_sets
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "study_set_texts owner all" on public.study_set_texts;
create policy "study_set_texts owner all" on public.study_set_texts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Table permissions. Signed-in people get access (limited by the policies above); signed-out visitors get none.
grant select, insert, update, delete on public.study_sets      to authenticated;
grant select, insert, update, delete on public.study_set_texts to authenticated;
revoke all on public.study_sets      from anon;
revoke all on public.study_set_texts from anon;
grant all on public.study_sets      to service_role;
grant all on public.study_set_texts to service_role;

-- Optional clean-up: earlier versions of this file prepared the tables "materials" and "quiz_attempts".
-- StudyIt does not use them. If they exist in your project and are empty, you may remove them:
--   drop table if exists public.quiz_attempts;
--   drop table if exists public.materials;
