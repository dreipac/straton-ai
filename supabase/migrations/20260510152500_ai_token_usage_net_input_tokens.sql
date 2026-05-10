-- Netto-Input-Tokens fuer Admin/Controlling:
-- `input_tokens` soll den effektiv verrechenbaren Input nach Prompt-Cache-Abzug enthalten.
-- Zusatzspalte fuer Transparenz (wie viel aus Cache kam).

alter table public.ai_token_usage
  add column if not exists cached_input_tokens integer not null default 0
  check (cached_input_tokens >= 0);

comment on column public.ai_token_usage.cached_input_tokens is
  'OpenAI Prompt-Cache-Treffer (usage.prompt_tokens_details.cached_tokens).';
