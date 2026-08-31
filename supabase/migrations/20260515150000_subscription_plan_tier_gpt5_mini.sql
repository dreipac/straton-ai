-- Abo-Staffeln (Hauptchat + Thinking) und optionaler Default-Composer: GPT-5 mini ergänzen

alter table public.subscription_plans drop constraint if exists subscription_plans_chat_daily_tier_models_check;

alter table public.subscription_plans
  add constraint subscription_plans_chat_daily_tier_models_check check (
    chat_daily_tier1_openai_model_id = any (
      array['gpt-5.4', 'gpt-5.4-mini', 'gpt-5-mini', 'gpt-4o', 'gpt-4o-mini']::text[]
    )
    and chat_daily_tier2_openai_model_id = any (
      array['gpt-5.4', 'gpt-5.4-mini', 'gpt-5-mini', 'gpt-4o', 'gpt-4o-mini']::text[]
    )
    and chat_daily_tier1_token_budget >= 0
  );

alter table public.subscription_plans drop constraint if exists subscription_plans_thinking_tier_models_check;

alter table public.subscription_plans
  add constraint subscription_plans_thinking_tier_models_check check (
    thinking_tier1_openai_model_id = any (
      array['gpt-5.4', 'gpt-5.4-mini', 'gpt-5-mini', 'gpt-4o', 'gpt-4o-mini']::text[]
    )
    and thinking_tier2_openai_model_id = any (
      array['gpt-5.4', 'gpt-5.4-mini', 'gpt-5-mini', 'gpt-4o', 'gpt-4o-mini']::text[]
    )
    and thinking_tier1_token_budget >= 0
  );

alter table public.subscription_plans drop constraint if exists subscription_plans_default_chat_model_id_check;

alter table public.subscription_plans
  add constraint subscription_plans_default_chat_model_id_check check (
    default_chat_model_id is null
    or default_chat_model_id = any (
      array[
        'gpt-5.4',
        'gpt-5.4-mini',
        'gpt-5-mini',
        'gpt-4o-mini',
        'claude-sonnet-4-6',
        'claude-opus-4-7'
      ]::text[]
    )
  );

comment on column public.subscription_plans.chat_daily_tier1_openai_model_id is
  'OpenAI-Hauptchat: erstes Modell pro Tag (gpt-5.4, gpt-5.4-mini, gpt-5-mini, gpt-4o, gpt-4o-mini), bis tier1_token_budget verbraucht.';

comment on column public.subscription_plans.chat_daily_tier2_openai_model_id is
  'OpenAI-Hauptchat: zweites Modell ab Erreichen des Tier-1-Budgets (gpt-5.4, gpt-5.4-mini, gpt-5-mini, gpt-4o, gpt-4o-mini).';
