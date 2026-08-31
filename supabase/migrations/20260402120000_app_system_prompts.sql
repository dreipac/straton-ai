-- Konfigurierbare System-Prompts (Admin-UI); Lesen fuer alle angemeldeten Nutzer, Schreiben nur Superadmin

create table if not exists public.app_system_prompts (
  key text primary key,
  content text not null default '',
  updated_at timestamptz not null default now()
);

comment on table public.app_system_prompts is
  'Globale KI-Systemanweisungen; Inhalt leer = Frontend nutzt Code-Defaults.';

alter table public.app_system_prompts enable row level security;

-- Lesen: jede angemeldete Session (Chat/Lernen brauchen die Texte)
create policy "app_system_prompts_select_authenticated"
  on public.app_system_prompts
  for select
  to authenticated
  using (true);

-- Schreiben: nur Superadmin
create policy "app_system_prompts_insert_superadmin"
  on public.app_system_prompts
  for insert
  to authenticated
  with check (
    coalesce(
      (select p.is_superadmin from public.profiles p where p.id = (select auth.uid())),
      false
    ) = true
  );

create policy "app_system_prompts_update_superadmin"
  on public.app_system_prompts
  for update
  to authenticated
  using (
    coalesce(
      (select p.is_superadmin from public.profiles p where p.id = (select auth.uid())),
      false
    ) = true
  )
  with check (
    coalesce(
      (select p.is_superadmin from public.profiles p where p.id = (select auth.uid())),
      false
    ) = true
  );

create policy "app_system_prompts_delete_superadmin"
  on public.app_system_prompts
  for delete
  to authenticated
  using (
    coalesce(
      (select p.is_superadmin from public.profiles p where p.id = (select auth.uid())),
      false
    ) = true
  );
