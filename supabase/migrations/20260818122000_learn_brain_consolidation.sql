-- ============================================================================
-- Straton Gehirn — Schicht 6: Konsolidierung
-- Referenz: straton-gehirn-architektur.md, Kapitel 8
--
-- Die einzige Schicht, die von sich aus taetig wird. Vorbild ist der Schlaf: der Tag wird nicht
-- abgespielt, sondern umgebaut, verdichtet und neu verknuepft.
--
-- Drei Tabellen:
--   learn_consolidation_state   Ausloeser-Buchhaltung: aufgelaufenes Evidenzgewicht + Wartezeit
--   learn_structure_proposals   Vorschlaege, die auf Bestaetigung warten (I6) und verfallen
--   learn_structure_log         Protokollpflicht (Kapitel 8.4) inklusive Ruecknahme-Anleitung
--
-- Harte Invarianten als Constraints:
--   I6  Zerstoererische Strukturaenderungen erfordern Nutzerbestaetigung UND ein Protokoll mit
--       Ruecknahmemoeglichkeit.
--       -> learn_structure_proposals_destructive_needs_confirmation erzwingt, dass eine
--          Verschmelzung nie als 'auto_applied' durchgeht.
--       -> learn_structure_log.undo_payload ist NOT NULL und darf nicht leer sein. Ein
--          Strukturumbau ohne hinterlegte Ruecknahme laesst sich physisch nicht protokollieren,
--          und ohne Protokoll darf er nicht stattfinden.
--   I7  Keine Strukturfragen waehrend einer Lernsitzung.
--       -> surface_context haelt fest, wo ein Vorschlag gezeigt werden darf; 'in_session' ist
--          kein zugelassener Wert.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- learn_consolidation_state — der Ausloeser (Kapitel 8.1)
--
-- Konsolidiert wird bei ausreichendem EVIDENZGEWICHT, nicht nach Zeitplan und nicht nach jeder
-- Sitzung. Zwanzig Chatnachrichten wiegen weniger als fuenf bewertete Aufgaben; reines Zaehlen
-- wuerde Vielrederei zum Ausloeser machen.
--
-- Zusaetzlich eine Obergrenze fuer die Wartezeit, sonst konsolidiert ein Gelegenheitsnutzer nie
-- und sein Lernerbild bleibt fuer immer roh.
-- ---------------------------------------------------------------------------
create table if not exists public.learn_consolidation_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  path_id uuid not null references public.learning_paths (id) on delete cascade,

  -- Seit dem letzten Lauf aufgelaufenes Gewicht.
  pending_evidence_weight double precision not null default 0 check (pending_evidence_weight >= 0),
  -- Aelteste unverarbeitete Evidenz; Basis fuer die Wartezeit-Obergrenze.
  oldest_pending_at timestamptz,

  last_run_at timestamptz,
  run_count integer not null default 0 check (run_count >= 0),
  -- Ergebnis des letzten Laufs, fuer Diagnose im Admin-/Debug-Kontext.
  last_run_summary jsonb not null default '{}'::jsonb,

  updated_at timestamptz not null default now(),
  primary key (user_id, path_id)
);

alter table public.learn_consolidation_state enable row level security;

drop policy if exists "learn_consolidation_state_select_own" on public.learn_consolidation_state;
create policy "learn_consolidation_state_select_own"
  on public.learn_consolidation_state for select to authenticated
  using (user_id = (select auth.uid()));

comment on table public.learn_consolidation_state is
  'Ausloeser der Konsolidierung (Kapitel 8.1): aufgelaufenes Evidenzgewicht plus Wartezeit-Obergrenze. '
  'Wird ausschliesslich ueber learn_brain_add_evidence_weight / learn_brain_finish_consolidation geschrieben.';

