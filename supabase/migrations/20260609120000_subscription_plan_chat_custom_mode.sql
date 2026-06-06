-- Custom-Modus im Chat: Intent Analyze wie Smart Instant, Modellwahl im Composer.

alter table public.subscription_plans
  add column if not exists chat_allow_custom_mode boolean not null default false;

comment on column public.subscription_plans.chat_allow_custom_mode is
  'Abo: Custom-Modus im Chat (Intent Analyze + freie Modellwahl im Composer).';
