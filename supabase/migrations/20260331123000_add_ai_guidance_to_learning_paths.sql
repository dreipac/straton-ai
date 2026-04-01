alter table public.learning_paths
  add column if not exists ai_guidance text not null default '';

comment on column public.learning_paths.ai_guidance is 'Optionale Zusatzhinweise des Lernenden an die KI';

alter table public.learning_paths
  drop constraint if exists learning_paths_setup_step_check;

alter table public.learning_paths
  add constraint learning_paths_setup_step_check
  check (setup_step in (1, 2, 3, 4));
