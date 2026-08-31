-- Fix: admin_deploy_chat_intent_model_routing_draft() hatte ein UPDATE ohne WHERE-Klausel.
-- Der Self-Hosted-Server erzwingt eine WHERE-Klausel bei UPDATE ("UPDATE requires a WHERE clause") —
-- `where true` aktualisiert weiterhin alle Zeilen, erfuellt aber die Pflicht-WHERE-Klausel.

create or replace function public.admin_deploy_chat_intent_model_routing_draft()
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

  if not caller_is_superadmin then
    raise exception 'Nur Superadmins duerfen das Modell-Routing deployen.';
  end if;

  update public.chat_intent_model_routing
  set model_active = model_draft, updated_at = now()
  where true;
end;
$$;

grant execute on function public.admin_deploy_chat_intent_model_routing_draft() to authenticated;
