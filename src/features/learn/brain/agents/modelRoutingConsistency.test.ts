/**
 * Konsistenz zwischen den drei Kopien der Rollen-/Modellkonfiguration.
 *
 * Die Vermittlungsschicht aus Kapitel 12 existiert notgedrungen dreifach:
 *
 *   1. `agents/modelRouting.ts`                — Frontend, befuellt die Admin-Auswahl
 *   2. `learn_brain_model_is_allowed()`        — Datenbank, die verbindliche Instanz
 *   3. `supabase/functions/.../brainAgents.ts` — Edge Function, loest die Rolle serverseitig auf
 *
 * Sie liegen dreifach vor, weil Frontend, Datenbank und Deno-Edge-Runtime keinen gemeinsamen
 * Modulraum haben. Genau solche Kopien laufen mit der Zeit auseinander — und der Ausfall waere
 * unangenehm still: die Admin-Auswahl boete ein Modell an, das die Datenbank ablehnt, oder die
 * Notbelegung der Edge Function zeigte auf ein Modell, das es nicht mehr gibt.
 *
 * Dieser Test liest die beiden anderen Quellen als Text und vergleicht sie mit der
 * TypeScript-Fassung. Er ersetzt keine Migration, aber er faengt das Auseinanderlaufen.
 */

import { describe, expect, it } from 'vitest'
import type { BrainModelProvider } from '../types'
import { ALLOWED_MODELS } from './modelRouting'
import { ALL_ROLES } from './roles'
import { PROMPT_CACHE_KEYS } from './prompts'

/*
 * Die beiden anderen Quellen werden als Rohtext eingebunden (`?raw`), nicht ueber `node:fs`
 * gelesen. Zwei Gruende: der Test bleibt an den Build-Graph gebunden — ein verschobener oder
 * umbenannter Pfad faellt sofort auf, statt erst zur Laufzeit —, und `tsconfig.app.json` braucht
 * dafuer keine Node-Typen.
 */
import migrationSql from '../../../../../supabase/migrations/20260818123000_learn_brain_agent_models.sql?raw'
import edgeModule from '../../../../../supabase/functions/chat-completion/brainAgents.ts?raw'

/**
 * Die Modell-Liste eines Anbieters aus `learn_brain_model_is_allowed()` herausschneiden.
 *
 * Bewusst genau auf die Form dieser einen Funktion zugeschnitten: ein allgemeiner SQL-Parser
 * waere hier mehr Angriffsflaeche als Nutzen. Findet der Ausdruck nichts, schlaegt der Test an —
 * das ist die gewuenschte Reaktion darauf, dass jemand die Funktion umgebaut hat.
 */
function sqlModelsFor(sql: string, provider: BrainModelProvider): string[] {
  const match = new RegExp(`when '${provider}' then p_model in \\(([^)]*)\\)`, 's').exec(sql)
  if (!match) {
    return []
  }
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

describe('Modell-Liste: TypeScript gegen Datenbank', () => {
  const sql = migrationSql

  for (const provider of Object.keys(ALLOWED_MODELS) as BrainModelProvider[]) {
    it(`stimmt fuer ${provider} ueberein`, () => {
      const fromSql = sqlModelsFor(sql, provider).sort()
      const fromTs = ALLOWED_MODELS[provider].map((entry) => entry.id).sort()
      expect(fromSql.length, `keine Liste fuer ${provider} in der Migration gefunden`).toBeGreaterThan(0)
      expect(fromTs).toEqual(fromSql)
    })
  }
})

describe('Rollen: TypeScript gegen Datenbank', () => {
  const sql = migrationSql

  it('kennt beidseitig dieselben Rollen', () => {
    const checkBlock = /role text primary key check \(role in \(([\s\S]*?)\)\)/.exec(sql)
    expect(checkBlock).not.toBeNull()
    const fromSql = [...(checkBlock?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort()
    expect([...ALL_ROLES].sort()).toEqual(fromSql)
  })

  it('legt fuer jede Rolle eine Seed-Zeile an', () => {
    for (const role of ALL_ROLES) {
      expect(sql, `Seed fuer ${role} fehlt`).toContain(`('${role}',`)
    }
  })

  it('nennt den Planer nirgends als Rolle (Invariante I11)', () => {
    const checkBlock = /role text primary key check \(role in \(([\s\S]*?)\)\)/.exec(sql)
    expect(checkBlock?.[1]).not.toMatch(/'planer'/)
  })
})

describe('Rollen: TypeScript gegen Edge Function', () => {
  const edge = edgeModule

  it('kennt beidseitig dieselben Rollen', () => {
    const match = /const BRAIN_ROLES: readonly BrainRole\[] = \[([\s\S]*?)\]/.exec(edge)
    expect(match).not.toBeNull()
    const fromEdge = [...(match?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort()
    expect([...ALL_ROLES].sort()).toEqual(fromEdge)
  })

  it('haelt fuer jede Rolle eine Notbelegung bereit', () => {
    const match = /const FALLBACK: Record<BrainRole, BrainAgentBinding> = \{([\s\S]*?)\n\}/.exec(edge)
    expect(match).not.toBeNull()
    for (const role of ALL_ROLES) {
      expect(match?.[1], `Notbelegung fuer ${role} fehlt`).toContain(`${role}: {`)
    }
  })

  it('haelt fuer jede Rolle eine Systemanweisung und einen Cache-Schluessel bereit', () => {
    for (const role of ALL_ROLES) {
      expect(edge, `Systemanweisung fuer ${role} fehlt`).toMatch(new RegExp(`\\b${role}: \``))
      expect(edge, `Cache-Schluessel fuer ${role} fehlt`).toContain(`straton-brain-${role}-`)
    }
  })

  it('verwendet in der Notbelegung nur zugelassene Modelle', () => {
    const match = /const FALLBACK: Record<BrainRole, BrainAgentBinding> = \{([\s\S]*?)\n\}/.exec(edge)
    const models = [...(match?.[1] ?? '').matchAll(/model: '([^']+)'/g)].map((m) => m[1])
    const allowed = new Set(
      (Object.keys(ALLOWED_MODELS) as BrainModelProvider[]).flatMap((p) =>
        ALLOWED_MODELS[p].map((entry) => entry.id),
      ),
    )
    expect(models.length).toBeGreaterThan(0)
    for (const model of models) {
      expect(allowed.has(model), `${model} ist nicht zugelassen`).toBe(true)
    }
  })
})

describe('Systemanweisungen: Frontend gegen Edge Function', () => {
  it('haelt die Cache-Schluessel identisch — inklusive Versionsstand', () => {
    const edge = edgeModule
    /*
     * Verglichen wird gegen die Frontend-Fassung, nicht gegen eine im Test wiederholte
     * Versionsnummer: wer einen Prompt aendert und den Schluessel hochzaehlt, soll genau hier
     * merken, dass die andere Seite noch auf der alten Version steht. Ein fest verdrahtetes
     * "-v1" im Test haette diesen Fall stillschweigend durchgelassen.
     */
    for (const role of ALL_ROLES) {
      expect(edge, `Cache-Schluessel der Rolle ${role} laeuft auseinander`).toContain(
        PROMPT_CACHE_KEYS[role],
      )
    }
  })
})
