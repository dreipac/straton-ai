-- Thinking-Modus: OpenAI-Staffel pro Abo (Modell 1 bis Token-Budget, danach Modell 2)

alter table public.subscription_plans
  add column if not exists thinking_tier1_openai_model_id text not null default 'gpt-5.4',
  add column if not exists thinking_tier1_token_budget integer not null default 50000,
  add column if not exists thinking_tier2_openai_model_id text not null default 'gpt-5.4-mini';

comment on column public.subscription_plans.thinking_tier1_openai_model_id is
  'Thinking-Modus: erstes OpenAI-Modell pro Tag (bis thinking_tier1_token_budget in subscription_usages.used_tokens).';

comment on column public.subscription_plans.thinking_tier1_token_budget is
  'Thinking-Modus: Nutzungs-Tokens pro Tag (used_tokens), ab dem auf thinking_tier2_openai_model_id gewechselt wird.';

comment on column public.subscription_plans.thinking_tier2_openai_model_id is
  'Thinking-Modus: zweites OpenAI-Modell ab Erreichen des Thinking-Tier-1-Budgets.';

alter table public.subscription_plans drop constraint if exists subscription_plans_thinking_tier_models_check;

alter table public.subscription_plans
  add constraint subscription_plans_thinking_tier_models_check check (
    thinking_tier1_openai_model_id = any (
      array['gpt-5.4', 'gpt-5.4-mini', 'gpt-4o', 'gpt-4o-mini']::text[]
    )
    and thinking_tier2_openai_model_id = any (
      array['gpt-5.4', 'gpt-5.4-mini', 'gpt-4o', 'gpt-4o-mini']::text[]
    )
    and thinking_tier1_token_budget >= 0
  );
