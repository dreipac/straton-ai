-- Preise für die neuen Modelle in der Modellwahl des Composers
-- (src/features/chat/constants/chatComposerModels.ts).
--
-- Ohne diese Zeilen greifen die allgemeinen Muster aus dem Seed in
-- 20260812120000_ai_model_pricing.sql, und zwar durchgehend falsch:
--   * 'opus' (Priority 10) → 15/75 statt 5/25, also dreifache Belastung.
--   * 'sonnet' (31) → 3/15 statt 2/10.
--   * 'gpt-5' (110) → 1.25/10 für die GPT-5.6-Reihe, also deutlich zu wenig.
-- Alle neuen Zeilen liegen in der Priority unter ihren allgemeinen Pendants, damit sie zuerst
-- greifen (estimate_ai_cost_usd sortiert priority asc, limit 1).

-- Eine frühere Fassung dieser Datei legte zusätzlich GPT-5.5 an. Das Modell steht nicht mehr in der
-- Modellwahl; die Zeile wird entfernt, damit sie nicht als Leiche in der Preistabelle zurückbleibt.
-- Idempotent: greift auch, wenn die Migration bereits eingespielt war.
delete from public.ai_model_pricing
where provider = 'openai' and match_type = 'contains' and pattern = 'gpt-5.5';

insert into public.ai_model_pricing
  (provider, match_type, pattern, exclude_pattern, input_usd_per_million, output_usd_per_million, priority, notes)
values
  -- OpenAI: vor dem allgemeinen 'gpt-5'-Fallback (Priority 110) einsortiert. Die GPT-5.6-Reihe
  -- braucht drei getrennte Zeilen — zwischen Luna und Sol liegt Faktor 25 im Input.
  ('openai', 'contains', 'gpt-5.6-sol', null, 5, 30, 55, 'High-Tier: Deep Reasoning'),
  ('openai', 'contains', 'gpt-5.6-terra', null, 2, 12, 56, 'Mid-Tier, 1.05M Kontext'),
  ('openai', 'contains', 'gpt-5.6-luna', null, 0.2, 1.2, 57, 'Low-Tier: schnell und günstig'),

  -- Anthropic: vor 'claude' (30), 'sonnet' (31) und 'opus' (10) einsortiert.
  ('anthropic', 'contains', 'opus-5', null, 5, 25, 5, 'Claude Opus 5 — nicht der 15/75-Tarif der älteren Opus-Generation'),
  ('anthropic', 'contains', 'opus-4-8', null, 5, 25, 5, 'Claude Opus 4.8 — nicht der 15/75-Tarif der älteren Opus-Generation'),
  -- Achtung: 2/10 ist ein befristeter Einführungspreis von Anthropic. Läuft er aus, diese Zeile
  -- löschen — dann greift wieder 'sonnet' (3/15), der reguläre Listenpreis.
  ('anthropic', 'contains', 'sonnet-5', null, 2, 10, 5, 'Claude Sonnet 5 — befristeter Einführungspreis, regulär 3/15')
on conflict (provider, match_type, pattern) do update
set
  input_usd_per_million = excluded.input_usd_per_million,
  output_usd_per_million = excluded.output_usd_per_million,
  priority = excluded.priority,
  notes = excluded.notes,
  updated_at = now();
