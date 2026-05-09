-- Tutor-Orchestrierung für sequenzielle Kapitelsteuerung

alter table public.learning_paths
  add column if not exists tutor_state text not null default 'entry_quiz_pending'
    check (tutor_state in ('entry_quiz_pending', 'entry_quiz_done', 'chapter_learning', 'chapter_completed')),
  add column if not exists current_chapter_index integer not null default 0,
  add column if not exists target_chapter_count smallint not null default 1,
  add column if not exists unlocked_chapter_count smallint not null default 1;

