-- Gemini Instant: Provider in ai_token_usage erlauben (Insert schlug sonst still fehl).

alter table public.ai_token_usage
  drop constraint if exists ai_token_usage_provider_check;

alter table public.ai_token_usage
  add constraint ai_token_usage_provider_check
  check (provider in ('openai', 'anthropic', 'gemini'));

comment on column public.ai_token_usage.provider is
  'KI-Provider: openai, anthropic, gemini (Edge chat-completion).';
