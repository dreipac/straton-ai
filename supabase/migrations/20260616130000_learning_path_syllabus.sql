-- Geplanter Lernpfad: Unterthemen + Lernziele pro Kapitel (nach Einstiegstest).

alter table public.learning_paths
  add column if not exists syllabus jsonb not null default '[]'::jsonb;

comment on column public.learning_paths.syllabus is
  'Geordneter Lernplan nach Einstiegstest: [{ "topic": "...", "learningGoal": "..." }, ...]';
