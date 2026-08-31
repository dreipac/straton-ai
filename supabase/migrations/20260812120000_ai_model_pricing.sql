-- Credits-System Schritt 1/5: eine einzige Preistabelle statt der bisherigen drei hart codierten
-- Kopien (src/features/auth/utils/aiModelPricing.ts, supabase/functions/chat-completion/index.ts
-- `openAiRatesForEstimate`/`anthropicRatesForEstimate`/`geminiRatesForEstimate`,
-- supabase/functions/generate-chat-image/index.ts `estimateGptImageUsageUsd`).
-- Siehe credits-system-plan.md Abschnitt 2.6.

create table if not exists public.ai_model_pricing (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('openai', 'anthropic', 'gemini')),
  -- 'exact': lower(model) = lower(pattern); 'contains': lower(model) like %pattern%.
  match_type text not null default 'contains' check (match_type in ('exact', 'contains')),
  -- Leerstring ist erlaubt und bedeutet "matcht jedes Modell" (universeller Fallback, siehe Seed unten).
  pattern text not null,
  -- Optionaler Ausschluss, z. B. 'gpt-4o' matcht nicht, wenn Modellname zusätzlich 'mini' enthält.
  exclude_pattern text,
  input_usd_per_million numeric(10, 4) not null check (input_usd_per_million >= 0),
  output_usd_per_million numeric(10, 4) not null check (output_usd_per_million >= 0),
  -- Niedrigere Zahl = wird zuerst geprüft (spezifische Muster vor allgemeinen).
  priority integer not null default 100,
  notes text,
  updated_at timestamptz not null default now(),
  constraint ai_model_pricing_unique unique (provider, match_type, pattern)
);

comment on table public.ai_model_pricing is
  'Zentrale Modell-zu-USD-Preistabelle für Kosten-/Credits-Schätzung. Einzige Quelle für Edge Functions '
  '(chat-completion, generate-chat-image) und Admin-UI, ersetzt die zuvor dreifach duplizierten '
  'hart codierten Tarif-Tabellen.';

create index if not exists ai_model_pricing_provider_priority_idx
  on public.ai_model_pricing (provider, priority);

alter table public.ai_model_pricing enable row level security;

-- Lesbar für alle angemeldeten Nutzer (Admin-Dashboard-Anzeige, künftige Kosten-Transparenz).
create policy "ai_model_pricing_select_authenticated"
  on public.ai_model_pricing
  for select
  to authenticated
  using (true);

create policy "ai_model_pricing_insert_superadmin"
  on public.ai_model_pricing
  for insert
  to authenticated
  with check (
    coalesce((select p.is_superadmin from public.profiles p where p.id = (select auth.uid())), false) = true
  );

create policy "ai_model_pricing_update_superadmin"
  on public.ai_model_pricing
  for update
  to authenticated
  using (
    coalesce((select p.is_superadmin from public.profiles p where p.id = (select auth.uid())), false) = true
  )
  with check (
    coalesce((select p.is_superadmin from public.profiles p where p.id = (select auth.uid())), false) = true
  );

create policy "ai_model_pricing_delete_superadmin"
  on public.ai_model_pricing
  for delete
  to authenticated
  using (
    coalesce((select p.is_superadmin from public.profiles p where p.id = (select auth.uid())), false) = true
  );

-- Seed: 1:1 aus den drei bisherigen hart codierten Tabellen übernommen (Reihenfolge der bisherigen
-- `??`-Ketten in der Priority nachgebildet — spezifisch vor allgemein).
insert into public.ai_model_pricing
  (provider, match_type, pattern, exclude_pattern, input_usd_per_million, output_usd_per_million, priority, notes)
values
  ('openai', 'contains', 'gpt-image-2', null, 5, 10, 10, 'Bildgenerierung'),
  ('openai', 'contains', 'gpt-image-1', null, 5, 8.5, 20, 'Bildgenerierung'),
  ('openai', 'contains', 'gpt-4o-mini', null, 0.15, 0.6, 30, null),
  ('openai', 'contains', 'gpt-4o-2024-05-13', null, 5, 15, 40, null),
  ('openai', 'contains', 'gpt-4o', 'mini', 2.5, 10, 50, null),
  ('openai', 'contains', 'gpt-5-nano', null, 0.05, 0.4, 60, null),
  ('openai', 'exact', 'gpt-5.4', null, 4, 16, 70, null),
  ('openai', 'contains', 'gpt-5.4-mini', null, 0.75, 4.5, 80, null),
  ('openai', 'contains', 'gpt-5-mini', null, 0.25, 2, 90, null),
  ('openai', 'contains', 'gpt-5-pro', null, 15, 120, 100, null),
  ('openai', 'contains', 'gpt-5', null, 1.25, 10, 110, 'Fallback für alle übrigen gpt-5*-Varianten'),
  ('openai', 'contains', 'gpt-4.1-nano', null, 0.1, 0.4, 120, null),
  ('openai', 'contains', 'gpt-4.1-mini', null, 0.4, 1.6, 130, null),
  ('openai', 'contains', 'gpt-4.1', null, 2, 8, 140, null),
  ('openai', 'contains', 'o4-mini', null, 1.1, 4.4, 150, null),
  ('openai', 'contains', 'o3-mini', null, 1.1, 4.4, 160, null),
  ('openai', 'contains', 'o1-mini', null, 1.1, 4.4, 170, null),
  ('openai', 'contains', 'gpt-3.5-turbo', null, 0.5, 1.5, 180, null),
  ('anthropic', 'contains', 'opus', null, 15, 75, 10, null),
  ('anthropic', 'contains', 'haiku', null, 0.8, 4, 20, null),
  ('anthropic', 'contains', 'claude', null, 3, 15, 30, 'Fallback für Sonnet/übrige Claude-Modelle'),
  ('anthropic', 'contains', 'sonnet', null, 3, 15, 31, null),
  ('gemini', 'contains', 'flash-lite', null, 0.25, 1.5, 10, null),
  ('gemini', 'contains', '3.1-flash-lite', null, 0.25, 1.5, 11, null),
  ('gemini', 'contains', '2.5-flash', null, 0.3, 2.5, 20, null),
  ('gemini', 'contains', 'flash', null, 0.3, 2.5, 30, 'Fallback für übrige Flash-Varianten')
