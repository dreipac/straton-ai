create table if not exists public.admin_ai_provider_keys (
  provider text primary key check (provider in ('openai', 'anthropic')),
  api_key text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.admin_ai_provider_keys enable row level security;

create or replace function public.set_admin_ai_provider_keys_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_admin_ai_provider_keys_updated_at on public.admin_ai_provider_keys;
create trigger set_admin_ai_provider_keys_updated_at
before update on public.admin_ai_provider_keys
for each row execute function public.set_admin_ai_provider_keys_updated_at();

drop policy if exists "admin_ai_provider_keys_select_superadmin" on public.admin_ai_provider_keys;
create policy "admin_ai_provider_keys_select_superadmin"
on public.admin_ai_provider_keys
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_superadmin = true
  )
);

drop policy if exists "admin_ai_provider_keys_insert_superadmin" on public.admin_ai_provider_keys;
create policy "admin_ai_provider_keys_insert_superadmin"
on public.admin_ai_provider_keys
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_superadmin = true
  )
);

drop policy if exists "admin_ai_provider_keys_update_superadmin" on public.admin_ai_provider_keys;
create policy "admin_ai_provider_keys_update_superadmin"
on public.admin_ai_provider_keys
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_superadmin = true
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_superadmin = true
  )
);

insert into public.admin_ai_provider_keys (provider, api_key)
values
  ('openai', ''),
  ('anthropic', '')
on conflict (provider) do nothing;

grant select, insert, update on public.admin_ai_provider_keys to authenticated;
