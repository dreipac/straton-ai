-- Pro Abo: OpenAI-Hauptchat Tages-Staffel (Modell 1 bis Token-Budget, danach Modell 2)

alter table public.subscription_plans
  add column if not exists chat_daily_tier1_openai_model_id text not null default 'gpt-5.4',
  add column if not exists chat_daily_tier1_token_budget integer not null default 50000,
  add column if not exists chat_daily_tier2_openai_model_id text not null default 'gpt-5.4-mini';

comment on column public.subscription_plans.chat_daily_tier1_openai_model_id is
  'OpenAI-Hauptchat: erstes Modell pro Tag (gpt-5.4 oder gpt-5.4-mini), bis tier1_token_budget verbraucht.';
comment on column public.subscription_plans.chat_daily_tier1_token_budget is
  'Nutzer subscription_usages.used_tokens: unterhalb = Tier 1, ab Schwelle = Tier 2 (gleicher Kalendertag).';
comment on column public.subscription_plans.chat_daily_tier2_openai_model_id is
  'OpenAI-Hauptchat: zweites Modell ab Erreichen des Tier-1-Budgets.';

alter table public.subscription_plans drop constraint if exists subscription_plans_chat_daily_tier_models_check;

alter table public.subscription_plans
  add constraint subscription_plans_chat_daily_tier_models_check check (
    chat_daily_tier1_openai_model_id = any (array['gpt-5.4', 'gpt-5.4-mini']::text[])
    and chat_daily_tier2_openai_model_id = any (array['gpt-5.4', 'gpt-5.4-mini']::text[])
    and chat_daily_tier1_token_budget >= 0
  );
