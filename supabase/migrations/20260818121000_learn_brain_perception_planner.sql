-- ============================================================================
-- Straton Gehirn — Schicht 3 (Wahrnehmung) + Schicht 4 (Exekutive)
-- Referenz: straton-gehirn-architektur.md, Kapitel 5, 6, 10
--
-- Diese Migration legt die Tabellen an, in denen das Gehirn wahrnimmt und entscheidet:
--   learn_evidence_events      jede einzelne Beobachtung mit Ursache, Teilpunkten und Zuversicht
--   learn_error_observations   halbstrukturierte Fehlerursachen inkl. Herkunft (Kapitel 10)
--   learn_error_patterns       daraus getaufte, benannte Muster mit stabilem Namen (I12)
--   learn_goals                das Ziel als echtes Objekt (Termin, Umfang, verfuegbare Zeit)
--   learn_task_log             welche Aufgabe warum ausgespielt wurde (Erklaerpflicht I8)
--
-- Harte Invarianten als Constraints:
--   I1  Nur direkte Evidenz veraendert die Beherrschung.
--   I2  Chatverhalten erhoeht die Beherrschung nie.
--       -> learn_evidence_events_chat_never_raises_mastery. Der Check laesst fuer 'chat'
--          nur mastery_delta <= 0 zu; die Wahrnehmungsschicht in TS setzt nach Kapitel 5.1
--          zusaetzlich strikt 0 und laesst Chat ausschliesslich auf die Sicherheit wirken.
--          Der Constraint ist die Untergrenze, die auch ein Fehler im Client nicht unterlaufen kann.
--   I12 Namen von Fehlermustern bleiben stabil, sobald vergeben.
--       -> learn_error_patterns.name ist unique pro User; Umbenennen ist kein Update-Pfad,
--          sondern nur ueber eine protokollierte Verschmelzung moeglich.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Chat-Signale abschaltbar (Kapitel 5.1, "Pflicht zur Sichtbarkeit")
--
-- Der Nutzer muss wissen, dass Chats das Lernerbild beeinflussen, und es abschalten koennen.
-- Ohne diesen Schalter fuehlt sich die niedrigschwellige Chatnutzung ueberwacht an.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists learn_brain_chat_signals_enabled boolean not null default true;

comment on column public.profiles.learn_brain_chat_signals_enabled is
  'Kapitel 5.1: Chatverhalten als Signalquelle fuer das Lernerbild. Abschaltbar durch den Nutzer; '
  'bei false darf keine Chat-Evidenz geschrieben werden.';

-- ---------------------------------------------------------------------------
-- learn_evidence_events — die Ausgabe des Pruefers (Kapitel 5.2)
--
-- Pro Antwort drei Dinge: Fehlerursache (halbstrukturiert), Teilpunkte (nicht nur richtig/falsch)
-- und die Zuversicht des Pruefers in seine eigene Bewertung. Die Zuversicht ist die wichtigste
-- der drei Angaben (Kapitel 5.3): niedrige Zuversicht bewegt das Lernerbild nur schwach und
-- loest stattdessen Nachfragen oder eine Eskalation an ein staerkeres Modell aus.
-- ---------------------------------------------------------------------------
create table if not exists public.learn_evidence_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  path_id uuid not null references public.learning_paths (id) on delete cascade,
  concept_id uuid not null references public.learn_concepts (id) on delete cascade,

  -- Die beiden zugelassenen Signalquellen (Kapitel 5.1) mit sehr unterschiedlicher Qualitaet.
  source text not null check (source in ('graded_task', 'chat')),

  -- Teilpunkte: "Rechenweg korrekt, Ergebnis falsch" ist eine andere Diagnose als "Ansatz falsch".
  credit double precision not null default 0 check (credit >= 0 and credit <= 1),
  -- Halbstrukturierte Teilbewertung, z. B. {"approach":1,"execution":0,"result":0}
  partial_credit jsonb not null default '{}'::jsonb,

  -- Zuversicht des Pruefers in die eigene Bewertung.
  examiner_confidence double precision not null default 0.5
    check (examiner_confidence >= 0 and examiner_confidence <= 1),
  -- Bei niedriger Zuversicht an ein staerkeres Modell weitergereicht (Kapitel 5.3).
  escalated boolean not null default false,

  -- Auf welcher Anwendungstiefe die Aufgabe stand und in welchem Format sie kam.
  depth text not null default 'recognize' check (depth in ('recognize', 'apply', 'transfer')),
  format text not null default '',
  difficulty smallint not null default 3 check (difficulty between 1 and 5),

  -- Evidenzgewicht (Kapitel 8.1): bewertete Aufgaben wiegen mehr als Chatsignale.
  evidence_weight double precision not null default 0 check (evidence_weight >= 0),

  -- Tatsaechlich auf das Lernerbild angewandte Deltas. Redundant zum berechneten Zustand,
  -- aber die einzige Moeglichkeit, eine Invariantenverletzung im Nachhinein nachzuweisen.
  mastery_delta double precision not null default 0,
  confidence_delta double precision not null default 0,

  occurred_at timestamptz not null default now(),

  -- I1: nur direkte Evidenz veraendert die Beherrschung.
  constraint learn_evidence_events_only_direct_evidence_moves_mastery
    check (source = 'graded_task' or mastery_delta <= 0),
  -- I2: Chatverhalten erhoeht die Beherrschung nie.
  constraint learn_evidence_events_chat_never_raises_mastery
    check (source <> 'chat' or mastery_delta <= 0)
);

