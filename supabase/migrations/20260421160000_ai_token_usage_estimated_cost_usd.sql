-- Geschaetzte API-Kosten pro Zeile (Listenpreise USD), fuer Budget-Schwelle (z. B. Wechsel auf guenstigeres OpenAI-Modell).

alter table public.ai_token_usage
  add column if not exists estimated_cost_usd numeric(14, 8) not null default 0;

comment on column public.ai_token_usage.estimated_cost_usd is 'Geschaetzte API-Kosten in USD (Edge Function), fuer Kumulation pro Nutzer.';

create or replace function public.sum_user_ai_estimated_cost_usd(p_user_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(estimated_cost_usd), 0)::numeric
  from public.ai_token_usage
  where user_id = p_user_id;
$$;

comment on function public.sum_user_ai_estimated_cost_usd(uuid) is 'Summe geschaetzter KI-Kosten (USD) fuer Budget-Logik in chat-completion.';

grant execute on function public.sum_user_ai_estimated_cost_usd(uuid) to service_role;
