/**
 * Modellrollen (Kapitel 12) — Tests fuer die Vermittlungsschicht und die Rollenvertraege.
 *
 * Zwei Dinge stehen im Mittelpunkt:
 *  - Die Trennung Generator gegen Pruefer/Kontrolleur. Ein Modell, das seine eigene Ausgabe
 *    bewertet, ist systematisch zu milde — die Konfiguration darf das nicht zulassen.
 *  - Die Parser als Grenze zwischen Modellausgabe und Gehirn. Was die Invarianten verletzen
 *    wuerde, kommt hier gar nicht erst herein.
 *
 * Kapitel 12, Auflage 2 verlangt „eigener Qualitaetstest je Rolle mit festen Beispielfaellen".
 * Die Vertragstests unten sind dessen deterministischer Teil: sie pruefen, dass eine
 * Modellausgabe, die vom Vertrag abweicht, zuverlaessig auffaellt.
 */

import { describe, expect, it } from 'vitest'
import type { BrainAgentModelBinding, BrainAgentRole } from '../types'
import {
  ALL_ROLES,
  MUTUALLY_EXCLUSIVE_MODELS,
  ROLE_SPECS,
  exclusionReason,
  roleSpec,
} from './roles'
import {
  ALLOWED_MODELS,
  FALLBACK_BINDINGS,
  escalationAvailable,
  isAllowedModel,
  modelForCall,
  modelLabel,
  resolveBinding,
  validateRouting,
} from './modelRouting'
import { PROMPT_CACHE_KEYS, systemPromptFor } from './prompts'
import {
  extractJson,
  parseCartographerResult,
  parseConsolidatorResult,
  parseCounterSolveResult,
  parseExplainerResult,
  parseGeneratorResult,
  parseSourceCheckResult,
} from './contracts'

function bindings(overrides: Partial<Record<BrainAgentRole, Partial<BrainAgentModelBinding>>> = {}) {
  const map = new Map<BrainAgentRole, BrainAgentModelBinding>()
  for (const role of ALL_ROLES) {
    map.set(role, { ...FALLBACK_BINDINGS[role], ...(overrides[role] ?? {}) })
  }
  return map
}

describe('Rollenregister', () => {
  it('fuehrt genau die sechs Rollen, die ein Modell brauchen', () => {
    expect(ROLE_SPECS).toHaveLength(6)
  })

  it('kennt den Planer nicht — er ist deterministisch (Invariante I11)', () => {
    expect(ALL_ROLES as readonly string[]).not.toContain('planer')
  })

  it('begruendet fuer jede Rolle, warum sie getrennt gefuehrt wird', () => {
    for (const spec of ROLE_SPECS) {
      expect(spec.separationReason.trim().length, `${spec.role} ohne Begruendung`).toBeGreaterThan(30)
      expect(spec.profile.trim().length).toBeGreaterThan(0)
    }
  })

  it('haelt Pruefer und Kartograf fuer eskalationsfaehig, den Generator nicht', () => {
    expect(roleSpec('pruefer').supportsEscalation).toBe(true)
    expect(roleSpec('kartograf').supportsEscalation).toBe(true)
    expect(roleSpec('generator').supportsEscalation).toBe(false)
  })

  it('nennt die Rollenpaare, die nie dasselbe Modell teilen duerfen', () => {
    expect(MUTUALLY_EXCLUSIVE_MODELS).toContainEqual(['generator', 'pruefer'])
    expect(MUTUALLY_EXCLUSIVE_MODELS).toContainEqual(['generator', 'kontrolleur'])
  })

  it('begruendet den Ausschluss in einem lesbaren Satz', () => {
    expect(exclusionReason('generator', 'pruefer')).toMatch(/eigenen Fehler|wertlos/)
    expect(exclusionReason('kartograf', 'erklaerer')).toBeNull()
  })
})

