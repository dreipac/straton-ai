/**
 * Die Vermittlungsschicht (Kapitel 12, Auflage 1).
 *
 * „Die Rollen kennen die Modelle nie direkt. Dazwischen liegt eine Konfiguration, in der steht,
 *  welche Rolle auf welchem Modell laeuft. Ein Modellwechsel ist dann eine Konfigurations-
 *  aenderung, kein Umbau."
 *
 * Diese Datei ist genau diese Zwischenschicht auf der Clientseite: sie kennt die Rollen und die
 * zugelassenen Modelle, aber keine einzige Aufrufstelle kennt ein Modell im Klartext. Wer in
 * `agents/client.ts` oder in einer Rolle einen Modellnamen hartcodiert, hebt Kapitel 12 auf.
 *
 * Rein — kein DOM, kein I/O. Das Laden aus der Datenbank liegt in
 * `services/brainAgentModels.persistence.ts`.
 */

import type { BrainAgentModelBinding, BrainAgentRole, BrainModelProvider } from '../types'
import { MUTUALLY_EXCLUSIVE_MODELS, exclusionReason, roleSpec } from './roles'

/**
 * Zugelassene Modelle je Provider.
 *
 * Spiegelt `learn_brain_model_is_allowed()` aus
 * `supabase/migrations/20260818123000_learn_brain_agent_models.sql`. Beide Listen muessen
 * uebereinstimmen; die Datenbank ist die verbindliche Instanz, diese hier befuellt die Auswahl
 * im Admin-Menue und faengt Fehleingaben ab, bevor sie eine Runde zum Server kosten.
 */
