/**
 * Persistenz der Vermittlungsschicht (Kapitel 12).
 *
 * Laedt und schreibt `learn_brain_agent_models`. Aenderungen wirken SOFORT — es gibt bewusst
 * keinen Entwurf/Deploy-Zwischenschritt wie bei den Abo-Einstellungen: eine Rollenkonfiguration
 * ist kein Vertragsbestandteil, sondern eine Betriebseinstellung, und sie soll sich im Fehlerfall
 * in Sekunden zurueckdrehen lassen.
 */

import { getSupabaseClient } from '../../../../integrations/supabase/client'
import type { BrainAgentModelBinding, BrainAgentRole, BrainModelProvider } from '../types'
import { ALL_ROLES } from '../agents/roles'
import { FALLBACK_BINDINGS } from '../agents/modelRouting'
import { toReadableError } from './brainErrors'

type AgentModelRow = {
  role: string
  provider: string
  model: string
  escalation_provider: string | null
  escalation_model: string | null
  max_output_tokens: number
}

function isRole(value: string): value is BrainAgentRole {
  return (ALL_ROLES as readonly string[]).includes(value)
}

function parseProvider(value: unknown): BrainModelProvider {
  return value === 'anthropic' || value === 'gemini' ? value : 'openai'
}

function mapRow(row: AgentModelRow): BrainAgentModelBinding | null {
  if (!isRole(row.role)) {
    return null
  }
  const escalationModel =
    typeof row.escalation_model === 'string' && row.escalation_model.trim().length > 0
      ? row.escalation_model.trim()
      : null
  return {
    role: row.role,
    provider: parseProvider(row.provider),
    model: row.model,
    escalationProvider: escalationModel ? parseProvider(row.escalation_provider) : null,
    escalationModel,
    maxOutputTokens: Number.isFinite(row.max_output_tokens) ? row.max_output_tokens : 4096,
  }
}

/**
 * Alle Rollenbindungen laden.
 *
 * Fehlt eine Rolle in der Tabelle — etwa weil eine neue Rolle hinzukam, bevor die Migration
 * lief —, wird sie aus der Notbelegung ergaenzt. Eine unvollstaendige Konfiguration darf das
 * Gehirn nicht anhalten.
 */
export async function loadAgentModelBindings(): Promise<Map<BrainAgentRole, BrainAgentModelBinding>> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('get_learn_brain_agent_models')

  if (error) {
    throw toReadableError(error)
  }

  const bindings = new Map<BrainAgentRole, BrainAgentModelBinding>()
  for (const row of (data ?? []) as AgentModelRow[]) {
    const binding = mapRow(row)
    if (binding) {
      bindings.set(binding.role, binding)
    }
  }

  for (const role of ALL_ROLES) {
    if (!bindings.has(role)) {
      bindings.set(role, FALLBACK_BINDINGS[role])
    }
  }

  return bindings
}

/**
 * Eine Rolle umkonfigurieren (nur Superadmin).
 *
 * Die Regeln aus Kapitel 5.4 und 12 — Pruefer und Kontrolleur nie auf dem Generator-Modell —
 * prueft die RPC serverseitig und lehnt mit einer sprechenden Meldung ab. Der Client prueft
 * dieselbe Regel vorab (`validateRouting`), damit die Meldung ohne Serverrunde erscheint; die
 * verbindliche Instanz bleibt die Datenbank.
 */
export async function setAgentModelBinding(args: {
  role: BrainAgentRole
  provider: BrainModelProvider
  model: string
  escalationProvider?: BrainModelProvider | null
  escalationModel?: string | null
  maxOutputTokens?: number | null
}): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('admin_set_learn_brain_agent_model', {
    p_role: args.role,
    p_provider: args.provider,
    p_model: args.model,
    p_escalation_provider: args.escalationProvider ?? null,
    p_escalation_model: args.escalationModel ?? null,
    p_max_output_tokens: args.maxOutputTokens ?? null,
  })

  if (error) {
    throw toReadableError(error)
  }
}
