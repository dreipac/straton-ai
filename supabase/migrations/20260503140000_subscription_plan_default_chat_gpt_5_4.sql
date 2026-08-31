-- Abo-Festmodell: Composer-ID «gpt-5.4» (volles GPT-5.4) erlauben

alter table public.subscription_plans drop constraint if exists subscription_plans_default_chat_model_id_check;

alter table public.subscription_plans
  add constraint subscription_plans_default_chat_model_id_check check (
    default_chat_model_id is null
    or default_chat_model_id = any (
      array['gpt-5.4', 'gpt-5.4-mini', 'claude-sonnet-4-6', 'claude-opus-4-7']::text[]
    )
  );

comment on column public.subscription_plans.default_chat_model_id is
  'Composer-ID bei gesperrter Auswahl (gpt-5.4, gpt-5.4-mini, claude-sonnet-4-6, claude-opus-4-7).';