export const ALLOWED_MODELS: Record<BrainModelProvider, readonly { id: string; label: string }[]> = {
  openai: [
    { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
    { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
    { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
    { id: 'gpt-5.4', label: 'GPT-5.4' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
    { id: 'gpt-5-mini', label: 'GPT-5 mini' },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
  ],
  anthropic: [
    { id: 'claude-opus-5', label: 'Claude Opus 5' },
    { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku' },
  ],
  gemini: [
    { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
    { id: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite (Preview)' },
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  ],
}

export const ALL_PROVIDERS: readonly BrainModelProvider[] = ['openai', 'anthropic', 'gemini']

export function isAllowedModel(provider: BrainModelProvider, model: string): boolean {
  return ALLOWED_MODELS[provider]?.some((entry) => entry.id === model) ?? false
}

export function modelLabel(provider: BrainModelProvider, model: string): string {
  return ALLOWED_MODELS[provider]?.find((entry) => entry.id === model)?.label ?? model
}

/**
 * Notbelegung, wenn die Konfiguration nicht geladen werden konnte.
 *
 * Bewusst identisch mit dem Seed der Migration und bewusst ohne Anthropic: das Gehirn soll auch
 * dann laufen, wenn nur OPENAI_API_KEY und GEMINI_API_KEY gesetzt sind. Ein Gehirn, das beim
 * Ausfall einer Konfigurationsabfrage stehenbleibt, waere fragiler als noetig.
 */
export const FALLBACK_BINDINGS: Record<BrainAgentRole, BrainAgentModelBinding> = {
  kartograf: {
    role: 'kartograf',
    provider: 'openai',
    model: 'gpt-5.4',
    escalationProvider: 'openai',
    escalationModel: 'gpt-5.6-sol',
    maxOutputTokens: 16384,
  },
  aufbereiter: {
    role: 'aufbereiter',
    provider: 'openai',
    model: 'gpt-5.4',
    escalationProvider: 'openai',
    escalationModel: 'gpt-5.6-sol',
    maxOutputTokens: 16384,
  },
  pruefer: {
    role: 'pruefer',
    provider: 'openai',
    model: 'gpt-5-mini',
    escalationProvider: 'openai',
    escalationModel: 'gpt-5.4',
    maxOutputTokens: 4096,
  },
  generator: {
    role: 'generator',
    provider: 'gemini',
    model: 'gemini-3.1-flash-lite',
    escalationProvider: null,
    escalationModel: null,
    maxOutputTokens: 8192,
  },
  kontrolleur: {
    role: 'kontrolleur',
    provider: 'openai',
    model: 'gpt-5-mini',
    escalationProvider: null,
    escalationModel: null,
    maxOutputTokens: 4096,
  },
  konsolidierer: {
    role: 'konsolidierer',
    provider: 'openai',
    model: 'gpt-5.4',
    escalationProvider: null,
    escalationModel: null,
    maxOutputTokens: 8192,
  },
  erklaerer: {
    role: 'erklaerer',
    provider: 'gemini',
    model: 'gemini-3.1-flash-lite',
    escalationProvider: null,
    escalationModel: null,
    maxOutputTokens: 512,
  },
}

/** Eine Rollenbindung aufloesen; fehlt sie, greift die Notbelegung. */
export function resolveBinding(
  bindings: Map<BrainAgentRole, BrainAgentModelBinding>,
  role: BrainAgentRole,
): BrainAgentModelBinding {
  return bindings.get(role) ?? FALLBACK_BINDINGS[role]
}

/**
 * Kann diese Rolle bei Zweifel eskalieren (Kapitel 5.3)?
 *
 * Zwei Bedingungen: die Rolle muss es vorsehen, UND ein Eskalationsmodell muss konfiguriert
 * sein. Ohne beides bleibt als Reaktion auf Zweifel das erneute, anders verpackte Fragen —
 * siehe `perception/examiner.ts`.
 */
export function escalationAvailable(binding: BrainAgentModelBinding): boolean {
  return roleSpec(binding.role).supportsEscalation && binding.escalationModel != null
}

/** Die effektive Modellwahl fuer einen Aufruf: normal oder eskaliert. */
export function modelForCall(
  binding: BrainAgentModelBinding,
  escalated: boolean,
): { provider: BrainModelProvider; model: string } {
  if (escalated && binding.escalationProvider && binding.escalationModel) {
    return { provider: binding.escalationProvider, model: binding.escalationModel }
  }
  return { provider: binding.provider, model: binding.model }
}

export type RoutingProblem = {
  severity: 'error' | 'warning'
  roles: BrainAgentRole[]
  message: string
}

/**
 * Die Konfiguration pruefen.
 *
 * `error` sind die harten Regeln aus Kapitel 5.4 und 12 — dieselben, die die Datenbank
 * ablehnt. `warning` sind Hinweise, die eine Konfiguration nicht falsch, aber fragwuerdig
 * machen: ein Kontrolleur beim selben ANBIETER wie der Generator ist zulaessig, aber die
 * Unabhaengigkeit ist dann geringer, als sie sein koennte.
 */
export function validateRouting(bindings: Map<BrainAgentRole, BrainAgentModelBinding>): RoutingProblem[] {
  const problems: RoutingProblem[] = []

  for (const [a, b] of MUTUALLY_EXCLUSIVE_MODELS) {
    const bindingA = bindings.get(a)
    const bindingB = bindings.get(b)
    if (!bindingA || !bindingB) {
      continue
    }
    if (bindingA.provider === bindingB.provider && bindingA.model === bindingB.model) {
      problems.push({
        severity: 'error',
        roles: [a, b],
        message: exclusionReason(a, b) ?? `${a} und ${b} duerfen nicht dasselbe Modell verwenden.`,
      })
    } else if (bindingA.provider === bindingB.provider) {
      problems.push({
        severity: 'warning',
        roles: [a, b],
        message:
          `${roleSpec(a).label} und ${roleSpec(b).label} laufen beim selben Anbieter. ` +
          'Zulaessig, aber ein anderer Anbieter macht die Gegenpruefung unabhaengiger.',
      })
    }
  }

  for (const [role, binding] of bindings) {
    if (!isAllowedModel(binding.provider, binding.model)) {
      problems.push({
        severity: 'error',
        roles: [role],
        message: `Modell „${binding.model}" ist fuer Anbieter „${binding.provider}" nicht zugelassen.`,
      })
    }
    if (binding.escalationModel && binding.escalationProvider) {
      if (!isAllowedModel(binding.escalationProvider, binding.escalationModel)) {
        problems.push({
          severity: 'error',
          roles: [role],
          message: `Eskalationsmodell „${binding.escalationModel}" ist fuer Anbieter „${binding.escalationProvider}" nicht zugelassen.`,
        })
      } else if (
        binding.escalationProvider === binding.provider &&
        binding.escalationModel === binding.model
      ) {
        problems.push({
          severity: 'warning',
          roles: [role],
          message:
            `Das Eskalationsmodell von ${roleSpec(role).label} ist dasselbe wie das Hauptmodell. ` +
            'Eine Eskalation auf sich selbst bringt bei Zweifel nichts Neues.',
        })
      }
    }
  }

  return problems
}