on conflict (provider, match_type, pattern) do nothing;

-- Gemini-Fallback ohne Treffer (bisherige JS-Logik: `return { inPerM: 0.25, outPerM: 1.5 }` als
-- absoluter Default, wenn nichts anderes matcht) — als sehr niedrig priorisierte Catch-all-Zeile.
insert into public.ai_model_pricing
  (provider, match_type, pattern, exclude_pattern, input_usd_per_million, output_usd_per_million, priority, notes)
values
  ('gemini', 'contains', '', null, 0.25, 1.5, 1000, 'Absoluter Fallback ohne spezifischeren Treffer')
on conflict (provider, match_type, pattern) do nothing;

-- 1 Credit = 0,001 USD (siehe credits-system-plan.md 2.6). Eigene Funktion statt verstreuter
-- Literale, damit der Kurs an einer Stelle im Schema steht.
create or replace function public.credits_per_usd()
returns integer
language sql
immutable
as $$
  select 1000;
$$;

comment on function public.credits_per_usd() is
  'Umrechnungskurs USD -> Credits (1 Credit = 1/credits_per_usd() USD). Einzige Quelle, siehe credits-system-plan.md.';

create or replace function public.estimate_ai_cost_usd(
  p_provider text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer
)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(
    (
      select
        (greatest(0, p_input_tokens) / 1000000.0) * mp.input_usd_per_million
        + (greatest(0, p_output_tokens) / 1000000.0) * mp.output_usd_per_million
      from public.ai_model_pricing mp
      where mp.provider = p_provider
        and (
          (mp.match_type = 'exact' and lower(coalesce(p_model, '')) = lower(mp.pattern))
          or (
            mp.match_type = 'contains'
            and lower(coalesce(p_model, '')) like '%' || lower(mp.pattern) || '%'
          )
        )
        and (
          mp.exclude_pattern is null
          or lower(coalesce(p_model, '')) not like '%' || lower(mp.exclude_pattern) || '%'
        )
      order by mp.priority asc
      limit 1
    ),
    0
  );
$$;

comment on function public.estimate_ai_cost_usd(text, text, integer, integer) is
  'Geschätzte USD-Kosten für ein Modell anhand ai_model_pricing (Provider + Musterabgleich, spezifisch vor allgemein). 0, wenn kein Preis hinterlegt ist.';

create or replace function public.estimate_ai_credits(
  p_provider text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer
)
returns integer
language sql
stable
set search_path = public
as $$
  select ceil(
    public.estimate_ai_cost_usd(p_provider, p_model, p_input_tokens, p_output_tokens)
    * public.credits_per_usd()
  )::integer;
$$;

comment on function public.estimate_ai_credits(text, text, integer, integer) is
  'estimate_ai_cost_usd(...) in Credits umgerechnet (aufgerundet).';

-- Vorab-Schätzung ohne Modellkenntnis, für den Budget-Vorab-Check bevor die KI aufgerufen wird:
-- nimmt den teuersten bekannten Tarif (worst case), damit die Prüfung nie zu niedrig ausfällt.
create or replace function public.estimate_reservation_credits(p_content text)
returns integer
language plpgsql
stable
set search_path = public
as $$
declare
  msg_tokens integer;
  worst_rate_per_million numeric;
begin
  msg_tokens := public.estimate_tokens_from_text(p_content);

  select coalesce(max(greatest(input_usd_per_million, output_usd_per_million)), 0)
  into worst_rate_per_million
  from public.ai_model_pricing;

  return ceil(
    (msg_tokens / 1000000.0) * worst_rate_per_million * public.credits_per_usd()
  )::integer;
end;
$$;

comment on function public.estimate_reservation_credits(text) is
  'Konservative Vorab-Schätzung (teuerster bekannter Tarif) für den Budget-Vorab-Check vor dem KI-Aufruf, siehe check_ai_credits_available().';

grant execute on function public.credits_per_usd() to authenticated, service_role;
grant execute on function public.estimate_ai_cost_usd(text, text, integer, integer) to authenticated, service_role;
grant execute on function public.estimate_ai_credits(text, text, integer, integer) to authenticated, service_role;
grant execute on function public.estimate_reservation_credits(text) to authenticated, service_role;
