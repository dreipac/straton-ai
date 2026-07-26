-- ============================================================================
-- Lernbereich Neu-Architektur — Phase 0: Fundament des Konzept-Netzes + Lerner-Modells
--
-- Fuehrt das normalisierte relationale Kernmodell ein (Clean Break; loest langfristig den grossen
-- learning_paths-JSONB-Blob ab). Diese Migration legt NUR die Tabellen + atomaren Upsert-RPCs an;
-- verdrahtet wird spaeter (Phase 1 Ingestion, Phase 3 Lerner-Modell).
--
-- Designprinzip: Die deterministische Intelligenz (BKT, Verfall, Scoring) rechnet clientseitig in
-- reinen TS-Modulen. Die RPCs sind reine, idempotenz-freundliche Batch-Upserts der bereits
-- berechneten Zustaende (Muster: learn_gamification_record_event) — security definer + auth.uid()-Guard.
--
-- Tabellen:
--   learn_concepts          — atomare Wissenseinheiten pro Pfad (Name, Schwierigkeit, Quellen-Ref)
--   learn_concept_edges     — gerichtete typisierte Beziehungen (prerequisite/related/opposite)
--   learn_cards             — generierte Lernkarten, konzept-getaggt
--   learner_concept_states  — BKT-Zustand pro User x Konzept  (Herzstueck)
--   learner_card_states     — SR-Zustand (SM-2-artig) pro User x Karte
-- ============================================================================

-- ---------------------------------------------------------------------------
-- learn_concepts
-- ---------------------------------------------------------------------------
create table if not exists public.learn_concepts (
  id uuid primary key default gen_random_uuid(),
  path_id uuid not null references public.learning_paths (id) on delete cascade,
  slug text not null,
  name text not null,
  description text not null default '',
  difficulty smallint not null default 3 check (difficulty between 1 and 5),
  -- {doc?: text, section?: text, page_from?: int, page_to?: int} — Rueckverweis ins Originalmaterial
  source_ref jsonb not null default '{}'::jsonb,
  -- Stabilitaetsanker der Ingestion-Reihenfolge (deterministische Sortierung bei gleichem Rang)
  ordinal integer not null default 0,
  created_at timestamptz not null default now(),
  constraint learn_concepts_path_slug_unique unique (path_id, slug),
  constraint learn_concepts_slug_not_blank check (length(trim(slug)) > 0),
  constraint learn_concepts_name_not_blank check (length(trim(name)) > 0)
);

create index if not exists learn_concepts_path_id_idx on public.learn_concepts (path_id);

alter table public.learn_concepts enable row level security;

-- Zugriff ueber Pfad-Eigentum (analog learning_paths "own rows").
drop policy if exists "learn_concepts_select_own" on public.learn_concepts;
create policy "learn_concepts_select_own"
  on public.learn_concepts for select to authenticated
  using (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()));

drop policy if exists "learn_concepts_insert_own" on public.learn_concepts;
create policy "learn_concepts_insert_own"
  on public.learn_concepts for insert to authenticated
  with check (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()));

drop policy if exists "learn_concepts_update_own" on public.learn_concepts;
create policy "learn_concepts_update_own"
  on public.learn_concepts for update to authenticated
  using (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()))
  with check (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()));

drop policy if exists "learn_concepts_delete_own" on public.learn_concepts;
create policy "learn_concepts_delete_own"
  on public.learn_concepts for delete to authenticated
  using (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- learn_concept_edges — gerichtete, typisierte Konzept-Beziehungen
-- ---------------------------------------------------------------------------
create table if not exists public.learn_concept_edges (
  id uuid primary key default gen_random_uuid(),
  path_id uuid not null references public.learning_paths (id) on delete cascade,
  from_concept_id uuid not null references public.learn_concepts (id) on delete cascade,
  to_concept_id uuid not null references public.learn_concepts (id) on delete cascade,
  type text not null check (type in ('prerequisite', 'related', 'opposite')),
  constraint learn_concept_edges_unique unique (from_concept_id, to_concept_id, type),
  constraint learn_concept_edges_no_self check (from_concept_id <> to_concept_id)
);

create index if not exists learn_concept_edges_path_id_idx on public.learn_concept_edges (path_id);
create index if not exists learn_concept_edges_from_idx on public.learn_concept_edges (from_concept_id);
create index if not exists learn_concept_edges_to_idx on public.learn_concept_edges (to_concept_id);

alter table public.learn_concept_edges enable row level security;

drop policy if exists "learn_concept_edges_select_own" on public.learn_concept_edges;
create policy "learn_concept_edges_select_own"
  on public.learn_concept_edges for select to authenticated
  using (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()));

