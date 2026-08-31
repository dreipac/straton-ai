-- ---------------------------------------------------------------------------
-- Zustaendigkeitsgrenze Wiederholung gegen Pfad (Kapitel 6.7, neu in 1.1)
--
--   „Ein nie gelerntes Konzept kann nicht verfallen und erscheint in der Wiederholung nie."
--   „Eine verpatzte Wiederholung senkt die Beherrschung und kann ein Konzept zurueck in den
--    Pfad befoerdern."
--
-- Beide Saetze zusammen verlangen eine Angabe, die der aktuelle Beherrschungswert nicht liefern
-- kann: War dieses Konzept schon einmal gefestigt?
--
-- Aus dem aktuellen Wert abgeleitet waere die Antwort falsch, sobald Verfall im Spiel ist — und
-- Verfall ist genau der Ausloeser, um den es hier geht. Ein Konzept, das vor sieben Wochen sass
-- und seither verblasst ist, faellt sonst aus BEIDEN Oberflaechen: aus dem Stapel, weil sein Wert
-- zu tief steht, und aus dem Pfad, weil dort nichts schiefging. Es verschwaende lautlos.
--
-- Deshalb ein eigenes Feld. Es wird ausschliesslich durch direkte Evidenz gesetzt (I1) und nie
-- zurueckgenommen: die Aussage lautet „war schon einmal da", nicht „ist gerade da".
-- ---------------------------------------------------------------------------

alter table public.learner_concept_brain_states
  add column if not exists ever_consolidated boolean not null default false;

comment on column public.learner_concept_brain_states.ever_consolidated is
  'Kapitel 6.7: War dieses Konzept schon einmal gefestigt (Beherrschung >= 0.7)? Steuert, ob es '
  'in den Wiederholungsstapel darf. Wird nur durch direkte Evidenz gesetzt und nie '
  'zurueckgenommen — die Frage „war es je da" darf der Verfall nicht beantworten.';

-- Bestandszeilen: was heute ueber der Festigungsschwelle steht, war offensichtlich einmal dort.
-- Der umgekehrte Fall (frueher gefestigt, inzwischen verfallen) ist nicht rekonstruierbar; diese
-- Konzepte tauchen beim naechsten erfolgreichen Durchgang von selbst wieder im Stapel auf.
update public.learner_concept_brain_states
   set ever_consolidated = true
 where mastery >= 0.7
   and ever_consolidated = false;
