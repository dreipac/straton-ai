-- Credits-System Schritt 2/5: neuer gemeinsamer "KI-Credits"-Pool für Chat + Denken, ersetzt die bisher
-- getrennten Token- und Thinking-Felder (siehe credits-system-plan.md Abschnitt 2.3/2.5).
-- Bewusst additiv: max_tokens/instant_token_*/thinking_* bleiben vorerst bestehen (nicht mehr von der
-- Enforcement-Logik gelesen, siehe Folgemigrationen), damit die Umstellung rückverfolgbar bleibt.

alter table public.subscription_plans
  add column if not exists ai_credits_daily_grant integer,
  add column if not exists ai_credits_start_balance integer not null default 0,
  add column if not exists ai_credits_balance_max integer not null default 0;

comment on column public.subscription_plans.ai_credits_daily_grant is
  'Tägliches KI-Credits-Kontingent (Chat + Denken zusammen), kostenbasiert. NULL = unbegrenzt.';
comment on column public.subscription_plans.ai_credits_start_balance is
  'KI-Credits-Startguthaben bei Abo-Zuweisung (gecappt mit ai_credits_balance_max).';
comment on column public.subscription_plans.ai_credits_balance_max is
  'Maximal ansparbares KI-Credits-Guthaben (Übertrag/Carryover-Deckel).';

alter table public.subscription_plans drop constraint if exists subscription_plans_ai_credits_daily_grant_bounds;
alter table public.subscription_plans
  add constraint subscription_plans_ai_credits_daily_grant_bounds
  check (ai_credits_daily_grant is null or (ai_credits_daily_grant >= 0 and ai_credits_daily_grant <= 10000000));

alter table public.subscription_plans drop constraint if exists subscription_plans_ai_credits_start_balance_bounds;
alter table public.subscription_plans
  add constraint subscription_plans_ai_credits_start_balance_bounds
  check (ai_credits_start_balance >= 0 and ai_credits_start_balance <= 10000000);

alter table public.subscription_plans drop constraint if exists subscription_plans_ai_credits_balance_max_bounds;
alter table public.subscription_plans
  add constraint subscription_plans_ai_credits_balance_max_bounds
  check (ai_credits_balance_max >= 0 and ai_credits_balance_max <= 10000000);

alter table public.subscription_usages
  add column if not exists used_ai_credits_today integer not null default 0,
  add column if not exists ai_credits_balance integer not null default 0;

comment on column public.subscription_usages.used_ai_credits_today is
  'Heute verbrauchte KI-Credits (Chat + Denken zusammen, kostenbasiert). Täglicher Reset UTC.';
comment on column public.subscription_usages.ai_credits_balance is
  'Übertragenes KI-Credits-Guthaben (Carryover aus Vortagen), gedeckelt mit ai_credits_balance_max des Abos.';

alter table public.subscription_usages drop constraint if exists subscription_usages_used_ai_credits_today_bounds;
alter table public.subscription_usages
  add constraint subscription_usages_used_ai_credits_today_bounds
  check (used_ai_credits_today >= 0);

alter table public.subscription_usages drop constraint if exists subscription_usages_ai_credits_balance_bounds;
alter table public.subscription_usages
  add constraint subscription_usages_ai_credits_balance_bounds
  check (ai_credits_balance >= 0 and ai_credits_balance <= 10000000);

-- Umrechnungslauf für bestehende Pläne: aus dem bisherigen max_tokens (Chat, Zeichen-Schätzung
-- ceil(Zeichen/4)) und thinking_daily_grant (Anfragen/Tag) ein grobes, plausibles Credits-Äquivalent
-- ableiten. Ohne echte historische Kosten-Daten (ai_token_usage kann pro Plan nicht direkt zugeordnet
-- werden) ist das eine konservative Schätzung, keine exakte Rückrechnung — Admin kann die Werte danach
-- im Admin-UI pro Plan verfeinern (siehe credits-system-plan.md 2.5).
--
-- Annahmen für die Schätzung:
--  * Chat: durchschnittlich 0,003 $ pro 1000 Zeichen (grober Mittelwert Standardmodelle, Input+Output).
--  * Denken: durchschnittlich 0,03 $ pro Denk-Anfrage (grober Mittelwert Reasoning-Modelle).
update public.subscription_plans
set
  ai_credits_daily_grant = case
    when max_tokens is null and coalesce(thinking_daily_grant, 0) = 0 then null
    else
      ceil(
        coalesce(max_tokens, 0) * 4.0 / 1000.0 * 0.003 * public.credits_per_usd()
        + coalesce(thinking_daily_grant, 0) * 0.03 * public.credits_per_usd()
      )::integer
  end,
  ai_credits_start_balance = ceil(
    coalesce(instant_token_start_balance, 0) * 4.0 / 1000.0 * 0.003 * public.credits_per_usd()
    + coalesce(thinking_start_balance, 0) * 0.03 * public.credits_per_usd()
  )::integer,
  ai_credits_balance_max = greatest(
    1,
    ceil(
      coalesce(instant_token_balance_max, 3000000) * 4.0 / 1000.0 * 0.003 * public.credits_per_usd()
      + coalesce(thinking_credit_max, 10) * 0.03 * public.credits_per_usd()
    )::integer
  )
where ai_credits_daily_grant is null
  and ai_credits_start_balance = 0
  and ai_credits_balance_max = 0;

-- Bestehende Guthabenstände (Carryover) ebenso umrechnen, damit niemand durch die Umstellung
-- angespartes Guthaben verliert.
update public.subscription_usages su
set ai_credits_balance = least(
  coalesce(sp.ai_credits_balance_max, 0),
  greatest(
    0,
    ceil(
      coalesce(su.token_balance, 0) * 4.0 / 1000.0 * 0.003 * public.credits_per_usd()
      + coalesce(su.thinking_credit_balance, 0) * 0.03 * public.credits_per_usd()
    )::integer
  )
)
from public.profiles p
left join public.subscription_plans sp on sp.id = p.subscription_plan_id
where p.id = su.user_id
  and su.ai_credits_balance = 0
  and (coalesce(su.token_balance, 0) > 0 or coalesce(su.thinking_credit_balance, 0) > 0);