describe('Vermittlungsschicht', () => {
  it('belegt jede Rolle mit einem zugelassenen Modell', () => {
    for (const role of ALL_ROLES) {
      const binding = FALLBACK_BINDINGS[role]
      expect(isAllowedModel(binding.provider, binding.model), `${role}: ${binding.model}`).toBe(true)
    }
  })

  it('haelt die Notbelegung frei von Anbietern ohne garantierten Schluessel', () => {
    for (const role of ALL_ROLES) {
      expect(FALLBACK_BINDINGS[role].provider).not.toBe('anthropic')
    }
  })

  it('haelt die Notbelegung bereits konfliktfrei', () => {
    const problems = validateRouting(bindings()).filter((p) => p.severity === 'error')
    expect(problems).toEqual([])
  })

  it('faellt bei fehlender Bindung auf die Notbelegung zurueck', () => {
    expect(resolveBinding(new Map(), 'pruefer')).toEqual(FALLBACK_BINDINGS.pruefer)
  })

  it('liefert ein lesbares Modell-Label', () => {
    expect(modelLabel('openai', 'gpt-5.4')).toBe('GPT-5.4')
    expect(modelLabel('openai', 'unbekannt')).toBe('unbekannt')
  })

  it('kennt fuer jeden Anbieter mindestens ein Modell', () => {
    for (const provider of Object.keys(ALLOWED_MODELS) as (keyof typeof ALLOWED_MODELS)[]) {
      expect(ALLOWED_MODELS[provider].length).toBeGreaterThan(0)
    }
  })
})

describe('Trennung von Erzeugen und Bewerten (Kapitel 5.4)', () => {
  it('lehnt Pruefer auf dem Generator-Modell ab', () => {
    const problems = validateRouting(
      bindings({ pruefer: { provider: 'gemini', model: 'gemini-3.1-flash-lite' } }),
    )
    const error = problems.find((p) => p.severity === 'error')
    expect(error).toBeDefined()
    expect(error?.roles).toEqual(expect.arrayContaining(['generator', 'pruefer']))
  })

  it('lehnt Kontrolleur auf dem Generator-Modell ab', () => {
    const problems = validateRouting(
      bindings({ kontrolleur: { provider: 'gemini', model: 'gemini-3.1-flash-lite' } }),
    )
    expect(problems.some((p) => p.severity === 'error')).toBe(true)
  })

  it('warnt beim selben Anbieter, ohne es zu verbieten', () => {
    const problems = validateRouting(
      bindings({ kontrolleur: { provider: 'gemini', model: 'gemini-2.5-flash' } }),
    )
    expect(problems.some((p) => p.severity === 'error')).toBe(false)
    expect(problems.some((p) => p.severity === 'warning')).toBe(true)
  })

  it('lehnt ein nicht zugelassenes Modell ab', () => {
    const problems = validateRouting(bindings({ erklaerer: { provider: 'openai', model: 'gpt-2' } }))
    expect(problems.some((p) => p.severity === 'error')).toBe(true)
  })

  it('warnt vor einer Eskalation auf das eigene Hauptmodell', () => {
    const problems = validateRouting(
      bindings({ pruefer: { escalationProvider: 'openai', escalationModel: 'gpt-5-mini' } }),
    )
    expect(problems.some((p) => p.severity === 'warning')).toBe(true)
  })
})