create index if not exists learn_evidence_events_user_concept_idx
  on public.learn_evidence_events (user_id, concept_id, occurred_at desc);
create index if not exists learn_evidence_events_path_idx
  on public.learn_evidence_events (path_id, occurred_at desc);

alter table public.learn_evidence_events enable row level security;

drop policy if exists "learn_evidence_events_select_own" on public.learn_evidence_events;
create policy "learn_evidence_events_select_own"
  on public.learn_evidence_events for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "learn_evidence_events_insert_own" on public.learn_evidence_events;
create policy "learn_evidence_events_insert_own"
  on public.learn_evidence_events for insert to authenticated
  with check (user_id = (select auth.uid()));

comment on table public.learn_evidence_events is
  'Ausgabe des Pruefers (Kapitel 5.2): Teilpunkte, Zuversicht und die tatsaechlich angewandten '
  'Deltas. Die Constraints halten die Invarianten I1 und I2 auch dann, wenn der Client falsch rechnet.';

-- ---------------------------------------------------------------------------
-- learn_error_patterns — benannte Fehlermuster (Kapitel 10)
--
-- Frei entstehend, kein vordefinierter Katalog: ein fester Katalog kann nur finden, was vorher
-- gedacht wurde, und genau die nuetzlichsten fachspezifischen Muster kaemen darin nie vor.
--
-- Muss VOR learn_error_observations stehen (Fremdschluessel).
-- ---------------------------------------------------------------------------
create table if not exists public.learn_error_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- I12: stabil, sobald vergeben. Ein System, das dieselbe Sache jede Woche anders nennt,
  -- wirkt orientierungslos.
  name text not null,
  -- Halbstrukturierte Form (Kapitel 5.2): Freiheit im Inhalt, Disziplin in der Form.
  kind text not null check (kind in ('confused', 'omitted', 'misapplied', 'overlooked')),
  object text not null default '',

  -- Herkunft mitschreiben (Kapitel 10, Auflage 2). Diese Information ist nachtraeglich NICHT
  -- rekonstruierbar: ein Muster ueber viele unverwandte Konzepte ist generisch, eines, das sich
  -- in einer Ecke des Graphen ballt, fachspezifisch.
  scope text not null default 'unknown' check (scope in ('generic', 'domain_specific', 'unknown')),
  subjects text[] not null default '{}',
  distinct_concept_count integer not null default 0 check (distinct_concept_count >= 0),
  occurrence_count integer not null default 0 check (occurrence_count >= 0),
  distinct_day_count integer not null default 0 check (distinct_day_count >= 0),

  -- Anzeigeschwelle (Kapitel 10): das Gehirn handelt auf Verdacht, es redet nur ueber Gewissheit.
  surfaced boolean not null default false,
  surfaced_at timestamptz,
  -- Ein Widerspruch des Nutzers ist selbst ein wertvolles Signal.
  user_disputed boolean not null default false,

  -- Musterverschmelzung folgt derselben Regel wie Konzeptverschmelzung: zerstoererisch,
  -- also Protokoll und Ruecknahme. Der alte Name bleibt als Zeile stehen und zeigt auf den neuen.
  merged_into_id uuid references public.learn_error_patterns (id) on delete set null,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint learn_error_patterns_name_not_blank check (length(trim(name)) > 0),
  constraint learn_error_patterns_name_unique unique (user_id, name),
  constraint learn_error_patterns_no_self_merge check (merged_into_id is null or merged_into_id <> id)
);

