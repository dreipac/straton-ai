-- Feedback: lesbare ID, Admin-Abschluss, Nutzer-Hinweis

alter table public.user_feedback
  add column if not exists display_id text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolution_message text,
  add column if not exists resolution_seen_at timestamptz;

alter table public.user_feedback
  drop constraint if exists user_feedback_resolution_message_len;

alter table public.user_feedback
  add constraint user_feedback_resolution_message_len check (
    resolution_message is null
    or (
      char_length(trim(resolution_message)) >= 1
      and char_length(resolution_message) <= 2000
    )
  );

create unique index if not exists user_feedback_display_id_key on public.user_feedback (display_id);

with ordered as (
  select
    id,
    row_number() over (order by created_at asc nulls last, id asc) as rn
  from public.user_feedback
  where display_id is null
)
update public.user_feedback uf
set display_id = 'FB-' || lpad(ordered.rn::text, 4, '0')
from ordered
where uf.id = ordered.id;

create sequence if not exists public.user_feedback_display_number_seq;

select setval(
  'public.user_feedback_display_number_seq',
  coalesce(
    (
      select max(nullif(regexp_replace(display_id, '^FB-', ''), '')::bigint)
      from public.user_feedback
      where display_id ~ '^FB-[0-9]+$'
    ),
    0
  ),
  true
);

create or replace function public.assign_user_feedback_display_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.display_id is null or btrim(new.display_id) = '' then
    new.display_id := 'FB-' || lpad(nextval('public.user_feedback_display_number_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists user_feedback_assign_display_id on public.user_feedback;
create trigger user_feedback_assign_display_id
before insert on public.user_feedback
for each row
execute function public.assign_user_feedback_display_id();

create policy "user_feedback_select_own_resolved"
  on public.user_feedback
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and resolved_at is not null
  );

create policy "user_feedback_update_superadmin"
  on public.user_feedback
  for update
  to authenticated
  using (
    coalesce(
      (select p.is_superadmin from public.profiles p where p.id = (select auth.uid())),
      false
    ) = true
  )
  with check (
    coalesce(
      (select p.is_superadmin from public.profiles p where p.id = (select auth.uid())),
      false
    ) = true
  );

create or replace function public.mark_feedback_resolution_seen(p_feedback_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_feedback
  set resolution_seen_at = now()
  where id = p_feedback_id
    and user_id = auth.uid()
    and resolved_at is not null
    and resolution_seen_at is null;
end;
$$;

grant execute on function public.mark_feedback_resolution_seen(uuid) to authenticated;