describe('Eskalation (Kapitel 5.3)', () => {
  it('steht bereit, wenn die Rolle sie vorsieht und ein Modell konfiguriert ist', () => {
    expect(escalationAvailable(FALLBACK_BINDINGS.pruefer)).toBe(true)
  })

  it('steht nicht bereit, wenn die Rolle sie nicht vorsieht', () => {
    expect(escalationAvailable(FALLBACK_BINDINGS.generator)).toBe(false)
  })

  it('steht nicht bereit ohne konfiguriertes Modell', () => {
    expect(escalationAvailable({ ...FALLBACK_BINDINGS.pruefer, escalationModel: null })).toBe(false)
  })

  it('waehlt im Normalfall das guenstige, bei Zweifel das teure Modell', () => {
    expect(modelForCall(FALLBACK_BINDINGS.pruefer, false).model).toBe('gpt-5-mini')
    expect(modelForCall(FALLBACK_BINDINGS.pruefer, true).model).toBe('gpt-5.4')
  })

  it('bleibt beim Hauptmodell, wenn keine Eskalation konfiguriert ist', () => {
    expect(modelForCall(FALLBACK_BINDINGS.generator, true).model).toBe(FALLBACK_BINDINGS.generator.model)
  })
})

describe('Systemanweisungen', () => {
  it('gibt jeder Rolle eine eigene Anweisung', () => {
    const prompts = ALL_ROLES.map(systemPromptFor)
    expect(new Set(prompts).size).toBe(ALL_ROLES.length)
  })

  it('verlangt ueberall striktes JSON', () => {
    for (const role of ALL_ROLES) {
      expect(systemPromptFor(role)).toMatch(/JSON/)
    }
  })

  it('verwendet Schweizer Rechtschreibung', () => {
    for (const role of ALL_ROLES) {
      const withoutRule = systemPromptFor(role).replace(/kein ß, immer ss/g, '')
      expect(withoutRule, `${role} enthaelt ein ß`).not.toMatch(/ß/)
    }
  })

  it('gibt jeder Rolle einen eigenen Cache-Schluessel', () => {
    expect(new Set(Object.values(PROMPT_CACHE_KEYS)).size).toBe(ALL_ROLES.length)
  })

  it('weist den Kartografen auf die Herkunftspflicht hin (I4)', () => {
    expect(systemPromptFor('kartograf')).toMatch(/ai_supplement/)
    expect(systemPromptFor('kartograf')).toMatch(/Erfinde nie einen Beleg/)
  })

  it('haelt dem Kontrolleur beim Gegenloesen die Musterloesung vor', () => {
    expect(systemPromptFor('kontrolleur')).toMatch(/OHNE Musterloesung|ohne Musterloesung/)
  })
})

describe('JSON aus Modellantworten', () => {
  it('liest reines JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
  })

  it('entfernt Codeblock-Zaeune', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('faengt einen vorangestellten Erklaersatz ab', () => {
    expect(extractJson('Gerne! {"a":1}')).toEqual({ a: 1 })
  })

  it('liefert null bei unbrauchbarer Antwort', () => {
    expect(extractJson('Ich kann das leider nicht.')).toBeNull()
  })
})

