-- ===========================================================================
-- Lernbereich — Neue Architektur, Schicht 7 (Orchestrator): Session-Zustand.
--
-- Persistiert je (User x Lernpfad) den aktiven Cursor der Session: aktuelles Thema, aktueller
-- Zwischenschritt, Phase und Position + Zeitpunkt der letzten Aktivitaet. Damit kann der Orchestrator
-- eine Session nach Reload/Geraetewechsel dort fortsetzen, wo sie unterbrochen wurde.
--
-- Anders als die learner_*-Tabellen (die ueber security-definer-RPCs geschrieben werden, weil sie
-- vorberechnete Modellzustaende halten) ist dies ein einfacher Nutzer-Cursor ohne Integritaets-Mathematik
-- → direkt vom Eigentuemer schreibbar via RLS "own rows".
-- ===========================================================================

create table if not exists public.learn_session_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  path_id uuid not null references public.learning_paths (id) on delete cascade,
  -- Ordinal des aktiven Themas (0-basiert), oder null wenn noch keine Auswahl.
  active_topic_ordinal integer check (active_topic_ordinal is null or active_topic_ordinal >= 0),
  -- Ordinal des aktiven Zwischenschritts innerhalb des Themas (0-basiert), oder null (Einstiegscheck-Ebene).
  active_step_ordinal integer check (active_step_ordinal is null or active_step_ordinal >= 0),
  -- Grobe Session-Phase (frei gehalten, damit App-Evolution die Migration nicht bricht).
  phase text not null default 'landing',
  -- Feinkoernige Position innerhalb eines Schritts (z. B. Karten-/Frage-Index).
  position integer not null default 0 check (position >= 0),
  last_activity_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, path_id)
);

create index if not exists learn_session_state_user_idx on public.learn_session_state (user_id);

alter table public.learn_session_state enable row level security;

drop policy if exists "learn_session_state_select_own" on public.learn_session_state;
create policy "learn_session_state_select_own"
  on public.learn_session_state for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "learn_session_state_insert_own" on public.learn_session_state;
create policy "learn_session_state_insert_own"
  on public.learn_session_state for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid())
  );

drop policy if exists "learn_session_state_update_own" on public.learn_session_state;
create policy "learn_session_state_update_own"
  on public.learn_session_state for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "learn_session_state_delete_own" on public.learn_session_state;
create policy "learn_session_state_delete_own"
  on public.learn_session_state for delete to authenticated
  using (user_id = auth.uid());
