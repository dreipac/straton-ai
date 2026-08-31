-- Einladungslinks fuer Registrierung: oeffentliche Supabase-Registrierung bleibt gesperrt.
-- Ein Superadmin erzeugt einen Link mit selbst gewaehlter Gueltigkeit; die Registrierungsseite
-- zeigt nur mit gueltigem, unverbrauchtem Token ein echtes Formular (der Empfaenger waehlt sein
-- eigenes Passwort). Verbraucht sich nach der ersten erfolgreichen Registrierung (einmalig).

create table if not exists public.invite_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz
);

alter table public.invite_tokens enable row level security;

-- Nur Superadmins duerfen die Liste einsehen. Direkte Inserts/Updates/Deletes durch Clients gibt
-- es nicht: Erzeugen/Auflisten/Widerrufen laeuft ueber die SECURITY DEFINER RPCs unten, das
-- tatsaechliche Einloesen ueber die Edge Function redeem-invite-token (Service-Role-Key, umgeht
-- RLS ohnehin, damit sie den Token atomar als verbraucht markieren kann, bevor das Konto entsteht).
drop policy if exists "invite_tokens_select_superadmin" on public.invite_tokens;
create policy "invite_tokens_select_superadmin"
on public.invite_tokens
for select
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_superadmin));

create or replace function public.admin_create_invite_token(p_hours integer)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_superadmin boolean;
  v_token text;
  v_expires timestamptz;
begin
  select coalesce(p.is_superadmin, false)
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if caller_is_superadmin = false then
    raise exception 'Nur Superadmins duerfen Einladungslinks erzeugen.';
  end if;

  if p_hours is null or p_hours < 1 or p_hours > 8760 then
    raise exception 'Gueltigkeit muss zwischen 1 Stunde und 365 Tagen liegen.';
  end if;

  -- Zwei UUIDs ohne Bindestriche aneinandergehaengt: 64 Hex-Zeichen, kryptografisch zufaellig.
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expires := now() + make_interval(hours => p_hours);

  insert into public.invite_tokens (token, created_by, expires_at)
  values (v_token, auth.uid(), v_expires);

  return query select v_token, v_expires;
end;
$$;

grant execute on function public.admin_create_invite_token(integer) to authenticated;

create or replace function public.admin_list_invite_tokens()
returns table (
  id uuid,
  token_suffix text,
  created_at timestamptz,
  expires_at timestamptz,
  used_at timestamptz,
  used_by_email text,
  revoked_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_is_superadmin boolean;
begin
  select coalesce(p.is_superadmin, false)
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if caller_is_superadmin = false then
    raise exception 'Nur Superadmins duerfen Einladungslinks einsehen.';
  end if;

  return query
  select
    it.id,
    right(it.token, 8) as token_suffix,
    it.created_at,
    it.expires_at,
    it.used_at,
    u.email::text as used_by_email,
    it.revoked_at
  from public.invite_tokens it
  left join auth.users u on u.id = it.used_by
  order by it.created_at desc;
end;
$$;

grant execute on function public.admin_list_invite_tokens() to authenticated;

create or replace function public.admin_revoke_invite_token(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_superadmin boolean;
begin
  select coalesce(p.is_superadmin, false)
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if caller_is_superadmin = false then
    raise exception 'Nur Superadmins duerfen Einladungslinks widerrufen.';
  end if;

  update public.invite_tokens
  set revoked_at = now()
  where id = p_id and used_at is null and revoked_at is null;
end;
$$;

grant execute on function public.admin_revoke_invite_token(uuid) to authenticated;

-- Oeffentlich (auch fuer nicht angemeldete Besucher): nur ja/nein, ob ein Token aktuell gueltig
-- ist. Kein Leck von Metadaten -- die Registrierungsseite nutzt das, um zu entscheiden, ob sie das
-- echte Formular oder den Hinweistext zeigt.
create or replace function public.is_invite_token_valid(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.invite_tokens
    where token = p_token
      and used_at is null
      and revoked_at is null
      and expires_at > now()
  );
$$;

grant execute on function public.is_invite_token_valid(text) to anon, authenticated;