describe('Kartografenvertrag (Invariante I4)', () => {
  it('nimmt ein belegtes Material-Konzept an', () => {
    const result = parseCartographerResult({
      concepts: [
        {
          slug: 'subnetzmaske-ableiten',
          name: 'Subnetzmaske ableiten',
          difficulty: 3,
          origin: 'material',
          sourceQuote: 'Die Subnetzmaske ergibt sich aus der Hostanzahl.',
        },
      ],
      edges: [],
    })
    expect(result.concepts).toHaveLength(1)
    expect(result.rejected).toEqual([])
  })

  it('verwirft ein Konzept ohne Herkunftsmarkierung', () => {
    const result = parseCartographerResult({
      concepts: [{ slug: 'x', name: 'X', difficulty: 3 }],
      edges: [],
    })
    expect(result.concepts).toEqual([])
    expect(result.rejected[0].reason).toMatch(/Herkunftsmarkierung/)
  })

  it('verwirft ein Material-Konzept ohne Beleg', () => {
    const result = parseCartographerResult({
      concepts: [{ slug: 'x', name: 'X', difficulty: 3, origin: 'material', sourceQuote: '' }],
      edges: [],
    })
    expect(result.concepts).toEqual([])
    expect(result.rejected[0].reason).toMatch(/ohne Beleg/)
  })

  it('nimmt eine markierte KI-Ergaenzung ohne Beleg an', () => {
    const result = parseCartographerResult({
      concepts: [{ slug: 'x', name: 'X', difficulty: 3, origin: 'ai_supplement', sourceQuote: '' }],
      edges: [],
    })
    expect(result.concepts).toHaveLength(1)
    expect(result.concepts[0].origin).toBe('aiSupplement')
  })

  it('verwirft Kanten auf unbekannte Konzepte', () => {
    const result = parseCartographerResult({
      concepts: [{ slug: 'a', name: 'A', difficulty: 3, origin: 'ai_supplement' }],
      edges: [{ from: 'a', to: 'existiert-nicht' }],
    })
    expect(result.edges).toEqual([])
  })

  it('verwirft Selbstkanten', () => {
    const result = parseCartographerResult({
      concepts: [{ slug: 'a', name: 'A', difficulty: 3, origin: 'ai_supplement' }],
      edges: [{ from: 'a', to: 'a' }],
    })
    expect(result.edges).toEqual([])
  })

  it('begrenzt die Schwierigkeit auf eins bis fuenf', () => {
    const result = parseCartographerResult({
      concepts: [{ slug: 'a', name: 'A', difficulty: 99, origin: 'ai_supplement' }],
      edges: [],
    })
    expect(result.concepts[0].difficulty).toBe(5)
  })
})

describe('Kontrolleurvertrag (Invariante I5)', () => {
  it('wertet eine fehlende Freigabe NICHT als Freigabe', () => {
    expect(parseSourceCheckResult({}).sourceAligned).toBe(false)
    expect(parseSourceCheckResult({ sourceAligned: 'ja' }).sourceAligned).toBe(false)
  })

  it('nimmt eine ausdrueckliche Freigabe an', () => {
    expect(parseSourceCheckResult({ sourceAligned: true }).sourceAligned).toBe(true)
  })

  it('liest posesQuestionOnly — Dossierfrage ist keine Materialluecke', () => {
    const dossier = parseSourceCheckResult({ sourceAligned: false, posesQuestionOnly: true })
    expect(dossier.posesQuestionOnly).toBe(true)
    expect(dossier.materialInsufficient).toBe(false)
    // Ohne Angabe bleibt es beim strengen Deckungsmassstab.
    expect(parseSourceCheckResult({ sourceAligned: false }).posesQuestionOnly).toBe(false)
  })

  it('liest materialInsufficient, faellt ohne Angabe konservativ auf false zurueck', () => {
    expect(parseSourceCheckResult({ sourceAligned: false }).materialInsufficient).toBe(false)
    expect(parseSourceCheckResult({ sourceAligned: false, materialInsufficient: true }).materialInsufficient).toBe(
      true,
    )
  })

  it('liest die unabhaengige Loesung', () => {
    expect(parseCounterSolveResult({ answer: '255.255.255.192' }).answer).toBe('255.255.255.192')
  })

  it('kommt mit einer verweigerten Gegenloesung zurecht', () => {
    const result = parseCounterSolveResult({ answer: '', issues: ['Angaben unvollstaendig'] })
    expect(result.answer).toBe('')
    expect(result.issues).toHaveLength(1)
  })

  it('liest selectedOptionIndex nur innerhalb der Optionsanzahl', () => {
    expect(parseCounterSolveResult({ answer: '', selectedOptionIndex: 1 }, 3).selectedOptionIndex).toBe(1)
    expect(parseCounterSolveResult({ answer: '', selectedOptionIndex: 3 }, 3).selectedOptionIndex).toBeNull()
    expect(parseCounterSolveResult({ answer: '' }, 3).selectedOptionIndex).toBeNull()
    // Ohne optionsCount (Vorgabe 0) ist kein Index gueltig — dort ist er auch nicht auswertbar.
    expect(parseCounterSolveResult({ answer: '', selectedOptionIndex: 0 }).selectedOptionIndex).toBeNull()
  })
})

