-- ---------------------------------------------------------------------------
-- learn_goals.target_depth — die Zieltiefe als Teil des Ziels (Kapitel 6.3)
--
-- Bisher nahm die Rueckwaertsrechnung ueberall 'apply' an: `assessGoal` hatte einen festen
-- Vorgabewert, und `nextDepthFor` hob ein Konzept automatisch eine Stufe an, sobald es 0.7
-- erreichte. Fuer einen Termin in zwei Tagen ist das falsch herum — dort ist die Tiefe die
-- einzige Stellschraube, die Zeit spart, ohne dass ein Konzept wegfaellt (Leiter des Verzichts:
-- erst flacher, dann weniger).
--
-- Damit die Tiefe das ueberhaupt sein kann, muss sie zum Ziel gehoeren und nicht im Code stehen.
--
-- Vorgabewert 'apply' — genau der bisher fest verdrahtete Wert. Bestandsziele verhalten sich
-- danach exakt wie vorher.
-- ---------------------------------------------------------------------------

alter table public.learn_goals
  add column if not exists target_depth text not null default 'apply'
    check (target_depth in ('recognize', 'apply', 'transfer'));

comment on column public.learn_goals.target_depth is
  'Anwendungstiefe, auf die der Umfang gebracht werden soll. Im Sprint (Termin <= 3 Tage) '
  'auf ''recognize'' gesetzt: erst flacher, dann weniger.';