drop policy if exists "learn_concept_edges_insert_own" on public.learn_concept_edges;
create policy "learn_concept_edges_insert_own"
  on public.learn_concept_edges for insert to authenticated
  with check (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()));

drop policy if exists "learn_concept_edges_update_own" on public.learn_concept_edges;
create policy "learn_concept_edges_update_own"
  on public.learn_concept_edges for update to authenticated
  using (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()))
  with check (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()));

drop policy if exists "learn_concept_edges_delete_own" on public.learn_concept_edges;
create policy "learn_concept_edges_delete_own"
  on public.learn_concept_edges for delete to authenticated
  using (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- learn_cards — generierte Lernkarten (konzept-getaggt)
-- step_id bleibt hier lose (FK zu learn_steps erst in Phase 2, wenn die Tabelle existiert).
-- ---------------------------------------------------------------------------
create table if not exists public.learn_cards (
  id uuid primary key default gen_random_uuid(),
  path_id uuid not null references public.learning_paths (id) on delete cascade,
  step_id uuid,
  concept_ids uuid[] not null default '{}',
  question text not null,
  answer text not null default '',
  card_type text not null default 'knowledge'
    check (card_type in ('knowledge', 'application', 'distinction', 'cloze')),
  difficulty smallint not null default 3 check (difficulty between 1 and 5),
  expected_answer text not null default '',
  evaluation_method text not null default 'semantic'
    check (evaluation_method in ('exact', 'semantic', 'contains')),
  created_at timestamptz not null default now(),
  constraint learn_cards_question_not_blank check (length(trim(question)) > 0)
);

create index if not exists learn_cards_path_id_idx on public.learn_cards (path_id);
create index if not exists learn_cards_step_id_idx on public.learn_cards (step_id);

alter table public.learn_cards enable row level security;

drop policy if exists "learn_cards_select_own" on public.learn_cards;
create policy "learn_cards_select_own"
  on public.learn_cards for select to authenticated
  using (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()));

drop policy if exists "learn_cards_insert_own" on public.learn_cards;
create policy "learn_cards_insert_own"
  on public.learn_cards for insert to authenticated
  with check (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()));

drop policy if exists "learn_cards_update_own" on public.learn_cards;
create policy "learn_cards_update_own"
  on public.learn_cards for update to authenticated
  using (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()))
  with check (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()));

drop policy if exists "learn_cards_delete_own" on public.learn_cards;
create policy "learn_cards_delete_own"
  on public.learn_cards for delete to authenticated
  using (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- learner_concept_states — BKT-Zustand pro User x Konzept (Herzstueck)
-- Wird ausschliesslich ueber learn_upsert_concept_states (unten) geschrieben.
-- ---------------------------------------------------------------------------
create table if not exists public.learner_concept_states (
  user_id uuid not null references auth.users (id) on delete cascade,
  concept_id uuid not null references public.learn_concepts (id) on delete cascade,
  p_mastery double precision not null default 0.3 check (p_mastery >= 0 and p_mastery <= 1),
  attempts integer not null default 0 check (attempts >= 0),
  correct integer not null default 0 check (correct >= 0),
  -- letzte ~20 Beobachtungen: [{ "correct": bool, "difficulty": int(1..5), "at": iso }]
  outcome_history jsonb not null default '[]'::jsonb,
  -- individuelle Vergessens-Rate pro Konzept (0 = kein Verfall)
  decay_rate double precision not null default 0.08 check (decay_rate >= 0),
  last_seen_at timestamptz,
  next_review_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, concept_id)
);

create index if not exists learner_concept_states_user_idx on public.learner_concept_states (user_id);
create index if not exists learner_concept_states_due_idx
  on public.learner_concept_states (user_id, next_review_at);

alter table public.learner_concept_states enable row level security;

drop policy if exists "learner_concept_states_select_own" on public.learner_concept_states;
create policy "learner_concept_states_select_own"
  on public.learner_concept_states for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- learner_card_states — SR-Zustand (SM-2-artig) pro User x Karte
