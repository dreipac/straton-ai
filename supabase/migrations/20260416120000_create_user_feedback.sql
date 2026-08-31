-- Nutzer-Feedback: einreichen durch angemeldete Nutzer; lesen nur Superadmin

create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  author_email text,
  created_at timestamptz not null default now(),
  constraint user_feedback_body_len check (
    char_length(trim(body)) >= 1
    and char_length(body) <= 8000
  )
);

comment on table public.user_feedback is
  'Freitext-Feedback von Nutzern; author_email ist Snapshot zum Zeitpunkt des Absendens.';

create index if not exists user_feedback_created_at_idx on public.user_feedback (created_at desc);

alter table public.user_feedback enable row level security;

create policy "user_feedback_insert_own"
  on public.user_feedback
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "user_feedback_select_superadmin"
  on public.user_feedback
  for select
  to authenticated
  using (
    coalesce(
      (select p.is_superadmin from public.profiles p where p.id = (select auth.uid())),
      false
    ) = true
  );
