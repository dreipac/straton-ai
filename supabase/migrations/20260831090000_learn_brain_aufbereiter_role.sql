-- ============================================================================
-- Siebte Gehirn-Rolle: Aufbereiter
-- ============================================================================
--
-- Ein Arbeitsheft ist eine THEMENQUELLE, keine Wahrheitsquelle: es stellt die Fragen, die gekonnt
-- werden muessen, und beantwortet sie nicht. Bis es diese Rolle gab, wurde diese Luecke bei jeder
-- einzelnen Aufgabe neu gefuellt — im Zweig `posesQuestionOnly` von `production/generateTask.ts`,
-- unsichtbar, jedes Mal moeglicherweise mit einer anderen Antwort, und nirgends stand hinterher,
-- was das Modell als wahr angenommen hatte.
--
-- Der Aufbereiter tut dasselbe EINMAL, im Voraus, und legt das Ergebnis als eigenes,
-- gekennzeichnetes Material ab. Danach gilt Invariante I5 wieder in voller Schaerfe: geprueft wird
-- gegen einen Lehrtext, der vorher da war und den die Person lesen und korrigieren kann.
--
-- Vorbelegung: dasselbe Profil wie der Kartograf. Beide bauen die Grundlage, auf der alles
-- Weitere steht; ein Fehler hier ist an jeder spaeteren Stelle ein Fehler. Deshalb das staerkste
-- vorbelegte Modell und eine Eskalationsstufe darueber.
-- ============================================================================

alter table public.learn_brain_agent_models
  drop constraint if exists learn_brain_agent_models_role_check;

alter table public.learn_brain_agent_models
  add constraint learn_brain_agent_models_role_check check (role in (
    'kartograf',      -- Graph aus Material bauen, Chats Konzepten zuordnen
    'aufbereiter',    -- Arbeitsheft in Lehrstoff verwandeln (Fragen erkennen und beantworten)
    'pruefer',        -- Antworten bewerten, Ursache und Zuversicht liefern
    'generator',      -- Aufgaben, Karten, Arbeitsblaetter erzeugen
    'kontrolleur',    -- Generiertes gegen Quelle pruefen, ggf. gegenloesen
    'konsolidierer',  -- Muster verdichten, Strukturumbau vorschlagen
    'erklaerer'       -- in einem Satz begruenden, warum jetzt diese Aufgabe
  ));

insert into public.learn_brain_agent_models
  (role, provider, model, escalation_provider, escalation_model, max_output_tokens)
values
  ('aufbereiter', 'openai', 'gpt-5.4', 'openai', 'gpt-5.6-sol', 16384)
on conflict (role) do nothing;
