-- ============================================================================
-- Straton Gehirn — Vermittlungsschicht Rolle -> Modell
-- Referenz: straton-gehirn-architektur.md, Kapitel 12
--
-- "Die Rollen kennen die Modelle nie direkt. Dazwischen liegt eine Konfiguration, in der steht,
--  welche Rolle auf welchem Modell laeuft. Ein Modellwechsel ist dann eine Konfigurationsaenderung,
--  kein Umbau."
--
-- Diese Tabelle IST diese Konfiguration. Sie wird im Admin-Menue "Gehirn-Agenten" gepflegt und
-- wirkt sofort — kein Entwurf/Deploy-Zwischenschritt.
--
-- Zwei Architekturregeln sind hier hart verdrahtet, weil sie sonst durch eine unbedachte
-- Admin-Auswahl unterlaufen wuerden:
--
--   Kapitel 5.4  Pruefer und Generator sind getrennte Rollen mit GETRENNTEN MODELLEN.
--                Ein Modell, das seine eigene Aufgabe bewertet, ist systematisch zu milde.
--   Kapitel 12   Der Kontrolleur braucht Unabhaengigkeit vom Generator.
--                Ein Kontrolleur auf demselben Modell wiederholt dessen Fehler, statt sie zu finden.
--
--   Invariante I11: der Planer ist deterministisch, keine Modellentscheidung darueber, was als
--                Naechstes kommt. Deshalb kann 'planer' hier gar nicht erst eingetragen werden —
--                der Check-Constraint auf role kennt die Rolle nicht.
--
-- Ausserdem traegt jede Rolle ein optionales ESKALATIONSMODELL. Kapitel 5.3: das schnelle,
-- guenstige Modell erledigt den Normalfall, das teure wird nur bei Zweifel geweckt.
-- ============================================================================

create table if not exists public.learn_brain_agent_models (
  role text primary key check (role in (
    'kartograf',      -- Graph aus Material bauen, Chats Konzepten zuordnen
    'pruefer',        -- Antworten bewerten, Ursache und Zuversicht liefern
    'generator',      -- Aufgaben, Karten, Arbeitsblaetter erzeugen
    'kontrolleur',    -- Generiertes gegen Quelle pruefen, ggf. gegenloesen
    'konsolidierer',  -- Muster verdichten, Strukturumbau vorschlagen
    'erklaerer'       -- in einem Satz begruenden, warum jetzt diese Aufgabe
  )),

  provider text not null check (provider in ('openai', 'anthropic', 'gemini')),
  model text not null,

  -- Kapitel 5.3: bei niedriger Zuversicht an ein staerkeres Modell weiterreichen.
  -- null = keine Eskalation, die Rolle arbeitet immer auf ihrem Hauptmodell.
  escalation_provider text check (escalation_provider in ('openai', 'anthropic', 'gemini')),
  escalation_model text,

  max_output_tokens integer not null default 4096
    check (max_output_tokens >= 256 and max_output_tokens <= 32768),

  updated_at timestamptz not null default now(),

  constraint learn_brain_agent_models_model_not_blank check (length(trim(model)) > 0),
  -- Eskalation ist entweder vollstaendig oder gar nicht konfiguriert.
  constraint learn_brain_agent_models_escalation_complete check (
    (escalation_provider is null and escalation_model is null)
    or (escalation_provider is not null and length(trim(coalesce(escalation_model, ''))) > 0)
  )
);

comment on table public.learn_brain_agent_models is
  'Vermittlungsschicht aus Kapitel 12: welche Gehirn-Rolle auf welchem Modell laeuft. Der Planer '
  'fehlt hier bewusst — er ist deterministisch (Invariante I11). Aenderungen wirken sofort.';