-- Wird ausschliesslich ueber learn_review_card (unten) geschrieben.
-- ---------------------------------------------------------------------------
create table if not exists public.learner_card_states (
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id uuid not null references public.learn_cards (id) on delete cascade,
  sr_stage smallint not null default 0 check (sr_stage >= 0),
  easiness double precision not null default 2.5 check (easiness >= 1.3),
  interval_days integer not null default 0 check (interval_days >= 0),
  status text not null default 'new' check (status in ('new', 'learning', 'review', 'mastered')),
  last_reviewed_at timestamptz,
  next_review_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create index if not exists learner_card_states_user_idx on public.learner_card_states (user_id);
create index if not exists learner_card_states_due_idx
  on public.learner_card_states (user_id, next_review_at);

alter table public.learner_card_states enable row level security;

drop policy if exists "learner_card_states_select_own" on public.learner_card_states;
create policy "learner_card_states_select_own"
  on public.learner_card_states for select to authenticated
  using (user_id = auth.uid());

-- ===========================================================================
-- RPCs — atomare Batch-Upserts der clientseitig berechneten Zustaende.
-- Muster: security definer + auth.uid()-Guard wie learn_gamification_record_event.
-- Die BKT-/Verfall-/SR-Mathematik lebt bewusst NICHT hier, sondern in getesteten TS-Modulen;
-- die RPC persistiert nur das Ergebnis in einer Transaktion (last-write-wins, single-user-App).
-- ===========================================================================

-- learn_upsert_concept_states: Array vorberechneter Konzept-Zustaende in einem Rutsch upserten.
-- p_states: [{ concept_id, p_mastery, attempts, correct, outcome_history, decay_rate,
--              last_seen_at, next_review_at }]
create or replace function public.learn_upsert_concept_states(
  p_user_id uuid,
  p_states jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if auth.role() = 'service_role' then
    null;
  elsif auth.uid() is null or auth.uid() != p_user_id then
    raise exception 'Unauthorized concept-state upsert.';
  end if;

  if p_states is null or jsonb_typeof(p_states) <> 'array' then
    return 0;
  end if;

  insert into public.learner_concept_states as lcs (
    user_id, concept_id, p_mastery, attempts, correct,
    outcome_history, decay_rate, last_seen_at, next_review_at, updated_at
  )
  select
    p_user_id,
    (e->>'concept_id')::uuid,
    greatest(0, least(1, coalesce((e->>'p_mastery')::double precision, 0.3))),
    greatest(0, coalesce((e->>'attempts')::integer, 0)),
    greatest(0, coalesce((e->>'correct')::integer, 0)),
    coalesce(e->'outcome_history', '[]'::jsonb),
    greatest(0, coalesce((e->>'decay_rate')::double precision, 0.08)),
    nullif(e->>'last_seen_at', '')::timestamptz,
    nullif(e->>'next_review_at', '')::timestamptz,
    now()
  from jsonb_array_elements(p_states) as e
  where (e->>'concept_id') is not null
  on conflict (user_id, concept_id) do update set
    p_mastery = excluded.p_mastery,
    attempts = excluded.attempts,
    correct = excluded.correct,
    outcome_history = excluded.outcome_history,
    decay_rate = excluded.decay_rate,
    last_seen_at = excluded.last_seen_at,
    next_review_at = excluded.next_review_at,
    updated_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.learn_upsert_concept_states(uuid, jsonb) to authenticated;

-- learn_review_card: einen vorberechneten SR-Karten-Zustand upserten.
create or replace function public.learn_review_card(
  p_user_id uuid,
  p_card_id uuid,
  p_sr_stage smallint,
  p_easiness double precision,
  p_interval_days integer,
  p_status text,
  p_next_review_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    null;
  elsif auth.uid() is null or auth.uid() != p_user_id then
    raise exception 'Unauthorized card review.';
  end if;

  insert into public.learner_card_states as lcs (
    user_id, card_id, sr_stage, easiness, interval_days, status,
    last_reviewed_at, next_review_at, updated_at
  )
  values (
    p_user_id, p_card_id, greatest(0, coalesce(p_sr_stage, 0)),
    greatest(1.3, coalesce(p_easiness, 2.5)), greatest(0, coalesce(p_interval_days, 0)),
    coalesce(p_status, 'learning'), now(), p_next_review_at, now()
  )
  on conflict (user_id, card_id) do update set
    sr_stage = excluded.sr_stage,
    easiness = excluded.easiness,
    interval_days = excluded.interval_days,
    status = excluded.status,
    last_reviewed_at = now(),
    next_review_at = excluded.next_review_at,
    updated_at = now();
end;
$$;

grant execute on function public.learn_review_card(uuid, uuid, smallint, double precision, integer, text, timestamptz)
  to authenticated;

comment on table public.learn_concepts is
  'Konzept-Netz (Schicht 1): atomare Wissenseinheiten pro Lernpfad, aus dem Material extrahiert.';
comment on table public.learner_concept_states is
  'Lerner-Modell (Schicht 3): BKT P(Mastery) + Verfall pro User x Konzept. Herzstueck der Adaptivitaet.';
