-- ============================================================================
-- Straton Gehirn — Schicht 2: Gedaechtnis
-- Referenz: straton-gehirn-architektur.md, Kapitel 4 + 11
--
-- Das Gedaechtnis besteht aus zwei GETRENNT gefuehrten Ebenen (Invariante I10):
--   * Wissensgraph  — die Landkarte des Stoffs, OHNE personenbezogene Leistungsdaten.
--     Er liegt bereits in learn_concepts / learn_concept_edges. Diese Migration ergaenzt
--     dort nur die Herkunftsmarkierung (Invariante I4).
--   * Lernerbild    — alles, was das Gehirn ueber die Person weiss. Neue Tabelle
--     learner_concept_brain_states mit den DREI Werten aus Kapitel 4.2:
--     Beherrschung, Sicherheit, Anwendungstiefe.
--
-- Bewusst NICHT die bestehende learner_concept_states erweitert: die alte Engine
-- (src/features/learn/engine/) laeuft weiter und haelt dort ihren BKT-Zustand. Das Gehirn
-- bekommt eine eigene Tabelle, damit beide Modelle parallel existieren koennen, ohne dass
-- die Invarianten des einen die Semantik des anderen brechen.
--
-- Harte Invarianten, die HIER in Constraints gegossen sind:
--   I3  Propagation veraendert nie die Beherrschung, nur die Sicherheit
--       -> propagation_confidence_penalty ist getrennt gefuehrt und wirkt nur auf confidence.
--   I4  Jedes Wissensatom traegt eine Herkunftsmarkierung
--       -> learn_concepts.origin / learn_concept_edges.origin, NOT NULL, ohne stillen Default
--          fuer neu geschriebene Zeilen (Default nur zum Auffuellen des Bestands).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- I4 — Herkunftsmarkierung auf dem Wissensgraphen
--
-- 'material'      aus dem hochgeladenen Material abgeleitet (der Anker, Kapitel 3)
-- 'ai_supplement' von der KI ergaenzt, weil das Material eine Voraussetzung stillschweigend
--                 annimmt. MUSS in der Oberflaeche unterscheidbar bleiben.
-- 'user'          von Hand angelegt oder korrigiert (Handkorrektur, Kapitel 3 "Kritikalitaet")
-- ---------------------------------------------------------------------------
alter table public.learn_concepts
  add column if not exists origin text not null default 'material',
  -- Freitext-Beleg fuer die Stelle im Quelldokument (source_ref haelt die Koordinaten).
  add column if not exists source_quote text not null default '';

alter table public.learn_concepts
  drop constraint if exists learn_concepts_origin_check;
alter table public.learn_concepts
  add constraint learn_concepts_origin_check
    check (origin in ('material', 'ai_supplement', 'user'));

comment on column public.learn_concepts.origin is
  'Invariante I4: Herkunft des Wissensatoms. material = aus dem Quelldokument, ai_supplement = '
  'KI-ergaenzt (muss in der UI unterscheidbar bleiben), user = Handkorrektur.';

alter table public.learn_concept_edges
  add column if not exists origin text not null default 'cartographer',
  add column if not exists created_at timestamptz not null default now();

alter table public.learn_concept_edges
  drop constraint if exists learn_concept_edges_origin_check;
alter table public.learn_concept_edges
  add constraint learn_concept_edges_origin_check
    check (origin in ('cartographer', 'consolidator', 'user'));

comment on column public.learn_concept_edges.origin is
  'Herkunft der Kante: cartographer = beim Einlesen gezeichnet, consolidator = spaeter aus Daten '
  'entdeckt (Kapitel 8.2), user = Handkorrektur.';

