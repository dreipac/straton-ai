/**
 * Aufrufschicht der Modellrollen.
 *
 * Die einzige Stelle im Gehirn, die das Netzwerk beruehrt. Alle anderen Module sind rein und
 * damit ohne Aufbau testbar — das ist kein Selbstzweck, sondern der Grund, warum die
 * Entscheidungslogik des Planers ueberhaupt reproduzierbar geprueft werden kann (I11).
 *
 * Der Aufruf geht an die Edge Function `chat-completion`, Modus `brain_agent`. Der Client sendet
 * NUR die Rolle, nie ein Modell: die Aufloesung Rolle -> Modell passiert serverseitig gegen
 * `learn_brain_agent_models`. Damit kann ein manipulierter Client sich kein teureres Modell
 * erschleichen, und ein Modellwechsel im Admin-Menue wirkt sofort fuer alle, ohne Deployment.
 *
 * Invariante I11: `planner/` importiert diese Datei nicht und darf es nie.
 */

import { getSupabaseClient } from '../../../../integrations/supabase/client'
import type { BrainAgentRole } from '../types'
import { extractJson } from './contracts'

export type BrainAgentCallOptions = {
  role: BrainAgentRole
  /** Der Auftrag, wie ihn der Vertrag der Rolle vorsieht. */
  payload: unknown
  /**
   * Bei Zweifel an das staerkere Modell weiterreichen (Kapitel 5.3). Der Server prueft, ob fuer
   * die Rolle ueberhaupt ein Eskalationsmodell konfiguriert ist.
   */
  escalate?: boolean
  signal?: AbortSignal
}

export type BrainAgentCallResult<T> = {
  data: T
  /** Welches Modell tatsaechlich geantwortet hat — fuer Diagnose und Rollentests. */
  model: string
  provider: string
  escalated: boolean
}

/** Fehler eines Rollenaufrufs, mit der Rolle im Klartext. */
export class BrainAgentError extends Error {
  readonly role: BrainAgentRole

  constructor(role: BrainAgentRole, message: string) {
    super(`Rolle „${role}": ${message}`)
    this.name = 'BrainAgentError'
    this.role = role
  }
}

async function readInvokeError(error: unknown, response: Response | undefined): Promise<string> {
  if (response) {
    try {
      const readable = typeof response.clone === 'function' ? response.clone() : response
      const text = (await readable.text()).trim()
      if (text) {
        try {
          const parsed = JSON.parse(text) as { error?: unknown; message?: unknown }
          const detail = typeof parsed.error === 'string' ? parsed.error : parsed.message
          if (typeof detail === 'string' && detail.trim()) {
            return detail.trim()
          }
        } catch {
          if (text.length < 600) {
            return text
          }
        }
      }
    } catch {
      // Body nicht lesbar — es bleibt die generische Meldung unten.
    }
  }
  return error instanceof Error ? error.message : 'Der Aufruf ist fehlgeschlagen.'
}

/**
 * Eine Rolle aufrufen und ihre JSON-Antwort zurueckgeben.
 *
 * Das Parsen in den Rollenvertrag geschieht bewusst NICHT hier, sondern beim Aufrufer mit dem
 * passenden Parser aus `contracts.ts`. Diese Funktion kennt keine Rolle im Detail — sonst waere
 * sie eine zweite Stelle, an der Rollenwissen liegt.
 */
export async function callBrainAgent(options: BrainAgentCallOptions): Promise<BrainAgentCallResult<unknown>> {
  const supabase = getSupabaseClient()

  const { data, error, response } = await supabase.functions.invoke('chat-completion', {
    body: {
      mode: 'brain_agent',
      payload: {
        role: options.role,
        escalate: options.escalate === true,
        input: options.payload,
      },
    },
    ...(options.signal ? { signal: options.signal } : {}),
  })

  if (error) {
    throw new BrainAgentError(options.role, await readInvokeError(error, response))
  }

  const payload = data as
    | { content?: unknown; model?: unknown; provider?: unknown; escalated?: unknown; error?: unknown }
    | undefined

  if (payload && typeof payload.error === 'string' && payload.error.trim()) {
    throw new BrainAgentError(options.role, payload.error.trim())
  }

  const content = typeof payload?.content === 'string' ? payload.content : ''
  if (!content.trim()) {
    throw new BrainAgentError(options.role, 'Leere Antwort erhalten.')
  }

  const parsed = extractJson(content)
  if (parsed == null) {
    throw new BrainAgentError(options.role, 'Antwort war kein gueltiges JSON.')
  }

  return {
    data: parsed,
    model: typeof payload?.model === 'string' ? payload.model : 'unbekannt',
    provider: typeof payload?.provider === 'string' ? payload.provider : 'unbekannt',
    escalated: payload?.escalated === true,
  }
}

/**
 * Aufruf mit Eskalation bei Zweifel (Kapitel 5.3).
 *
 * `needsEscalation` entscheidet anhand der bereits geparsten Antwort, ob das staerkere Modell
 * geweckt wird. Genau dieser Mechanismus macht die Mehrmodellarchitektur funktional statt
 * dekorativ: Routine laeuft automatisch, Zweifel zieht Aufmerksamkeit an.
 *
 * Eskaliert wird hoechstens einmal. Ein Modell, das dem staerkeren Modell auch nicht glaubt,
 * wuerde sonst eine Kette teurer Aufrufe ausloesen.
 */
export async function callWithEscalation<T>(args: {
  role: BrainAgentRole
  payload: unknown
  parse: (raw: unknown) => T
  needsEscalation: (parsed: T) => boolean
  signal?: AbortSignal
}): Promise<BrainAgentCallResult<T>> {
  const first = await callBrainAgent({
    role: args.role,
    payload: args.payload,
    ...(args.signal ? { signal: args.signal } : {}),
  })
  const firstParsed = args.parse(first.data)

  if (!args.needsEscalation(firstParsed)) {
    return { ...first, data: firstParsed }
  }

  try {
    const second = await callBrainAgent({
      role: args.role,
      payload: args.payload,
      escalate: true,
      ...(args.signal ? { signal: args.signal } : {}),
    })
    return { ...second, data: args.parse(second.data) }
  } catch {
    /* Faellt die Eskalation aus, gilt die erste Antwort. Sie wiegt ohnehin nur schwach — die
       Wahrnehmungsschicht daempft sie ueber die niedrige Zuversicht (perception/evidence.ts). */
    return { ...first, data: firstParsed }
  }
}