-- ---------------------------------------------------------------------------
-- Zugelassene Modelle je Provider.
--
-- Als Funktion statt als Check-Constraint auf der Tabelle: die Liste aendert sich mit jedem
-- Modell-Release, und eine Funktion laesst sich per create-or-replace fortschreiben, ohne die
-- Tabelle anzufassen und ohne bestehende Zeilen zu invalidieren.
-- ---------------------------------------------------------------------------
create or replace function public.learn_brain_model_is_allowed(
  p_provider text,
  p_model text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case p_provider
    when 'openai' then p_model in (
      'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna',
      'gpt-5.4', 'gpt-5.4-mini', 'gpt-5-mini', 'gpt-4o-mini'
    )
    when 'anthropic' then p_model in (
      'claude-opus-5', 'claude-opus-4-8', 'claude-sonnet-5',
      'claude-sonnet-4-6', 'claude-3-5-haiku-latest'
    )
    when 'gemini' then p_model in (
      'gemini-3.1-flash-lite', 'gemini-3.1-flash-lite-preview',
      'gemini-3-flash-preview', 'gemini-2.5-flash'
    )
    else false
  end;
$$;

grant execute on function public.learn_brain_model_is_allowed(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Seed — Annaeherung an das Anforderungsprofil aus Kapitel 12.
--
-- Bewusst nur auf Modelle gesetzt, deren API-Key in diesem Projekt ohnehin gesetzt ist
-- (OPENAI_API_KEY, GEMINI_API_KEY). Anthropic-Modelle stehen zur Auswahl, sind aber nicht
-- vorbelegt, damit das Gehirn ohne zusaetzliches Secret sofort laeuft.
--
-- Die Trennung Generator <-> Pruefer/Kontrolleur ist im Seed bereits eingehalten:
-- der Generator laeuft auf Gemini, Pruefer und Kontrolleur auf OpenAI.
-- ---------------------------------------------------------------------------
insert into public.learn_brain_agent_models
  (role, provider, model, escalation_provider, escalation_model, max_output_tokens)
values
  -- Hoechstes Verstaendnis, kritischste Rolle: was der Kartograf falsch zuordnet, ist an jeder
  -- spaeteren Stelle falsch. Deshalb das staerkste vorbelegte Modell.
  ('kartograf', 'openai', 'gpt-5.4', 'openai', 'gpt-5.6-sol', 16384),
  -- Genauigkeit und Kalibrierung der eigenen Unsicherheit. Guenstiges Hauptmodell mit
  -- Eskalation — genau der Mechanismus aus Kapitel 5.3.
  ('pruefer', 'openai', 'gpt-5-mini', 'openai', 'gpt-5.4', 4096),
  -- Geschwindigkeit und Formatvielfalt; laeuft in Echtzeit vorproduziert (Kapitel 7.1).
  ('generator', 'gemini', 'gemini-3.1-flash-lite', null, null, 8192),
  -- Unabhaengigkeit vom Generator: anderer Provider, anderes Modell.
  ('kontrolleur', 'openai', 'gpt-5-mini', null, null, 4096),
  -- Mustererkennung ueber grosse Datenmengen, laeuft im Hintergrund, Latenz unkritisch.
  ('konsolidierer', 'openai', 'gpt-5.4', null, null, 8192),
  -- Kuerze und Verstaendlichkeit; ein Satz. Das billigste und schnellste Modell genuegt.
  ('erklaerer', 'gemini', 'gemini-3.1-flash-lite', null, null, 512)
on conflict (role) do nothing;

alter table public.learn_brain_agent_models enable row level security;

-- Lesbar fuer alle Angemeldeten: die Client-Vermittlungsschicht loest die Rolle vor jedem
-- Agentenaufruf auf. Schreiben nur Superadmin.
drop policy if exists "learn_brain_agent_models_select_authenticated" on public.learn_brain_agent_models;
create policy "learn_brain_agent_models_select_authenticated"
  on public.learn_brain_agent_models for select to authenticated
  using (true);

drop policy if exists "learn_brain_agent_models_write_superadmin" on public.learn_brain_agent_models;
create policy "learn_brain_agent_models_write_superadmin"
  on public.learn_brain_agent_models for all to authenticated
  using (
    coalesce((select p.is_superadmin from public.profiles p where p.id = (select auth.uid())), false) = true
  )
  with check (
    coalesce((select p.is_superadmin from public.profiles p where p.id = (select auth.uid())), false) = true
  );

-- ===========================================================================
-- RPCs
-- ===========================================================================

create or replace function public.get_learn_brain_agent_models()
returns table (
  role text,
  provider text,
  model text,
  escalation_provider text,
  escalation_model text,
  max_output_tokens integer
)
language sql
security definer
set search_path = public
stable
as $$
  select m.role, m.provider, m.model, m.escalation_provider, m.escalation_model, m.max_output_tokens
  from public.learn_brain_agent_models m
  order by
    case m.role
      when 'kartograf' then 1
      when 'pruefer' then 2
      when 'generator' then 3
      when 'kontrolleur' then 4
      when 'konsolidierer' then 5
      when 'erklaerer' then 6
      else 99
    end;
$$;

grant execute on function public.get_learn_brain_agent_models() to authenticated;

-- admin_set_learn_brain_agent_model: eine Rolle umkonfigurieren. Wirkt sofort.
--
-- Die beiden Unabhaengigkeitsregeln werden hier geprueft, nicht als Tabellen-Constraint:
-- ein Constraint kann nur eine Zeile sehen, die Regel betrifft aber das Verhaeltnis ZWEIER Zeilen.
create or replace function public.admin_set_learn_brain_agent_model(
  p_role text,
  p_provider text,
  p_model text,
  p_escalation_provider text default null,
  p_escalation_model text default null,
  p_max_output_tokens integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_superadmin boolean;
  v_generator_model text;
  v_generator_provider text;
  v_esc_provider text;
  v_esc_model text;
begin
  select coalesce(p.is_superadmin, false)
  into caller_is_superadmin
  from public.profiles p
  where p.id = auth.uid();

  if not coalesce(caller_is_superadmin, false) then
    raise exception 'Nur Superadmins duerfen die Gehirn-Agenten konfigurieren.';
  end if;

  if p_role = 'planer' then
    raise exception 'Der Planer ist deterministisch (Invariante I11) und laeuft auf keinem Modell.';
  end if;

  if not public.learn_brain_model_is_allowed(p_provider, p_model) then
    raise exception 'Modell % ist fuer Provider % nicht zugelassen.', p_model, p_provider;
  end if;

  -- Eskalation: leere Strings wie null behandeln, damit die UI kein Sonderformat braucht.
  v_esc_provider := nullif(trim(coalesce(p_escalation_provider, '')), '');
  v_esc_model := nullif(trim(coalesce(p_escalation_model, '')), '');
  if (v_esc_provider is null) <> (v_esc_model is null) then
    raise exception 'Eskalation braucht Provider und Modell oder keines von beidem.';
  end if;
  if v_esc_provider is not null and not public.learn_brain_model_is_allowed(v_esc_provider, v_esc_model) then
    raise exception 'Eskalationsmodell % ist fuer Provider % nicht zugelassen.', v_esc_model, v_esc_provider;
  end if;

  -- Kapitel 5.4 / Kapitel 12: Pruefer und Kontrolleur duerfen nicht auf dem Generator-Modell laufen.
  if p_role in ('pruefer', 'kontrolleur') then
    select m.provider, m.model into v_generator_provider, v_generator_model
    from public.learn_brain_agent_models m where m.role = 'generator';

    if v_generator_model is not null
       and v_generator_provider = p_provider
       and v_generator_model = p_model then
      raise exception
        'Rolle % darf nicht auf demselben Modell laufen wie der Generator (%/%): ein Modell, das seine eigene Ausgabe bewertet, ist systematisch zu milde.',
        p_role, v_generator_provider, v_generator_model;
    end if;
  end if;

  -- Umgekehrte Richtung: wird der GENERATOR umgestellt, darf er nicht auf Pruefer oder
  -- Kontrolleur zu liegen kommen. Ohne diese Haelfte laesst sich die Regel trivial umgehen.
  if p_role = 'generator' then
    if exists (
      select 1 from public.learn_brain_agent_models m
      where m.role in ('pruefer', 'kontrolleur')
        and m.provider = p_provider
        and m.model = p_model
    ) then
      raise exception
        'Der Generator darf nicht auf demselben Modell laufen wie Pruefer oder Kontrolleur — beide bewerten seine Ausgabe.';
    end if;
  end if;

  update public.learn_brain_agent_models
  set provider = p_provider,
      model = p_model,
      escalation_provider = v_esc_provider,
      escalation_model = v_esc_model,
      max_output_tokens = coalesce(p_max_output_tokens, max_output_tokens),
      updated_at = now()
  where role = p_role;

  if not found then
    raise exception 'Unbekannte Gehirn-Rolle: %', p_role;
  end if;
end;
$$;

grant execute on function public.admin_set_learn_brain_agent_model(text, text, text, text, text, integer)
  to authenticated;
