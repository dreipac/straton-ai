-- Echte Token-Zaehlung pro KI-Aufruf (Edge Function chat-completion, Service Role Insert)
-- Admin-Uebersicht: aggregiert nach Nutzer + Modell

create table if not exists public.ai_token_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('openai', 'anthropic')),
  model text not null,
  mode text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  created_at timestamptz not null default now()
);

create index if not exists ai_token_usage_user_id_created_at_idx
  on public.ai_token_usage (user_id, created_at desc);

create index if not exists ai_token_usage_user_model_idx
  on public.ai_token_usage (user_id, provider, model);

comment on table public.ai_token_usage is 'API Token usage logged by Edge Function chat-completion (service_role inserts only).';

alter table public.ai_token_usage enable row level security;

-- Keine Policies: nur service_role (Edge) schreibt; Nutzer lesen nicht direkt.

create or replace function public.list_admin_ai_token_usage_summary()
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  provider text,
  model text,
  input_tokens bigint,
  output_tokens bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_superadmin boolean;
begin
  select p.is_superadmin
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if coalesce(caller_is_superadmin, false) = false then
    raise exception 'Nur Superadmins duerfen Token-Statistiken abrufen.';
  end if;

  return query
  select
    p.id as user_id,
    u.email::text,
    p.first_name,
    p.last_name,
    t.provider,
    t.model,
    sum(t.input_tokens)::bigint as input_tokens,
    sum(t.output_tokens)::bigint as output_tokens
  from public.profiles p
  left join auth.users u on u.id = p.id
  inner join public.ai_token_usage t on t.user_id = p.id
  group by p.id, u.email, p.first_name, p.last_name, t.provider, t.model
  order by u.email nulls last, t.provider, t.model;
end;
$$;

grant execute on function public.list_admin_ai_token_usage_summary() to authenticated;
