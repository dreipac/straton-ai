-- Modellabhängiges KI-Credits-Vorab-Veto.
--
-- Bisher (20260812120000 / 20260812122000): `estimate_reservation_credits(text)` schätzte aus dem
-- rohen Request-Text und rechnete dabei IMMER mit dem teuersten Tarif der gesamten Preistabelle —
-- unabhängig davon, welches Modell die Anfrage tatsächlich nutzt. Gekürzt lief das auf 0,03 Credits
-- je Zeichen hinaus, gedeckelt durch die 40.000-Zeichen-Kappung des Aufrufers bei 1200 Credits.
--
-- Das war in beide Richtungen falsch, seit die Modellwahl im Composer offen steht und die Spanne
-- von 9 bis 160 Credits pro Turn reicht:
--   * Zu streng im Normalfall: eine längere Anfrage mit GPT-5 mini reservierte bis zu 1200 Credits,
--     obwohl der Turn 9 kostet. Nutzer mit kleinem Restguthaben wurden abgewiesen, obwohl sie sich
--     die Anfrage locker leisten konnten.
--   * Zu lax am oberen Ende: wegen der Kappung wuchs die Schätzung ab ~10k Tokens nicht weiter,
--     während ein Opus-5-Turn im 1M-Kontextfenster über 2500 Credits kosten kann.
--   * Der Output zählte gar nicht mit, obwohl er bei Denk-Turns die Hälfte der Rechnung ausmacht.
--
-- Neu: der Aufrufer übergibt Token-Zahlen sowie Provider und Modell, und es wird mit dem echten
-- Tarif dieses Modells gerechnet. Kein Muster getroffen -> Rückfall auf den bisherigen
-- Worst-Case-Tarif, damit eine Lücke in der Preistabelle nie zu einer Gratis-Anfrage führt.
--
-- Die alten Funktionen `estimate_reservation_credits(text)` und
-- `check_ai_credits_available_for_content(uuid, text)` bleiben absichtlich bestehen: eine noch nicht
-- neu deployte Edge Function ruft sie weiter auf. Würden sie fehlen, liefe der RPC in einen Fehler,
-- und der Aufrufer behandelt einen Fehler als "nicht blockieren" — das Veto wäre still abgeschaltet.

-- Einzige Stelle, an der ein Modellname gegen ai_model_pricing aufgelöst wird. Vorher steckte diese
-- Logik nur in estimate_ai_cost_usd; sie wird jetzt an zwei Stellen gebraucht und darf nicht
-- auseinanderlaufen (Abrechnung und Vorab-Prüfung müssen dasselbe Modell gleich bepreisen).
create or replace function public.ai_model_rates(p_provider text, p_model text)
returns table (input_usd_per_million numeric, output_usd_per_million numeric)
language sql
stable
set search_path = public
as $$
  select mp.input_usd_per_million, mp.output_usd_per_million
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
  limit 1;
$$;

comment on function public.ai_model_rates(text, text) is
  'Tarifzeile für Provider+Modell aus ai_model_pricing (spezifisch vor allgemein). Leer, wenn kein Muster greift.';

grant execute on function public.ai_model_rates(text, text) to authenticated, service_role;

-- Unverändertes Verhalten, nur auf ai_model_rates umgestellt: weiterhin 0, wenn kein Tarif greift.
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
        (greatest(0, p_input_tokens) / 1000000.0) * r.input_usd_per_million
        + (greatest(0, p_output_tokens) / 1000000.0) * r.output_usd_per_million
      from public.ai_model_rates(p_provider, p_model) r
    ),
    0
  );
$$;

create or replace function public.worst_ai_rate_per_million()
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(max(greatest(input_usd_per_million, output_usd_per_million)), 0)
  from public.ai_model_pricing;
$$;

comment on function public.worst_ai_rate_per_million() is
  'Teuerster Tarif der Preistabelle. Rückfall für die Vorab-Schätzung, wenn ein Modell keinen eigenen Eintrag hat.';

-- Angenommene Antwortlänge, wenn der Aufrufer kein Ausgabelimit mitschickt. Bewusst grosszügig:
-- die Prüfung soll eher zu viel als zu wenig veranschlagen.
create or replace function public.reservation_output_token_allowance()
returns integer
language sql
immutable
as $$
  select 2000;
$$;

comment on function public.reservation_output_token_allowance() is
  'Angenommene Ausgabe-Tokens im Vorab-Veto, wenn die Anfrage kein eigenes Limit nennt.';

create or replace function public.estimate_reservation_credits_for_model(
  p_input_tokens integer,
  p_output_tokens integer,
  p_provider text,
  p_model text
)
returns integer
language plpgsql
stable
set search_path = public
as $$
declare
  in_tokens integer := greatest(1, coalesce(p_input_tokens, 0));
  out_tokens integer := greatest(0, coalesce(p_output_tokens, public.reservation_output_token_allowance()));
  in_rate numeric;
  out_rate numeric;
  worst numeric;
begin
  select r.input_usd_per_million, r.output_usd_per_million
  into in_rate, out_rate
  from public.ai_model_rates(p_provider, p_model) r;

  -- Unbekanntes Modell: lieber den teuersten bekannten Tarif ansetzen als gar keinen. Ohne diesen
  -- Zweig lieferte estimate_ai_cost_usd hier 0 und jede Anfrage käme am Veto vorbei.
  if in_rate is null then
    worst := public.worst_ai_rate_per_million();
    in_rate := worst;
    out_rate := worst;
  end if;

  return ceil(
    ((in_tokens / 1000000.0) * in_rate + (out_tokens / 1000000.0) * out_rate)
    * public.credits_per_usd()
  )::integer;
end;
$$;

comment on function public.estimate_reservation_credits_for_model(integer, integer, text, text) is
  'Vorab-Schätzung in Credits zum Tarif des tatsächlich gewählten Modells; Rückfall auf den teuersten bekannten Tarif, wenn kein Muster greift.';

grant execute on function public.estimate_reservation_credits_for_model(integer, integer, text, text) to authenticated, service_role;

create or replace function public.check_ai_credits_available_for_request(
  p_user_id uuid,
  p_input_tokens integer,
  p_output_tokens integer,
  p_provider text,
  p_model text
)
returns boolean
language sql
stable
set search_path = public
as $$
  select public.check_ai_credits_available(
    p_user_id,
    public.estimate_reservation_credits_for_model(p_input_tokens, p_output_tokens, p_provider, p_model)
  );
$$;

comment on function public.check_ai_credits_available_for_request(uuid, integer, integer, text, text) is
  'Modellabhängiges Vorab-Veto: schätzt zum Tarif des gewählten Modells und prüft gegen das Tagesbudget. Bucht nichts. Ersetzt check_ai_credits_available_for_content.';

grant execute on function public.check_ai_credits_available_for_request(uuid, integer, integer, text, text) to authenticated, service_role;
