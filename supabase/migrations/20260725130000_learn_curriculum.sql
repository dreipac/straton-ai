-- ============================================================================
-- Lernbereich Neu-Architektur — Phase 2: Curriculum (Schicht 2)
--
-- Normalisierte Themen + Schritte, aus dem Konzept-Netz (Phase 1) abgeleitet. Themen clustern
-- Konzepte, Schritte fokussieren Teilmengen davon; die Reihenfolge respektiert die Konzept-
-- Voraussetzungen (topologisch, clientseitig berechnet). Ein "Schritt" enthaelt intern die drei
-- Phasen (Verstehen/Ueben/Festigen) — daher KEIN Phasen-kind, nur regular/remediation.
--
-- path_id ist ueberall denormalisiert -> einheitliche, schnelle RLS ("own rows" ueber Pfad-Eigentum).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- learn_topics
-- ---------------------------------------------------------------------------
create table if not exists public.learn_topics (
  id uuid primary key default gen_random_uuid(),
  path_id uuid not null references public.learning_paths (id) on delete cascade,
  ordinal integer not null default 0,
  title text not null,
  learning_goal text not null default '',
  status text not null default 'locked' check (status in ('locked', 'active', 'mastered')),
  -- Optionale Pruef-Blueprints (Schicht 2/4); zur Laufzeit ergaenzt der adaptive Motor die Auswahl.
  check_blueprint jsonb not null default '{}'::jsonb,
  exam_blueprint jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint learn_topics_title_not_blank check (length(trim(title)) > 0)
);

create index if not exists learn_topics_path_id_idx on public.learn_topics (path_id, ordinal);

alter table public.learn_topics enable row level security;

drop policy if exists "learn_topics_select_own" on public.learn_topics;
create policy "learn_topics_select_own"
  on public.learn_topics for select to authenticated
  using (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()));

drop policy if exists "learn_topics_insert_own" on public.learn_topics;
create policy "learn_topics_insert_own"
  on public.learn_topics for insert to authenticated
  with check (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()));

drop policy if exists "learn_topics_update_own" on public.learn_topics;
create policy "learn_topics_update_own"
  on public.learn_topics for update to authenticated
  using (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()))
  with check (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()));

drop policy if exists "learn_topics_delete_own" on public.learn_topics;
create policy "learn_topics_delete_own"
  on public.learn_topics for delete to authenticated
  using (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- learn_steps
-- ---------------------------------------------------------------------------
create table if not exists public.learn_steps (
  id uuid primary key default gen_random_uuid(),
  path_id uuid not null references public.learning_paths (id) on delete cascade,
  topic_id uuid not null references public.learn_topics (id) on delete cascade,
  ordinal integer not null default 0,
  title text not null,
  kind text not null default 'regular' check (kind in ('regular', 'remediation')),
  status text not null default 'locked' check (status in ('locked', 'active', 'done')),
  created_at timestamptz not null default now(),
  constraint learn_steps_title_not_blank check (length(trim(title)) > 0)
);

create index if not exists learn_steps_topic_id_idx on public.learn_steps (topic_id, ordinal);
create index if not exists learn_steps_path_id_idx on public.learn_steps (path_id);

alter table public.learn_steps enable row level security;

drop policy if exists "learn_steps_select_own" on public.learn_steps;
create policy "learn_steps_select_own"
  on public.learn_steps for select to authenticated
  using (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()));

drop policy if exists "learn_steps_insert_own" on public.learn_steps;
create policy "learn_steps_insert_own"
  on public.learn_steps for insert to authenticated
  with check (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()));

drop policy if exists "learn_steps_update_own" on public.learn_steps;
create policy "learn_steps_update_own"
  on public.learn_steps for update to authenticated
  using (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()))
  with check (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()));

drop policy if exists "learn_steps_delete_own" on public.learn_steps;
create policy "learn_steps_delete_own"
  on public.learn_steps for delete to authenticated
  using (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- learn_topic_concepts (n:m Thema <-> Konzept)
-- ---------------------------------------------------------------------------
create table if not exists public.learn_topic_concepts (
  path_id uuid not null references public.learning_paths (id) on delete cascade,
  topic_id uuid not null references public.learn_topics (id) on delete cascade,
  concept_id uuid not null references public.learn_concepts (id) on delete cascade,
  primary key (topic_id, concept_id)
);

create index if not exists learn_topic_concepts_concept_idx on public.learn_topic_concepts (concept_id);

alter table public.learn_topic_concepts enable row level security;

drop policy if exists "learn_topic_concepts_select_own" on public.learn_topic_concepts;
create policy "learn_topic_concepts_select_own"
  on public.learn_topic_concepts for select to authenticated
  using (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()));

drop policy if exists "learn_topic_concepts_insert_own" on public.learn_topic_concepts;
create policy "learn_topic_concepts_insert_own"
  on public.learn_topic_concepts for insert to authenticated
  with check (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()));

drop policy if exists "learn_topic_concepts_delete_own" on public.learn_topic_concepts;
create policy "learn_topic_concepts_delete_own"
  on public.learn_topic_concepts for delete to authenticated
  using (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- learn_step_concepts (n:m Schritt <-> Konzept)
-- ---------------------------------------------------------------------------
create table if not exists public.learn_step_concepts (
  path_id uuid not null references public.learning_paths (id) on delete cascade,
  step_id uuid not null references public.learn_steps (id) on delete cascade,
  concept_id uuid not null references public.learn_concepts (id) on delete cascade,
  primary key (step_id, concept_id)
);

create index if not exists learn_step_concepts_concept_idx on public.learn_step_concepts (concept_id);

alter table public.learn_step_concepts enable row level security;

drop policy if exists "learn_step_concepts_select_own" on public.learn_step_concepts;
create policy "learn_step_concepts_select_own"
  on public.learn_step_concepts for select to authenticated
  using (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()));

drop policy if exists "learn_step_concepts_insert_own" on public.learn_step_concepts;
create policy "learn_step_concepts_insert_own"
  on public.learn_step_concepts for insert to authenticated
  with check (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()));

drop policy if exists "learn_step_concepts_delete_own" on public.learn_step_concepts;
create policy "learn_step_concepts_delete_own"
  on public.learn_step_concepts for delete to authenticated
  using (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = auth.uid()));

comment on table public.learn_topics is
  'Curriculum (Schicht 2): konzept-geclusterte, topologisch geordnete Themen eines Pfads.';
comment on table public.learn_steps is
  'Curriculum (Schicht 2): Schritte eines Themas (jeder Schritt enthaelt intern Verstehen/Ueben/Festigen).';
