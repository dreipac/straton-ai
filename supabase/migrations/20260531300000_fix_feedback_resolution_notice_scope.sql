-- Abschluss-Hinweis: nur eigene Feedbacks; RPC meldet ob Update geklappt hat.

drop function if exists public.mark_feedback_resolution_seen(uuid);

create function public.mark_feedback_resolution_seen(p_feedback_id uuid)
returns boolean
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

  return found;
end;
$$;

grant execute on function public.mark_feedback_resolution_seen(uuid) to authenticated;
