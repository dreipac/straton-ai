-- Pro Abo: Nutzer dürfen Chat-KI-Modell wählen oder festes Standard-Modell

alter table public.subscription_plans
  add column if not exists chat_allow_model_choice boolean not null default true;

alter table public.subscription_plans
  add column if not exists default_chat_model_id text;

comment on column public.subscription_plans.chat_allow_model_choice is
  'true: Nutzer wählt Modell im Chat; false: immer default_chat_model_id.';

comment on column public.subscription_plans.default_chat_model_id is
  'Composer-ID bei gesperrter Auswahl (gpt-5.4-mini, claude-sonnet-4-6, claude-opus-4-7).';

alter table public.subscription_plans drop constraint if exists subscription_plans_default_chat_model_id_check;

alter table public.subscription_plans
  add constraint subscription_plans_default_chat_model_id_check check (
    default_chat_model_id is null
    or default_chat_model_id = any (
      array['gpt-5.4-mini', 'claude-sonnet-4-6', 'claude-opus-4-7']::text[]
    )
  );