create index if not exists learn_error_patterns_user_idx on public.learn_error_patterns (user_id);
create index if not exists learn_error_patterns_surfaced_idx
  on public.learn_error_patterns (user_id, surfaced) where surfaced = true;

alter table public.learn_error_patterns enable row level security;

drop policy if exists "learn_error_patterns_select_own" on public.learn_error_patterns;
create policy "learn_error_patterns_select_own"
  on public.learn_error_patterns for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "learn_error_patterns_insert_own" on public.learn_error_patterns;
create policy "learn_error_patterns_insert_own"
  on public.learn_error_patterns for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "learn_error_patterns_update_own" on public.learn_error_patterns;
create policy "learn_error_patterns_update_own"
  on public.learn_error_patterns for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

comment on table public.learn_error_patterns is
  'Benannte Fehlermuster (Kapitel 10). Frei entstehend statt vordefiniert; Namen sind pro User '
  'eindeutig und stabil (I12). Verschmelzungen zeigen ueber merged_into_id auf das Zielmuster.';

-- ---------------------------------------------------------------------------
-- learn_error_observations — jedes einzelne Auftreten
--
-- Der Pruefer beschreibt die Ursache halbstrukturiert, der Konsolidierer gruppiert wiederkehrende
-- Beschreibungen und tauft daraus benannte Muster. Bis dahin steht pattern_id auf null.
-- ---------------------------------------------------------------------------
create table if not exists public.learn_error_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  path_id uuid not null references public.learning_paths (id) on delete cascade,
  concept_id uuid not null references public.learn_concepts (id) on delete cascade,
  evidence_event_id uuid references public.learn_evidence_events (id) on delete set null,

  -- was schiefging
  kind text not null check (kind in ('confused', 'omitted', 'misapplied', 'overlooked')),
  -- worauf bezogen
  object text not null default '',
  -- Der Rohtext des Pruefers; nuetzlich fuer die spaetere Gruppierung, nie fuer Statistik.
  raw_description text not null default '',

  -- Herkunft (Kapitel 10, Auflage 2) — von Anfang an mitschreiben, nicht rekonstruierbar.
  subject text not null default '',

  pattern_id uuid references public.learn_error_patterns (id) on delete set null,
  occurred_at timestamptz not null default now()
);

create index if not exists learn_error_observations_user_idx
  on public.learn_error_observations (user_id, occurred_at desc);
create index if not exists learn_error_observations_pattern_idx
  on public.learn_error_observations (pattern_id);
create index if not exists learn_error_observations_grouping_idx
  on public.learn_error_observations (user_id, kind, object);

alter table public.learn_error_observations enable row level security;

drop policy if exists "learn_error_observations_select_own" on public.learn_error_observations;
create policy "learn_error_observations_select_own"
  on public.learn_error_observations for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "learn_error_observations_insert_own" on public.learn_error_observations;
create policy "learn_error_observations_insert_own"
  on public.learn_error_observations for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "learn_error_observations_update_own" on public.learn_error_observations;
create policy "learn_error_observations_update_own"
  on public.learn_error_observations for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- learn_goals — das Ziel als echtes Objekt (Kapitel 6.3)