-- ---------------------------------------------------------------------------
-- learner_concept_brain_states — das Lernerbild (Kapitel 4.2)
--
-- Drei Werte pro Konzept:
--   mastery     Beherrschung  — wie gut die Person das Konzept kann.
--   confidence  Sicherheit    — wie belastbar diese Einschaetzung ist. Einzige Groesse, die von
--                               Propagation (I3) und Strukturumbauten (Kapitel 8.3) bewegt wird.
--   depth       Anwendungstiefe — recognize | apply | transfer (Erkennen/Anwenden/Uebertragen).
--
-- mastery bewegt sich ausschliesslich durch direkte Evidenz (I1) und wird von Chatverhalten
-- nie erhoeht (I2). Beides wird in der Evidenzschicht (Migration ...121000) erzwungen.
-- ---------------------------------------------------------------------------
create table if not exists public.learner_concept_brain_states (
  user_id uuid not null references auth.users (id) on delete cascade,
  concept_id uuid not null references public.learn_concepts (id) on delete cascade,

  -- Beherrschung 0..1
  mastery double precision not null default 0.0 check (mastery >= 0 and mastery <= 1),
  -- Sicherheit 0..1; 0 = "ich weiss es noch nicht", nicht "du kannst es nicht".
  confidence double precision not null default 0.0 check (confidence >= 0 and confidence <= 1),

  -- Anwendungstiefe: hoechste Stufe, die durch direkte Evidenz belegt ist.
  depth text not null default 'recognize'
    check (depth in ('recognize', 'apply', 'transfer')),
  -- Evidenz je Stufe: {"recognize":{"attempts":n,"correct":n},"apply":{...},"transfer":{...}}
  depth_evidence jsonb not null default '{}'::jsonb,

  -- Zaehler ausschliesslich fuer DIREKTE Evidenz (bewertete Aufgaben) — I1.
  direct_evidence_count integer not null default 0 check (direct_evidence_count >= 0),
  -- Summiertes Evidenzgewicht (bewertete Aufgabe wiegt mehr als Chatsignal) — Kapitel 8.1.
  direct_evidence_weight double precision not null default 0 check (direct_evidence_weight >= 0),

  -- Propagation (I3): senkt ausschliesslich die Sicherheit, getrennt gefuehrt, damit der Anteil
  -- der Sicherheit, der NUR aus Zweifel stammt, jederzeit zurueckgenommen werden kann.
  propagation_confidence_penalty double precision not null default 0
    check (propagation_confidence_penalty >= 0 and propagation_confidence_penalty <= 1),
  -- Vom Planer gelesene Markierung "ueberpruefungsbeduerftig" (Kapitel 4.3).
  review_needed boolean not null default false,
  review_reason text not null default '',

  -- Verfall (Kapitel 4.2): Beherrschung sinkt mit der Zeit.
  decay_rate double precision not null default 0.08 check (decay_rate >= 0),

  -- Kaltstartphase (Kapitel 9): erhoehte Lernrate, solange kaum Evidenz vorliegt.
  cold_start boolean not null default true,

  last_direct_evidence_at timestamptz,
  last_seen_at timestamptz,
  next_review_at timestamptz,
  updated_at timestamptz not null default now(),

  primary key (user_id, concept_id)
);

create index if not exists learner_concept_brain_states_user_idx
  on public.learner_concept_brain_states (user_id);
create index if not exists learner_concept_brain_states_due_idx
  on public.learner_concept_brain_states (user_id, next_review_at);
create index if not exists learner_concept_brain_states_review_idx
  on public.learner_concept_brain_states (user_id, review_needed)
  where review_needed = true;

alter table public.learner_concept_brain_states enable row level security;

drop policy if exists "learner_concept_brain_states_select_own" on public.learner_concept_brain_states;
create policy "learner_concept_brain_states_select_own"
  on public.learner_concept_brain_states for select to authenticated
  using (user_id = (select auth.uid()));

comment on table public.learner_concept_brain_states is
  'Lernerbild (Kapitel 4.2): Beherrschung, Sicherheit und Anwendungstiefe pro User x Konzept. '
  'Streng getrennt vom Wissensgraphen (Invariante I10). Schreibzugriff nur ueber '
  'learn_brain_upsert_concept_states.';

