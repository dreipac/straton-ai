-- Fortschrittsmodell-Konsolidierung Schritt 1: skillMasteryBySkillId war schon vorher de facto
-- pfad-global (wird von Kapitel-Modus, Landkarte-Modus UND Arbeitsblaettern gemeinsam beschrieben),
-- lag aber zufaellig verschachtelt in chapter_session. Eigene Spalte + einmaliger Backfill aus den
-- bisherigen chapter_session-Daten, damit kein bereits erarbeiteter Fortschritt verloren geht.

alter table public.learning_paths
  add column if not exists skill_mastery_by_skill_id jsonb not null default '{}'::jsonb;

update public.learning_paths
set skill_mastery_by_skill_id = chapter_session -> 'skillMasteryBySkillId'
where coalesce(skill_mastery_by_skill_id, '{}'::jsonb) = '{}'::jsonb
  and chapter_session ? 'skillMasteryBySkillId'
  and jsonb_typeof(chapter_session -> 'skillMasteryBySkillId') = 'object';

comment on column public.learning_paths.skill_mastery_by_skill_id is
  'Pfad-globale Skill-Mastery (EWMA je Skill-Tag), unabhaengig vom Kapitel-/Landkarte-Modus. '
  'chapter_session.skillMasteryBySkillId bleibt als Altlast in bestehenden Zeilen erhalten, wird aber '
  'von der App nicht mehr geschrieben oder gelesen.';