-- ---------------------------------------------------------------------------
-- learn_structure_proposals — Vorschlaege des Konsolidierers (Kapitel 8.2)
--
-- Vier Operationen, unterschieden nach umkehrbar gegen zerstoererisch — nicht nach gross gegen
-- klein. Eine Kante laesst sich wieder entfernen. Eine Verschmelzung loescht die Unterscheidung
-- dauerhaft.
-- ---------------------------------------------------------------------------
create table if not exists public.learn_structure_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  path_id uuid not null references public.learning_paths (id) on delete cascade,

  operation text not null check (operation in (
    'add_edge',          -- umkehrbar, automatisch
    'remove_edge',       -- umkehrbar, automatisch
    'split_concept',     -- teilweise umkehrbar, automatisch, mit Wertregel (Kapitel 8.3)
    'merge_concepts',    -- ZERSTOERERISCH, Nutzerbestaetigung erforderlich (I6)
    'promote_pattern',   -- umkehrbar, automatisch
    'merge_patterns'     -- ZERSTOERERISCH, gleiche Regel wie Konzeptverschmelzung (Kapitel 10)
  )),

  -- Operationsspezifische Nutzlast, z. B. {"from_concept_id":…, "to_concept_id":…}
  payload jsonb not null default '{}'::jsonb,
  -- Welche Belege dafuer sprachen (Kapitel 8.4).
  evidence jsonb not null default '{}'::jsonb,

  -- Die Frage in der Sprache des Nutzers, nicht in Graphensprache (Kapitel 8.2):
  -- "Meinen 'Subnetzmaske' und 'Netzmaske berechnen' dasselbe?"
  question text not null default '',
  rationale text not null default '',

  requires_confirmation boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'expired', 'auto_applied')),

  -- I7: Verschmelzungsvorschlaege werden gesammelt und nur an ruhiger Stelle gezeigt.
  surface_context text not null default 'session_start'
    check (surface_context in ('session_start', 'map_review')),

  -- Verfallsdatum: bleibt eine Frage unbeantwortet, aendert sich nichts und der Vorschlag
  -- verschwindet. Sonst waechst ein Berg unbeantworteter Fragen.
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,

  -- I6: eine zerstoererische Operation darf nie ohne Bestaetigung angewandt werden.
  constraint learn_structure_proposals_destructive_needs_confirmation
    check (
      operation not in ('merge_concepts', 'merge_patterns')
      or (requires_confirmation = true and status <> 'auto_applied')
    ),
  constraint learn_structure_proposals_confirmation_needs_question
    check (requires_confirmation = false or length(trim(question)) > 0)
);

create index if not exists learn_structure_proposals_pending_idx
  on public.learn_structure_proposals (user_id, path_id, status, expires_at);

alter table public.learn_structure_proposals enable row level security;

drop policy if exists "learn_structure_proposals_select_own" on public.learn_structure_proposals;
create policy "learn_structure_proposals_select_own"
  on public.learn_structure_proposals for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "learn_structure_proposals_insert_own" on public.learn_structure_proposals;
create policy "learn_structure_proposals_insert_own"
  on public.learn_structure_proposals for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "learn_structure_proposals_update_own" on public.learn_structure_proposals;
create policy "learn_structure_proposals_update_own"
  on public.learn_structure_proposals for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

comment on table public.learn_structure_proposals is
  'Strukturvorschlaege des Konsolidierers (Kapitel 8.2). Verschmelzungen brauchen Bestaetigung (I6) '
  'und werden nur an ruhiger Stelle gezeigt (I7). Ohne Antwort verfallen sie.';

-- ---------------------------------------------------------------------------
-- learn_structure_log — Protokollpflicht (Kapitel 8.4)
--
-- Jeder Strukturumbau wird protokolliert: was geaendert wurde, welche Belege dafuer sprachen,
-- wann es geschah, und WIE ES RUECKGAENGIG ZU MACHEN IST.
--
-- Ohne Protokoll waere das System eines, das sich selbst veraendert und dabei seine eigene
-- Vergangenheit loescht. Fehler waeren dann weder fuer den Betreiber noch fuer den Nutzer
-- diagnostizierbar. Deshalb ist undo_payload NOT NULL und darf nicht das leere Objekt sein.
-- ---------------------------------------------------------------------------
create table if not exists public.learn_structure_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  path_id uuid not null references public.learning_paths (id) on delete cascade,
  proposal_id uuid references public.learn_structure_proposals (id) on delete set null,

  operation text not null check (operation in (
    'add_edge', 'remove_edge', 'split_concept', 'merge_concepts', 'promote_pattern', 'merge_patterns'
  )),
  -- was geaendert wurde
  payload jsonb not null default '{}'::jsonb,
  -- welche Belege dafuer sprachen
  evidence jsonb not null default '{}'::jsonb,
  -- wie es rueckgaengig zu machen ist
  undo_payload jsonb not null,

  destructive boolean not null default false,
  applied_at timestamptz not null default now(),
  reverted_at timestamptz,

  constraint learn_structure_log_undo_not_empty
    check (jsonb_typeof(undo_payload) = 'object' and undo_payload <> '{}'::jsonb)
);