-- ---------------------------------------------------------------------------
-- learn_path_order — vom Netz zum Pfad (Kapitel 11)
--
-- Das Gedaechtnis ist ein Netz, die Oberflaeche zeigt einen Pfad. Die Reihenfolge ist FEST
-- (sonst waere jede Fortschrittsanzeige bedeutungslos) und wird hier persistiert, statt sie
-- pro Sitzung neu zu berechnen.
--
-- position ist eine numerische Bruchzahl, KEIN fortlaufender Index. Das ist der Grund, warum
-- ein aufgespaltenes Konzept an seine logisch richtige Stelle einsortiert werden kann
-- (Kapitel 11 "Auflage"), ohne den ganzen Pfad umzunummerieren: zwischen 3.0 und 4.0 passt 3.5.
-- ---------------------------------------------------------------------------
create table if not exists public.learn_path_order (
  path_id uuid not null references public.learning_paths (id) on delete cascade,
  concept_id uuid not null references public.learn_concepts (id) on delete cascade,
  position numeric(20, 10) not null,
  -- 'base'   Teil der festen Grundordnung
  -- 'insert' adaptiver Einschub (Umweg zur Reparatur einer Voraussetzungsluecke). MUSS im
  --          Ueberblick sichtbar sein, sonst wirkt der wachsende Pfad wie ein Fehler.
  kind text not null default 'base' check (kind in ('base', 'insert')),
  insert_reason text not null default '',
  created_at timestamptz not null default now(),
  primary key (path_id, concept_id)
);

create index if not exists learn_path_order_position_idx
  on public.learn_path_order (path_id, position);

alter table public.learn_path_order enable row level security;

drop policy if exists "learn_path_order_select_own" on public.learn_path_order;
create policy "learn_path_order_select_own"
  on public.learn_path_order for select to authenticated
  using (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = (select auth.uid())));

drop policy if exists "learn_path_order_insert_own" on public.learn_path_order;
create policy "learn_path_order_insert_own"
  on public.learn_path_order for insert to authenticated
  with check (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = (select auth.uid())));

drop policy if exists "learn_path_order_update_own" on public.learn_path_order;
create policy "learn_path_order_update_own"
  on public.learn_path_order for update to authenticated
  using (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = (select auth.uid())))
  with check (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = (select auth.uid())));

drop policy if exists "learn_path_order_delete_own" on public.learn_path_order;
create policy "learn_path_order_delete_own"
  on public.learn_path_order for delete to authenticated
  using (exists (select 1 from public.learning_paths lp where lp.id = path_id and lp.user_id = (select auth.uid())));

comment on table public.learn_path_order is
  'Fester Pfad ueber das Konzept-Netz (Kapitel 11). Bruchzahl-Positionen, damit Einschuebe und '
  'aufgespaltene Konzepte an ihre logisch richtige Stelle passen, statt hinten angehaengt zu werden.';

-- ===========================================================================
-- RPCs
--
-- Muster wie learn_upsert_concept_states: security definer + auth.uid()-Guard, die Mathematik
-- (Verfall, Sicherheitsberechnung, Propagationsdaempfung) lebt in getesteten TS-Modulen unter
-- src/features/learn/brain/, die RPC persistiert nur das Ergebnis in einer Transaktion.
-- ===========================================================================

