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

/**
 * Wie oft ein Rollenaufruf angestossen wird, wenn GAR NICHTS Verwertbares zurueckkam.
 *
 * Nicht zu verwechseln mit `MAX_GENERATION_ATTEMPTS` (`production/quality.ts`). Das dort sind
 * Versuche, eine BESSERE Aufgabe zu bekommen, nachdem der Kontrolleur die vorige begruendet
 * abgelehnt hat — mit einem Hinweis, der die Lage veraendert. Hier gibt es keine Lage, die sich
 * veraendern muesste: es kam keine Antwort an. Genau diese Unterscheidung fehlte, weshalb ein
 * einzelner Aussetzer der Gegenseite eine Aufgabe endgueltig zerstoerte, obwohl die richtige
 * Reaktion darauf ist, noch einmal zu fragen.
 *
 * Zwei, nicht mehr: ein Aussetzer ist damit abgedeckt, eine echte Stoerung wird nicht zu einer
 * Kette teurer Aufrufe verlaengert. Dieselbe Zurueckhaltung wie bei der Eskalation weiter unten.
 */
const MAX_TRANSPORT_ATTEMPTS = 2

/** Wartezeit vor dem zweiten Versuch. Kurz genug, dass die Vorproduktion nicht spuerbar stockt. */
const TRANSPORT_RETRY_DELAY_MS = 700

/**
 * Meldungen, die einen voruebergehenden Fehler beschreiben, wenn der Server keine Einschaetzung
 * mitschickt.
 *
 * Der Server sagt seit der Einfuehrung von `ProviderCallError` selbst, ob ein zweiter Versuch Sinn
 * hat (Feld `retryable`). Diese Liste ist der Rueckfall fuer den Fall, dass die Edge Function noch
 * nicht neu ausgerollt ist — ohne ihn wuerde die Wiederholung im Client erst mit dem Deployment
 * wirksam, obwohl sie das gar nicht braucht.
 *
 * Bewusst kurz und auf das Beschriebene beschraenkt: was hier nicht steht, gilt als endgueltig.
 * Eine zu grosszuegige Liste wiederholt kaputte Anfragen, und das ist teurer als ein Aussetzer.
 */
const TRANSIENT_FAILURE_HINTS = [
  'keine antwort geliefert',
  'leeren textblock',
  'nicht erreichbar',
  'overloaded',
  '(529)',
  '(500)',
  '(502)',
  '(503)',
  '(504)',
  '(408)',
]

/**
 * Beschreibt diese Fehlermeldung einen voruebergehenden Fehler? Rein und damit pruefbar.
 *
 * Nur der Rueckfall — die Einschaetzung des Servers hat Vorrang, wo sie vorliegt.
 */
export function looksTransient(message: string): boolean {
  const lower = message.toLowerCase()
  return TRANSIENT_FAILURE_HINTS.some((hint) => lower.includes(hint))
}

type InvokeFailure = { message: string; retryable: boolean }

async function readInvokeFailure(error: unknown, response: Response | undefined): Promise<InvokeFailure> {
  if (response) {
    try {
      const readable = typeof response.clone === 'function' ? response.clone() : response
      const text = (await readable.text()).trim()
      if (text) {
        try {
          const parsed = JSON.parse(text) as { error?: unknown; message?: unknown; retryable?: unknown }
          const detail = typeof parsed.error === 'string' ? parsed.error : parsed.message
          if (typeof detail === 'string' && detail.trim()) {
            const message = detail.trim()
            return {
              message,
              // Die Angabe des Servers gilt; fehlt sie, entscheidet der Rueckfall am Text.
              retryable: typeof parsed.retryable === 'boolean' ? parsed.retryable : looksTransient(message),
            }
          }
        } catch {
          if (text.length < 600) {
            return { message: text, retryable: looksTransient(text) }
          }
        }
      }
    } catch {
      // Body nicht lesbar — es bleibt die generische Meldung unten.
    }
  }
  const message = error instanceof Error ? error.message : 'Der Aufruf ist fehlgeschlagen.'
  return { message, retryable: looksTransient(message) }
}