--
-- Damit "Ziel uebersteuert" funktionieren kann, braucht ein Ziel drei Angaben: Termin, Umfang
-- und verfuegbare Zeit. Erst damit kann das Gehirn rueckwaerts rechnen und eine ehrliche
-- Machbarkeitsaussage treffen statt eines Motivationsspruchs.
-- ---------------------------------------------------------------------------
create table if not exists public.learn_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  path_id uuid not null references public.learning_paths (id) on delete cascade,

  title text not null default '',
  -- Termin
  due_at timestamptz not null,
  -- Umfang: welche Konzepte dazugehoeren
  concept_ids uuid[] not null default '{}',
  -- verfuegbare Zeit: wie viel realistisch pro Tag
  minutes_per_day integer not null default 30 check (minutes_per_day > 0 and minutes_per_day <= 600),

  status text not null default 'active' check (status in ('active', 'achieved', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Hoechstens ein aktives Ziel pro Pfad — sonst waere "Ziel uebersteuert" mehrdeutig.
create unique index if not exists learn_goals_one_active_per_path
  on public.learn_goals (path_id) where status = 'active';
create index if not exists learn_goals_user_idx on public.learn_goals (user_id, status);

alter table public.learn_goals enable row level security;

drop policy if exists "learn_goals_select_own" on public.learn_goals;
create policy "learn_goals_select_own"
  on public.learn_goals for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "learn_goals_insert_own" on public.learn_goals;
create policy "learn_goals_insert_own"
  on public.learn_goals for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "learn_goals_update_own" on public.learn_goals;
create policy "learn_goals_update_own"
  on public.learn_goals for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "learn_goals_delete_own" on public.learn_goals;
create policy "learn_goals_delete_own"
  on public.learn_goals for delete to authenticated
  using (user_id = (select auth.uid()));

comment on table public.learn_goals is
  'Ziel als echtes Objekt (Kapitel 6.3): Termin, Umfang und verfuegbare Zeit. Ohne alle drei '
  'Angaben kann der Planer keine Machbarkeitsaussage treffen.';

-- ---------------------------------------------------------------------------
-- learn_task_log — Erklaerpflicht (I8) und Nachvollziehbarkeit des Planers
--
-- Weil gewichtet statt starr entschieden wird, ist die Auswahl von aussen nicht mehr
-- offensichtlich. Zu jeder Aufgabe muss in einem Satz sagbar sein, warum genau sie jetzt kommt.
-- ---------------------------------------------------------------------------
create table if not exists public.learn_task_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  path_id uuid not null references public.learning_paths (id) on delete cascade,
  concept_id uuid not null references public.learn_concepts (id) on delete cascade,

  -- Welcher der vier konkurrierenden Ansprueche (Kapitel 6.2) den Zuschlag bekam,
  -- plus 'cold_start' fuer die adaptive Suche der ersten Sitzung (Kapitel 9).
  claim text not null check (claim in ('review', 'root_cause', 'goal', 'motivation', 'cold_start')),
  urgency double precision not null default 0,
  -- I8: der eine Satz, der dem Nutzer zeigbar ist.
  reason text not null default '',
  -- Aufschluesselung aller Ansprueche zum Entscheidungszeitpunkt (Debugbarkeit).
  urgency_breakdown jsonb not null default '{}'::jsonb,

  depth text not null default 'recognize' check (depth in ('recognize', 'apply', 'transfer')),
  format text not null default '',

  -- Wurde diese Aufgabe als Teil der Wiederholungs-Mindestreserve ausgespielt (I9)?
  from_review_reserve boolean not null default false,

  evidence_event_id uuid references public.learn_evidence_events (id) on delete set null,
  selected_at timestamptz not null default now(),
  answered_at timestamptz,

  constraint learn_task_log_reason_not_blank check (length(trim(reason)) > 0)
);

create index if not exists learn_task_log_user_idx on public.learn_task_log (user_id, selected_at desc);
create index if not exists learn_task_log_path_idx on public.learn_task_log (path_id, selected_at desc);

alter table public.learn_task_log enable row level security;

drop policy if exists "learn_task_log_select_own" on public.learn_task_log;
create policy "learn_task_log_select_own"
  on public.learn_task_log for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "learn_task_log_insert_own" on public.learn_task_log;
create policy "learn_task_log_insert_own"
  on public.learn_task_log for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "learn_task_log_update_own" on public.learn_task_log;
create policy "learn_task_log_update_own"
  on public.learn_task_log for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

comment on table public.learn_task_log is
  'Invariante I8: jede ausgespielte Aufgabe traegt eine in einem Satz zeigbare Begruendung. '
  'Der NOT-BLANK-Check auf reason macht eine Aufgabe ohne Begruendung unspeicherbar.';
