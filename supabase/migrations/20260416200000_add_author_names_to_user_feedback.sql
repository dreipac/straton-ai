-- Snapshot Vorname/Nachname beim Feedback (wie author_email)

alter table public.user_feedback
  add column if not exists author_first_name text,
  add column if not exists author_last_name text;

comment on column public.user_feedback.author_first_name is 'Snapshot zum Absendezeitpunkt';
comment on column public.user_feedback.author_last_name is 'Snapshot zum Absendezeitpunkt';