-- learn_brain_upsert_concept_states: Array vorberechneter Lernerbild-Zustaende upserten.
create or replace function public.learn_brain_upsert_concept_states(
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
  elsif auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Unauthorized learner-image upsert.';
  end if;

  if p_states is null or jsonb_typeof(p_states) <> 'array' then
    return 0;
  end if;

  insert into public.learner_concept_brain_states as s (
    user_id, concept_id, mastery, confidence, depth, depth_evidence,
    direct_evidence_count, direct_evidence_weight, propagation_confidence_penalty,
    review_needed, review_reason, decay_rate, cold_start,
    last_direct_evidence_at, last_seen_at, next_review_at, updated_at
  )
  select
    p_user_id,
    (e ->> 'concept_id')::uuid,
    greatest(0, least(1, coalesce((e ->> 'mastery')::double precision, 0))),
    greatest(0, least(1, coalesce((e ->> 'confidence')::double precision, 0))),
    case when e ->> 'depth' in ('recognize', 'apply', 'transfer') then e ->> 'depth' else 'recognize' end,
    coalesce(e -> 'depth_evidence', '{}'::jsonb),
    greatest(0, coalesce((e ->> 'direct_evidence_count')::integer, 0)),
    greatest(0, coalesce((e ->> 'direct_evidence_weight')::double precision, 0)),
    greatest(0, least(1, coalesce((e ->> 'propagation_confidence_penalty')::double precision, 0))),
    coalesce((e ->> 'review_needed')::boolean, false),
    coalesce(left(e ->> 'review_reason', 300), ''),
    greatest(0, coalesce((e ->> 'decay_rate')::double precision, 0.08)),
    coalesce((e ->> 'cold_start')::boolean, true),
    nullif(e ->> 'last_direct_evidence_at', '')::timestamptz,
    nullif(e ->> 'last_seen_at', '')::timestamptz,
    nullif(e ->> 'next_review_at', '')::timestamptz,
    now()
  from jsonb_array_elements(p_states) as e
  where (e ->> 'concept_id') is not null
  on conflict (user_id, concept_id) do update set
    mastery = excluded.mastery,
    confidence = excluded.confidence,
    depth = excluded.depth,
    depth_evidence = excluded.depth_evidence,
    direct_evidence_count = excluded.direct_evidence_count,
    direct_evidence_weight = excluded.direct_evidence_weight,
    propagation_confidence_penalty = excluded.propagation_confidence_penalty,
    review_needed = excluded.review_needed,
    review_reason = excluded.review_reason,
    decay_rate = excluded.decay_rate,
    cold_start = excluded.cold_start,
    last_direct_evidence_at = excluded.last_direct_evidence_at,
    last_seen_at = excluded.last_seen_at,
    next_review_at = excluded.next_review_at,
    updated_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.learn_brain_upsert_concept_states(uuid, jsonb) to authenticated;

-- learn_brain_replace_path_order: die feste Pfadreihenfolge eines Pfads in einem Rutsch setzen.
-- p_entries: [{ concept_id, position, kind, insert_reason }]
create or replace function public.learn_brain_replace_path_order(
  p_path_id uuid,
  p_entries jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_count integer := 0;
begin
  select lp.user_id into v_owner from public.learning_paths lp where lp.id = p_path_id;
  if v_owner is null then
    raise exception 'Unknown learning path.';
  end if;
  if auth.role() <> 'service_role' and (auth.uid() is null or auth.uid() <> v_owner) then
    raise exception 'Unauthorized path-order write.';
  end if;

  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    return 0;
  end if;

  delete from public.learn_path_order
  where path_id = p_path_id
    and concept_id not in (
      select (e ->> 'concept_id')::uuid
      from jsonb_array_elements(p_entries) as e
      where (e ->> 'concept_id') is not null
    );

  insert into public.learn_path_order as o (path_id, concept_id, position, kind, insert_reason)
  select
    p_path_id,
    (e ->> 'concept_id')::uuid,
    coalesce((e ->> 'position')::numeric, 0),
    case when e ->> 'kind' = 'insert' then 'insert' else 'base' end,
    coalesce(left(e ->> 'insert_reason', 300), '')
  from jsonb_array_elements(p_entries) as e
  where (e ->> 'concept_id') is not null
  on conflict (path_id, concept_id) do update set
    position = excluded.position,
    kind = excluded.kind,
    insert_reason = excluded.insert_reason;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.learn_brain_replace_path_order(uuid, jsonb) to authenticated;
