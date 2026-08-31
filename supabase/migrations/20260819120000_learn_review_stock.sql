-- ---------------------------------------------------------------------------
-- Vorratserzeugung fuer Wiederholungsabfragen (Kapitel 7.1, neu in 1.1)
--
--   „Fuer den Wiederholungsstapel gilt Echtzeit NICHT. Dort wird ein kleiner Vorrat pro Konzept
--    vorgehalten und rotierend ausgespielt; er wird neu erzeugt, sobald sich im Lernerbild
--    dieses Konzepts etwas geaendert hat."
--
-- Dies ist die einzige Ausnahme von der Echtzeitregel und gilt ausschliesslich fuer den Stapel.
-- Alle Aufgaben im Pfad bleiben Echtzeit — dafuer gibt es hier bewusst keine Tabelle.
--
-- Warum der Vorrat ueberhaupt persistiert wird: haelt man ihn nur im Speicher, entsteht er bei
-- jedem Seitenaufruf neu, und der Nutzer wartet genau dort, wo Tempo das ganze Produkterlebnis
-- ist. Ein Vorrat, der einen Seitenwechsel nicht ueberlebt, ist keiner.
--
-- `fingerprint` ist der Stand des Lernerbilds, AUS DEM heraus die Abfragen entstanden. Weicht er
-- vom aktuellen Stand ab, ist der Vorrat ueberholt und wird verworfen. Der Verfall geht bewusst
-- NICHT ein: er laeuft kontinuierlich weiter und wuerde jeden Vorrat sofort entwerten.
-- ---------------------------------------------------------------------------

create table if not exists public.learn_review_stock (
  user_id uuid not null references auth.users (id) on delete cascade,
  concept_id uuid not null references public.learn_concepts (id) on delete cascade,

  -- Die vorgehaltenen Abfragen samt Ausspielzaehler:
  -- [{ "task": {...}, "timesServed": 0 }, ...]
  items jsonb not null default '[]'::jsonb,

  fingerprint text not null,
  rotation integer not null default 0 check (rotation >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, concept_id),
  constraint learn_review_stock_items_is_array check (jsonb_typeof(items) = 'array'),
  constraint learn_review_stock_fingerprint_not_blank check (length(trim(fingerprint)) > 0)
);

create index if not exists learn_review_stock_user_idx on public.learn_review_stock (user_id);

alter table public.learn_review_stock enable row level security;

drop policy if exists "learn_review_stock_select_own" on public.learn_review_stock;
create policy "learn_review_stock_select_own"
  on public.learn_review_stock for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "learn_review_stock_insert_own" on public.learn_review_stock;
create policy "learn_review_stock_insert_own"
  on public.learn_review_stock for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "learn_review_stock_update_own" on public.learn_review_stock;
create policy "learn_review_stock_update_own"
  on public.learn_review_stock for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "learn_review_stock_delete_own" on public.learn_review_stock;
create policy "learn_review_stock_delete_own"
  on public.learn_review_stock for delete to authenticated
  using (user_id = (select auth.uid()));

comment on table public.learn_review_stock is
  'Kapitel 7.1: kleiner Abfragenvorrat je Konzept fuer den Wiederholungsstapel — die einzige '
  'Ausnahme von der Echtzeiterzeugung. Pfadaufgaben haben hier bewusst keinen Platz.';
