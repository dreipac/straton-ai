-- ---------------------------------------------------------------------------
-- Invariante I4 wird erzwungen statt angenommen
--
-- Bezug: `straton-gehirn-architektur.md`, Kapitel 1 (I4) und Kapitel 3.
--
--   „Jedes Wissensatom traegt eine Herkunftsmarkierung (Quelldokument und Stelle, oder
--    KI-ergaenzt). Pruefungsrealitaet und Halluzinationsschutz. Ohne Quelle keine Pruefbarkeit."
--
-- Ausgangslage vor dieser Migration:
--   `learn_concepts.origin` trug den Default 'material' und `source_quote` den Default ''.
--   Der Bestands-Schreibpfad (`saveConceptGraph`) setzte beide Spalten gar nicht. Damit behauptete
--   JEDES so angelegte Konzept Materialherkunft, ohne dafuer einen Beleg zu haben. Ein Nutzer, der
--   vor einer Pruefung wissen will, was aus seinem Skript stammt und was die KI ergaenzt hat,
--   bekam eine Antwort, die nicht gedeckt war — der Sinn von I4 war damit aufgehoben, obwohl die
--   Spalte existierte.
--
-- Diese Migration macht dreierlei:
--   1. Sie fuehrt `unknown` als Altbestandswert ein und stempelt die betroffenen Zeilen ehrlich um.
--   2. Sie nimmt `origin` den Default, damit ein Schreibvorgang ohne Herkunft fehlschlaegt,
--      statt still eine zu erfinden.
--   3. Sie verbietet `material` ohne Beleg per Constraint.
--
-- Warum `unknown` und nicht einfach 'ai_supplement': die Herkunft der Bestandszeilen ist
-- nachtraeglich nicht rekonstruierbar. Sie als KI-Ergaenzung zu fuehren waere genauso eine
-- Behauptung wie 'material' — nur in die andere Richtung. Ein eingestandenes Nichtwissen ist der
-- einzige Wert, der hier stimmt. Die Oberflaeche zeigt ihn als „Herkunft nicht belegt".
--
-- `unknown` ist ausdruecklich KEIN vierter regulaerer Fall: der Kartografenvertrag verwirft ihn,
-- `setConceptOrigin` lehnt ihn ab, und neu angelegte Konzepte koennen ihn nicht bekommen.
-- ---------------------------------------------------------------------------

-- 1 — Wertebereich erweitern, bevor umgestempelt wird.
alter table public.learn_concepts
  drop constraint if exists learn_concepts_origin_check;
alter table public.learn_concepts
  add constraint learn_concepts_origin_check
    check (origin in ('material', 'ai_supplement', 'user', 'unknown'));

-- 2 — Bestandszeilen ehrlich machen: Materialherkunft ohne Beleg ist keine Materialherkunft.
update public.learn_concepts
   set origin = 'unknown'
 where origin = 'material'
   and coalesce(trim(source_quote), '') = '';

-- 3 — Kein Default mehr. Wer ein Konzept schreibt, sagt woher es stammt.
alter table public.learn_concepts
  alter column origin drop default;

-- 4 — Der Constraint, der die eigentliche Regel traegt.
--
-- Absichtlich nur fuer 'material' formuliert: 'ai_supplement' und 'user' brauchen keinen Beleg
-- aus dem Quelldokument, sie sind selbst die Aussage ueber ihre Herkunft. Nur wer sich auf das
-- Material beruft, muss die Stelle nennen koennen.
alter table public.learn_concepts
  drop constraint if exists learn_concepts_material_needs_quote;
alter table public.learn_concepts
  add constraint learn_concepts_material_needs_quote
    check (origin <> 'material' or length(trim(source_quote)) > 0);

comment on column public.learn_concepts.origin is
  'Invariante I4: Herkunft des Wissensatoms. material = aus dem Quelldokument (verlangt einen '
  'Beleg in source_quote), ai_supplement = KI-ergaenzt (muss in der UI unterscheidbar bleiben), '
  'user = Handkorrektur, unknown = Altbestand vor der Erzwingung, Herkunft nicht rekonstruierbar. '
  'Kein Default: ein Schreibvorgang ohne Herkunft soll fehlschlagen, nicht raten.';

comment on column public.learn_concepts.source_quote is
  'Woertlicher Beleg aus dem Quelldokument. Pflicht bei origin = material (Constraint '
  'learn_concepts_material_needs_quote); source_ref haelt die Koordinaten dazu.';
