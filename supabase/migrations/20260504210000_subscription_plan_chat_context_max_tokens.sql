-- Pro Abo: Obergrenze für geschätzte Input-Tokens des Chat-Verlaufs (User/Assistant),
-- bevor Systemprompt & Profil-Speicher gezählt werden. NULL = kein Limit.

alter table public.subscription_plans
  add column if not exists chat_context_max_tokens integer;

comment on column public.subscription_plans.chat_context_max_tokens is
  'Max. geschätzte Tokens für den mitgesendeten Chat-Verlauf pro Request (Schätzung wie ceil(zeichen/4)). NULL = unbegrenzt.';

alter table public.subscription_plans
  drop constraint if exists subscription_plans_chat_context_max_tokens_check;

alter table public.subscription_plans
  add constraint subscription_plans_chat_context_max_tokens_check
  check (
    chat_context_max_tokens is null
    or (
      chat_context_max_tokens >= 1000
      and chat_context_max_tokens <= 5000000
    )
  );

-- Bestehende Pläne: sinnvolle Voreinstellung (NULL → 12000)
update public.subscription_plans
set chat_context_max_tokens = 12000
where chat_context_max_tokens is null;