create index if not exists learn_structure_log_path_idx
  on public.learn_structure_log (path_id, applied_at desc);
create index if not exists learn_structure_log_user_idx
  on public.learn_structure_log (user_id, applied_at desc);

alter table public.learn_structure_log enable row level security;

drop policy if exists "learn_structure_log_select_own" on public.learn_structure_log;
create policy "learn_structure_log_select_own"
  on public.learn_structure_log for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "learn_structure_log_insert_own" on public.learn_structure_log;
create policy "learn_structure_log_insert_own"
  on public.learn_structure_log for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "learn_structure_log_update_own" on public.learn_structure_log;
create policy "learn_structure_log_update_own"
  on public.learn_structure_log for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

comment on table public.learn_structure_log is
  'Protokollpflicht (Kapitel 8.4). undo_payload ist NOT NULL und nicht-leer: ein Strukturumbau ohne '
  'hinterlegte Ruecknahme laesst sich nicht protokollieren, und ohne Protokoll darf er nicht geschehen.';

-- ===========================================================================
-- RPCs — Ausloeser-Buchhaltung
-- ===========================================================================

-- learn_brain_add_evidence_weight: Gewicht einer neuen Beobachtung auf den Zaehler addieren.
-- Gibt den aktuellen Stand zurueck, damit der Client entscheiden kann, ob konsolidiert wird.
create or replace function public.learn_brain_add_evidence_weight(
  p_user_id uuid,
  p_path_id uuid,
  p_weight double precision
)
returns table (
  pending_evidence_weight double precision,
  oldest_pending_at timestamptz,
  last_run_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and (auth.uid() is null or auth.uid() <> p_user_id) then
    raise exception 'Unauthorized consolidation bookkeeping.';
  end if;

  insert into public.learn_consolidation_state as c (
    user_id, path_id, pending_evidence_weight, oldest_pending_at, updated_at
  )
  values (p_user_id, p_path_id, greatest(0, coalesce(p_weight, 0)), now(), now())
  on conflict (user_id, path_id) do update set
    pending_evidence_weight = c.pending_evidence_weight + greatest(0, coalesce(p_weight, 0)),
    oldest_pending_at = coalesce(c.oldest_pending_at, now()),
    updated_at = now();

  return query
    select c.pending_evidence_weight, c.oldest_pending_at, c.last_run_at
    from public.learn_consolidation_state c
    where c.user_id = p_user_id and c.path_id = p_path_id;
end;
$$;

grant execute on function public.learn_brain_add_evidence_weight(uuid, uuid, double precision) to authenticated;

-- learn_brain_finish_consolidation: Lauf abschliessen — Zaehler zuruecksetzen, Wartezeit neu starten.
create or replace function public.learn_brain_finish_consolidation(
  p_user_id uuid,
  p_path_id uuid,
  p_summary jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and (auth.uid() is null or auth.uid() <> p_user_id) then
    raise exception 'Unauthorized consolidation bookkeeping.';
  end if;

  insert into public.learn_consolidation_state as c (
    user_id, path_id, pending_evidence_weight, oldest_pending_at,
    last_run_at, run_count, last_run_summary, updated_at
  )
  values (p_user_id, p_path_id, 0, null, now(), 1, coalesce(p_summary, '{}'::jsonb), now())
  on conflict (user_id, path_id) do update set
    pending_evidence_weight = 0,
    oldest_pending_at = null,
    last_run_at = now(),
    run_count = c.run_count + 1,
    last_run_summary = coalesce(p_summary, '{}'::jsonb),
    updated_at = now();
end;
$$;

grant execute on function public.learn_brain_finish_consolidation(uuid, uuid, jsonb) to authenticated;

-- learn_brain_expire_structure_proposals: abgelaufene Vorschlaege stillschweigend schliessen.
-- Bleibt eine Frage unbeantwortet, aendert sich nichts (Kapitel 8.2).
create or replace function public.learn_brain_expire_structure_proposals(
  p_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if auth.role() <> 'service_role' and (auth.uid() is null or auth.uid() <> p_user_id) then
    raise exception 'Unauthorized proposal expiry.';
  end if;

  update public.learn_structure_proposals
  set status = 'expired', decided_at = now()
  where user_id = p_user_id and status = 'pending' and expires_at <= now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.learn_brain_expire_structure_proposals(uuid) to authenticated;
