-- ---------------------------------------------------------------------------
-- Fix: learn_brain_upsert_concept_states schrieb `ever_consolidated` nie (Kapitel 6.7)
--
-- `20260819110000_learn_brain_ever_consolidated.sql` hat die Spalte hinzugefuegt und einmalig
-- rueckwirkend gesetzt (`mastery >= 0.7` zum damaligen Zeitpunkt). Die RPC, ueber die JEDE
-- spaetere Wahrnehmung ihr Ergebnis speichert (`learn_brain_upsert_concept_states`,
-- `20260818120000_learn_brain_memory.sql`), wurde dabei nicht angepasst: ihre Insert- UND
-- Update-Spaltenliste kennt `ever_consolidated` bis heute nicht.
--
-- Folge: der Client berechnet den Wert korrekt und sticky (`learnerImage.ts`, Zeile ~251:
-- `image.everConsolidated || mastery >= CONSOLIDATED_MASTERY`) — aber die Datenbank verwirft ihn
-- bei jedem Schreiben stillschweigend und behaelt den Spalten-Standard `false`. Jedes Konzept,
-- das die Festigungsschwelle NACH der Migration vom 19. August zum ersten Mal ueberschritten hat,
-- landete dadurch nie im Wiederholungsstapel — `isReviewEligible` (planner/responsibility.ts)
-- verlangt `everConsolidated`, und das blieb in der Datenbank auf `false` haengen, egal wie oft
-- der Client `true` sendet.
--
-- Zwei Teile:
--  1. Die Funktion neu definieren, mit `ever_consolidated` in beiden Listen. Beim Update ODER-
--     verknuepft mit dem Bestand (`s.ever_consolidated or excluded.ever_consolidated`), nie
--     einfach ueberschrieben — die Spalte darf laut ihrer eigenen Kommentierung nur wachsen, nie
--     zurueckgenommen werden, auch nicht durch einen Aufruf, der versehentlich `false` mitschickt.
--  2. Derselbe einmalige Nachtrag wie am 19. August, jetzt fuer den tatsaechlichen Stand: alles,
--     was heute bei mastery >= 0.7 steht, war folgerichtig schon einmal dort.
-- ---------------------------------------------------------------------------

create or replace function public.learn_brain_upsert_concept_states(
  p_user_id uuid,
  p_states jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if auth.role() = 'service_role' then
    null;
  elsif auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Unauthorized learner-image upsert.';
  end if;

  if p_states is null or jsonb_typeof(p_states) <> 'array' then
    return 0;
  end if;

  insert into public.learner_concept_brain_states as s (
    user_id, concept_id, mastery, confidence, depth, depth_evidence,
    direct_evidence_count, direct_evidence_weight, propagation_confidence_penalty,
    review_needed, review_reason, decay_rate, cold_start, ever_consolidated,
    last_direct_evidence_at, last_seen_at, next_review_at, updated_at
  )
  select
    p_user_id,
    (e ->> 'concept_id')::uuid,
    greatest(0, least(1, coalesce((e ->> 'mastery')::double precision, 0))),
    greatest(0, least(1, coalesce((e ->> 'confidence')::double precision, 0))),
    case when e ->> 'depth' in ('recognize', 'apply', 'transfer') then e ->> 'depth' else 'recognize' end,
    coalesce(e -> 'depth_evidence', '{}'::jsonb),
    greatest(0, coalesce((e ->> 'direct_evidence_count')::integer, 0)),
    greatest(0, coalesce((e ->> 'direct_evidence_weight')::double precision, 0)),
    greatest(0, least(1, coalesce((e ->> 'propagation_confidence_penalty')::double precision, 0))),
    coalesce((e ->> 'review_needed')::boolean, false),
    coalesce(left(e ->> 'review_reason', 300), ''),
    greatest(0, coalesce((e ->> 'decay_rate')::double precision, 0.08)),
    coalesce((e ->> 'cold_start')::boolean, true),
    coalesce((e ->> 'ever_consolidated')::boolean, false),
    nullif(e ->> 'last_direct_evidence_at', '')::timestamptz,
    nullif(e ->> 'last_seen_at', '')::timestamptz,
    nullif(e ->> 'next_review_at', '')::timestamptz,
    now()
  from jsonb_array_elements(p_states) as e
  where (e ->> 'concept_id') is not null
  on conflict (user_id, concept_id) do update set
    mastery = excluded.mastery,
    confidence = excluded.confidence,
    depth = excluded.depth,
    depth_evidence = excluded.depth_evidence,
    direct_evidence_count = excluded.direct_evidence_count,
    direct_evidence_weight = excluded.direct_evidence_weight,
    propagation_confidence_penalty = excluded.propagation_confidence_penalty,
    review_needed = excluded.review_needed,
    review_reason = excluded.review_reason,
    decay_rate = excluded.decay_rate,
    cold_start = excluded.cold_start,
    -- Sticky, nie zurueckgenommen (siehe Kommentar oben) — auch nicht durch diesen Aufruf selbst.
    ever_consolidated = s.ever_consolidated or excluded.ever_consolidated,
    last_direct_evidence_at = excluded.last_direct_evidence_at,
    last_seen_at = excluded.last_seen_at,
    next_review_at = excluded.next_review_at,
    updated_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.learn_brain_upsert_concept_states(uuid, jsonb) to authenticated;

-- Nachtrag fuer den tatsaechlichen Stand (siehe Kommentar oben, Teil 2).
update public.learner_concept_brain_states
   set ever_consolidated = true
 where mastery >= 0.7
   and ever_consolidated = false;
