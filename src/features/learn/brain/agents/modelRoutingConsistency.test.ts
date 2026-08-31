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
/*
 * Die Rollenliste steht nicht mehr nur in der Ursprungsmigration: der Aufbereiter kam spaeter
 * dazu und hat die Pruefbedingung ersetzt. Verbindlich ist der Stand NACH allen Migrationen, also
 * muessen beide Dateien gelesen werden. Kommt eine weitere Migration hinzu, die Rollen aendert,
 * gehoert sie hier ebenfalls hinein — und dass dieser Test dann anschlaegt, ist die Erinnerung
 * daran.
 */
import aufbereiterMigrationSql from '../../../../../supabase/migrations/20260831090000_learn_brain_aufbereiter_role.sql?raw'
import edgeModule from '../../../../../supabase/functions/chat-completion/brainAgents.ts?raw'

/** Alle Migrationen, die Rollen definieren oder aendern — in der Reihenfolge ihrer Anwendung. */
const ROLE_MIGRATIONS = [migrationSql, aufbereiterMigrationSql]

/**
 * Die zuletzt gesetzte Rollen-Pruefbedingung. Spaetere Migrationen ersetzen fruehere, genau wie
 * in der Datenbank.
 */
function effectiveRoleCheck(): string {
  const pattern = /check \(role in \(([\s\S]*?)\)\)/g
  let last: string | null = null
  for (const sqlText of ROLE_MIGRATIONS) {
    for (const match of sqlText.matchAll(pattern)) {
      last = match[1]
    }
  }
  return last ?? ''
}

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
  it('kennt beidseitig dieselben Rollen', () => {
    const fromSql = [...effectiveRoleCheck().matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort()
    expect(fromSql.length, 'keine Rollen-Pruefbedingung in den Migrationen gefunden').toBeGreaterThan(0)
    expect([...ALL_ROLES].sort()).toEqual(fromSql)
  })

  it('legt fuer jede Rolle eine Seed-Zeile an', () => {
    const allSql = ROLE_MIGRATIONS.join('\n')
    for (const role of ALL_ROLES) {
      expect(allSql, `Seed fuer ${role} fehlt`).toContain(`('${role}',`)
    }
  })

  /*
   * Geprueft wird die Pruefbedingung, nicht der Fliesstext: die Migration ERKLAERT im Kommentar,
   * warum der Planer keine Rolle ist, und dieser Satz soll dort stehen bleiben duerfen.
   */
  it('nennt den Planer nirgends als Rolle (Invariante I11)', () => {
    expect(effectiveRoleCheck()).not.toMatch(/'planer'/)
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
