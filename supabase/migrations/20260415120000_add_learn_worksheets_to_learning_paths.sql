alter table public.learning_paths
  add column if not exists learn_worksheets jsonb not null default '[]'::jsonb;

comment on column public.learning_paths.learn_worksheets is
  'Arbeitsblatt-Aufgaben (Fragen) zum Ausdrucken/Ueberschreiben; gleichartig wie learn_flashcards persistiert.';