/** Warten, ohne einen Abbruch zu verschlafen. */
function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error('Abgebrochen.'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(signal?.reason instanceof Error ? signal.reason : new Error('Abgebrochen.'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Eine Rolle aufrufen und ihre JSON-Antwort zurueckgeben.
 *
 * Das Parsen in den Rollenvertrag geschieht bewusst NICHT hier, sondern beim Aufrufer mit dem
 * passenden Parser aus `contracts.ts`. Diese Funktion kennt keine Rolle im Detail — sonst waere
 * sie eine zweite Stelle, an der Rollenwissen liegt.
 *
 * Kam gar nichts Verwertbares zurueck, wird EINMAL nachgefasst (`MAX_TRANSPORT_ATTEMPTS`). Das
 * ist die Gegenseite zum Wiederholungskreis in `production/generateTask.ts`: dort wird eine
 * beurteilte, aber mangelhafte Antwort mit einem Hinweis neu angefordert; hier gibt es keine
 * Antwort, die man beurteilen koennte. Beides zu trennen ist der Punkt — sonst zerstoert ein
 * Aussetzer der Gegenseite eine Aufgabe endgueltig, und ein inhaltlicher Mangel wird blind
 * wiederholt.
 */
type AttemptOutcome =
  | { ok: true; result: BrainAgentCallResult<unknown> }
  | { ok: false; error: BrainAgentError; retryable: boolean }

async function attemptBrainAgentCall(options: BrainAgentCallOptions): Promise<AttemptOutcome> {
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
    const failure = await readInvokeFailure(error, response)
    return { ok: false, error: new BrainAgentError(options.role, failure.message), retryable: failure.retryable }
  }

  const payload = data as
    | { content?: unknown; model?: unknown; provider?: unknown; escalated?: unknown; error?: unknown; retryable?: unknown }
    | undefined

  if (payload && typeof payload.error === 'string' && payload.error.trim()) {
    const message = payload.error.trim()
    return {
      ok: false,
      error: new BrainAgentError(options.role, message),
      retryable: typeof payload.retryable === 'boolean' ? payload.retryable : looksTransient(message),
    }
  }

  const content = typeof payload?.content === 'string' ? payload.content : ''
  if (!content.trim()) {
    // Nichts angekommen — kein Urteil ueber den Inhalt, also einen zweiten Versuch wert.
    return { ok: false, error: new BrainAgentError(options.role, 'Leere Antwort erhalten.'), retryable: true }
  }

  const parsed = extractJson(content)
  if (parsed == null) {
    /*
     * Ebenfalls wiederholbar, obwohl hier Text ankam: das Parsen passiert VOR jeder Beurteilung,
     * der Kontrolleur bekommt so eine Antwort nie zu sehen. Sie faellt damit in dieselbe Klasse
     * wie die leere Antwort — nichts Verwertbares angekommen —, nicht in die des mangelhaften
     * Inhalts, fuer die es den `rejectionHint` gibt.
     */
    return { ok: false, error: new BrainAgentError(options.role, 'Antwort war kein gueltiges JSON.'), retryable: true }
  }

  return {
    ok: true,
    result: {
      data: parsed,
      model: typeof payload?.model === 'string' ? payload.model : 'unbekannt',
      provider: typeof payload?.provider === 'string' ? payload.provider : 'unbekannt',
      escalated: payload?.escalated === true,
    },
  }
}

export async function callBrainAgent(options: BrainAgentCallOptions): Promise<BrainAgentCallResult<unknown>> {
  let last: BrainAgentError | null = null

  for (let attempt = 0; attempt < MAX_TRANSPORT_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await delay(TRANSPORT_RETRY_DELAY_MS * attempt, options.signal)
    }

    const outcome = await attemptBrainAgentCall(options)
    if (outcome.ok) {
      return outcome.result
    }

    last = outcome.error
    if (!outcome.retryable) {
      throw outcome.error
    }
  }

  throw last ?? new BrainAgentError(options.role, 'Der Aufruf ist fehlgeschlagen.')
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
