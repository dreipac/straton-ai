alter table public.learning_paths
add column if not exists proficiency_level text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'learning_paths_proficiency_level_check'
      and conrelid = 'public.learning_paths'::regclass
  ) then
    alter table public.learning_paths
      add constraint learning_paths_proficiency_level_check
      check (proficiency_level in ('', 'low', 'medium', 'high'));
  end if;
end
$$;

alter table public.learning_paths
drop constraint if exists learning_paths_setup_step_check;

alter table public.learning_paths
add constraint learning_paths_setup_step_check
check (setup_step in (1, 2, 3));