describe('Generatorvertrag', () => {
  it('nimmt eine vollstaendige Aufgabe an', () => {
    const result = parseGeneratorResult({
      prompt: 'Berechne die Subnetzmaske fuer 60 Hosts.',
      expectedAnswer: '255.255.255.192',
      sourceGrounding: 'Skript S. 12',
    })
    expect(result?.prompt).toBeTruthy()
  })

  it('verwirft eine Aufgabe ohne Musterloesung', () => {
    expect(parseGeneratorResult({ prompt: 'Frage?' })).toBeNull()
  })

  it('liest matchTerms/matchDescriptions einer Zuordnungsaufgabe', () => {
    const result = parseGeneratorResult({
      prompt: 'Ordne zu.',
      expectedAnswer: 'A-1, B-2',
      sourceGrounding: 'Skript S. 4',
      matchTerms: ['Begriff A', 'Begriff B'],
      matchDescriptions: ['Beschreibung 1', 'Beschreibung 2'],
    })
    expect(result?.matchTerms).toEqual(['Begriff A', 'Begriff B'])
    expect(result?.matchDescriptions).toEqual(['Beschreibung 1', 'Beschreibung 2'])
  })

  it('laesst matchTerms/matchDescriptions bei anderen Formaten leer', () => {
    const result = parseGeneratorResult({
      prompt: 'Berechne x.',
      expectedAnswer: '42',
      sourceGrounding: 'Skript S. 4',
    })
    expect(result?.matchTerms).toEqual([])
    expect(result?.matchDescriptions).toEqual([])
  })

  it('liest correctOptionIndex nur innerhalb der Optionsanzahl', () => {
    const withOptions = (correctOptionIndex: unknown) =>
      parseGeneratorResult({
        prompt: 'Welche Aussage stimmt?',
        expectedAnswer: 'Aussage B',
        sourceGrounding: 'Skript S. 4',
        options: ['Aussage A', 'Aussage B', 'Aussage C'],
        correctOptionIndex,
      })?.correctOptionIndex

    expect(withOptions(1)).toBe(1)
    expect(withOptions(3)).toBeNull()
    expect(withOptions(-1)).toBeNull()
    expect(withOptions(undefined)).toBeNull()
  })
})

describe('Konsolidierervertrag (Invariante I6)', () => {
  it('verwirft einen Verschmelzungsvorschlag ohne Frage an den Nutzer', () => {
    const result = parseConsolidatorResult({
      proposals: [{ operation: 'merge_concepts', payload: {}, rationale: 'x' }],
    })
    expect(result.proposals).toEqual([])
  })

  it('nimmt einen Verschmelzungsvorschlag mit Frage an', () => {
    const result = parseConsolidatorResult({
      proposals: [
        { operation: 'merge_concepts', payload: { a: 'c1' }, question: 'Meinen A und B dasselbe?', rationale: 'x' },
      ],
    })
    expect(result.proposals).toHaveLength(1)
  })

  it('verwirft Muster mit unbekannter Fehlerart', () => {
    const result = parseConsolidatorResult({ patterns: [{ name: 'X', kind: 'schlampig' }] })
    expect(result.patterns).toEqual([])
  })

  it('kommt mit einer leeren Antwort zurecht', () => {
    expect(parseConsolidatorResult({})).toEqual({ patterns: [], proposals: [] })
  })
})

describe('Erklaerervertrag', () => {
  it('liest den Satz', () => {
    expect(parseExplainerResult({ sentence: 'Das faengt an zu verblassen.' })).toBe(
      'Das faengt an zu verblassen.',
    )
  })

  it('liefert null bei leerer Antwort — dann gilt die deterministische Vorlage', () => {
    expect(parseExplainerResult({ sentence: '' })).toBeNull()
    expect(parseExplainerResult({})).toBeNull()
  })
})
