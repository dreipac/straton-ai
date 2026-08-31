-- ---------------------------------------------------------------------------
-- Unterbrochene Sitzung — genau dort weitermachen, wo geschlossen wurde.
--
-- ABGRENZUNG zu `learn_review_stock` (Kapitel 7.1): dort steht ausdruecklich, dass Pfadaufgaben
-- bewusst KEINE Tabelle bekommen, weil sie in Echtzeit entstehen muessen. Diese Tabelle bricht das
-- nicht, sie sichert es ab. Der Unterschied liegt im Zeitpunkt der ERZEUGUNG, nicht der Ablage:
--
--   Vorrat        Aufgaben werden erzeugt, BEVOR jemand sie braucht, und fuer wechselnde Lagen
--                 wiederverwendet. Genau das verbietet die Echtzeitregel.
--   Unterbrechung Die Aufgaben hier wurden bereits in Echtzeit erzeugt — fuer diese Person, diese
--                 Sitzung, diesen Stand des Lernerbilds. Sie liegen nur zwischen zwei Aufrufen der
--                 Seite. Es entsteht nichts Neues; es wird lediglich nichts weggeworfen.
--
-- Ohne diese Tabelle kostet jedes Verlassen der Sitzung den gesamten Plan: die Person landet beim
-- Wiederkommen bei einer neu erzeugten Aufgabe, wartet erneut, und der Betreiber zahlt die
-- Modellaufrufe ein zweites Mal.
--
-- Genau EINE offene Sitzung je (Person x Lernpfad) — der Primaerschluessel setzt das durch. Eine
-- zweite offene Sitzung im selben Pfad waere kein Zustand, den die Oberflaeche darstellen koennte.
--
-- Beantwortete Aufgaben sind hier NICHT gespeichert: sie liegen laengst in `learn_evidence_events`
-- und den Lernerbildern. Diese Zeile faellt beim Abschluss oder Abbruch der Sitzung ersatzlos weg.
-- ---------------------------------------------------------------------------

create table if not exists public.learn_brain_session (
  user_id uuid not null references auth.users (id) on delete cascade,
  path_id uuid not null references public.learning_paths (id) on delete cascade,

  -- Der beim Start festgeschriebene Sitzungsplan (PlannedTask[]). Er darf sich waehrend der
  -- Sitzung nicht mehr aendern (Kapitel 4.2) — auch eine Unterbrechung aendert ihn nicht.
  plan jsonb not null default '[]'::jsonb,

  -- Die bereits freigegebenen Aufgaben, nach Platz: { "0": {...}, "1": {...} }.
  -- Jede davon hat den Torwaechter I5 zum Zeitpunkt ihrer Erzeugung durchlaufen.
  tasks jsonb not null default '{}'::jsonb,

  -- Der Platz, an dem die Person steht.
  current_index integer not null default 0 check (current_index >= 0),

  -- Die Lernerbilder VOR der Sitzung (LearnerConceptImage[]) und die bereits verbuchten
  -- Evidenzereignisse (EvidenceEvent[]). Beide nur fuer die Abschlussbilanz (Kapitel 4.9): ohne
  -- sie zeigte eine fortgesetzte Sitzung am Ende nur den Fortschritt SEIT dem Wiederkommen und
  -- unterschlaege die Aufgaben davor.
  images_before jsonb not null default '[]'::jsonb,
  events jsonb not null default '[]'::jsonb,

  -- Der Beginn der urspruenglichen Sitzung, nicht der Fortsetzung — die Bilanz nennt die Dauer.
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, path_id),
  constraint learn_brain_session_plan_is_array check (jsonb_typeof(plan) = 'array'),
  constraint learn_brain_session_tasks_is_object check (jsonb_typeof(tasks) = 'object'),
  constraint learn_brain_session_images_is_array check (jsonb_typeof(images_before) = 'array'),
  constraint learn_brain_session_events_is_array check (jsonb_typeof(events) = 'array')
);

create index if not exists learn_brain_session_user_idx on public.learn_brain_session (user_id);

alter table public.learn_brain_session enable row level security;

drop policy if exists "learn_brain_session_select_own" on public.learn_brain_session;
create policy "learn_brain_session_select_own"
  on public.learn_brain_session for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "learn_brain_session_insert_own" on public.learn_brain_session;
create policy "learn_brain_session_insert_own"
  on public.learn_brain_session for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "learn_brain_session_update_own" on public.learn_brain_session;
create policy "learn_brain_session_update_own"
  on public.learn_brain_session for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "learn_brain_session_delete_own" on public.learn_brain_session;
create policy "learn_brain_session_delete_own"
  on public.learn_brain_session for delete to authenticated
  using (user_id = (select auth.uid()));

comment on table public.learn_brain_session is
  'Eine unterbrochene Lernsitzung je (Person x Lernpfad): Plan, bereits freigegebene Aufgaben und '
  'Position. Kein Aufgabenvorrat — die Aufgaben wurden in Echtzeit erzeugt und werden hier nur '
  'ueber den Seitenwechsel gerettet. Wird beim Abschluss oder Abbruch geloescht.';
