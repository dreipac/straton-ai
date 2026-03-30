-- Gespeicherte Lernkarten (Frage/Antwort) pro Lernpfad
alter table public.learning_paths
  add column if not exists learn_flashcards jsonb not null default '[]'::jsonb;

comment on column public.learning_paths.learn_flashcards is 'Array von { id, question, answer }';
