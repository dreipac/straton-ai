-- Abo Tages-Staffel: GPT-4 (gpt-4o) und GPT-4 mini (gpt-4o-mini) für Tier 1 / Tier 2

alter table public.subscription_plans drop constraint if exists subscription_plans_chat_daily_tier_models_check;

alter table public.subscription_plans
  add constraint subscription_plans_chat_daily_tier_models_check check (
    chat_daily_tier1_openai_model_id = any (
      array['gpt-5.4', 'gpt-5.4-mini', 'gpt-4o', 'gpt-4o-mini']::text[]
    )
    and chat_daily_tier2_openai_model_id = any (
      array['gpt-5.4', 'gpt-5.4-mini', 'gpt-4o', 'gpt-4o-mini']::text[]
    )
    and chat_daily_tier1_token_budget >= 0
  );

comment on column public.subscription_plans.chat_daily_tier1_openai_model_id is
  'OpenAI-Hauptchat: erstes Modell pro Tag (gpt-5.4, gpt-5.4-mini, gpt-4o, gpt-4o-mini), bis tier1_token_budget verbraucht.';

comment on column public.subscription_plans.chat_daily_tier2_openai_model_id is
  'OpenAI-Hauptchat: zweites Modell ab Erreichen des Tier-1-Budgets (gpt-5.4, gpt-5.4-mini, gpt-4o, gpt-4o-mini).';
