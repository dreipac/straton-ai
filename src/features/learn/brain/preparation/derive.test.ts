/**
 * Aufbereitung — die reinen Teile.
 *
 * Der Kern der Schicht ist eine Unterscheidung, keine Erzeugung: Ein Arbeitsheft mischt
 * Wissensfragen, Arbeitsauftraege und Reflexionsfragen, die im Layout gleich aussehen und fuer
 * das Lernen voellig Verschiedenes bedeuten. Was hier falsch einsortiert wird, wird spaeter zu
 * einem Konzept und dann zu einer Aufgabe.
 */

import { describe, expect, it } from 'vitest'
import { parseAufbereiterResult, type WorkbookItem } from '../agents/contracts'
import {
  composeDerivedText,
  derivationSummary,
  derivedMaterialName,
  researchQueriesFor,
} from './derive'

function item(overrides: Partial<WorkbookItem> = {}): WorkbookItem {
  return {
    kind: 'wissensfrage',
    question: 'Was ist ein Verlöbnis?',
    answer: 'Das gegenseitige Versprechen zweier Personen, einander zu heiraten.',
    answerSource: 'material',
    needsResearch: false,
    topic: '',
    sourceQuote: 'Verlöbnis',
    ...overrides,
  }
}

describe('Aufbereitervertrag', () => {
  it('nimmt einen vollstaendigen Punkt an', () => {
    const parsed = parseAufbereiterResult({
      items: [
        {
          kind: 'wissensfrage',
          question: 'Was sind die drei Gueterstaende?',
          answer: 'Errungenschaftsbeteiligung, Guetergemeinschaft und Guetertrennung.',
          answerSource: 'material',
          needsResearch: false,
          sourceQuote: 'die drei Gueterstaende',
        },
      ],
    })
    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0].answerSource).toBe('material')
  })

  /*
   * Eine Wissensfrage ohne Antwort liefe als leeres Konzept weiter und erzeugte spaeter eine
   * Aufgabe ohne Musterloesung.
   */
  it('verwirft eine Wissensfrage ohne Antwort', () => {
    const parsed = parseAufbereiterResult({
      items: [{ kind: 'wissensfrage', question: 'Was ist ein Verloebnis?', answerSource: 'model' }],
    })
    expect(parsed.items).toHaveLength(0)
  })

  /*
   * I4 auf der Ebene des Lehrstoffs: ein unmarkierter Satz ist schlimmer als ein fehlender, weil
   * er sich nicht mehr als Ergaenzung zu erkennen gibt.
   */
  it('verwirft eine Antwort ohne Herkunftsangabe', () => {
    const parsed = parseAufbereiterResult({
      items: [{ kind: 'wissensfrage', question: 'Was ist X?', answer: 'Y.' }],
    })
    expect(parsed.items).toHaveLength(0)
  })

  it('laesst Auftrag und Reflexion ohne Antwort zu', () => {
    const parsed = parseAufbereiterResult({
      items: [
        { kind: 'arbeitsauftrag', question: 'Filmbeitrag ansehen', topic: 'Mosuo Matriarchat' },
        { kind: 'reflexion', question: 'Wie stellen Sie sich Ihr Zusammenleben vor?' },
      ],
    })
    expect(parsed.items).toHaveLength(2)
    expect(parsed.items[0].answer).toBe('')
    expect(parsed.items[0].answerSource).toBeNull()
  })

  it('verwirft unbekannte Arten', () => {
    const parsed = parseAufbereiterResult({ items: [{ kind: 'sonstiges', question: 'X?' }] })
    expect(parsed.items).toHaveLength(0)
  })

  it('kommt mit Unsinn zurecht', () => {
    expect(parseAufbereiterResult(null).items).toEqual([])
    expect(parseAufbereiterResult({ items: 'nein' }).items).toEqual([])
  })
})

describe('Lehrtext giessen', () => {
  /*
   * Nur Wissensfragen werden Text. Ein Arbeitsauftrag traegt kein Wissen, eine Reflexionsfrage
   * hat keine richtige Antwort — beide wuerden sonst zu Konzepten, zu denen der Generator eine
   * pruefbare Frage bauen soll. Genau daraus entstehen Aufgaben, auf die niemand richtig
   * antworten kann.
   */
  it('nimmt nur Wissensfragen auf', () => {
    const text = composeDerivedText(
      [
        item(),
        item({ kind: 'arbeitsauftrag', question: 'Setzen Sie sich in Gruppen zusammen', answer: '', answerSource: null }),
        item({ kind: 'reflexion', question: 'Wie sieht Ihre Traumfrau aus?', answer: '', answerSource: null }),
      ],
      'Dossier.pdf',
    )
    expect(text).toContain('Was ist ein Verlöbnis?')
    expect(text).not.toContain('Gruppen zusammen')
    expect(text).not.toContain('Traumfrau')
  })

  it('haelt Frage und Antwort zusammen', () => {
    const text = composeDerivedText([item()], 'Dossier.pdf')
    const block = text.split('\n\n').find((part) => part.startsWith('Was ist ein Verlöbnis?'))
    expect(block).toContain('gegenseitige Versprechen')
  })

  it('liefert leer, wenn keine Wissensfrage dabei ist', () => {
    expect(composeDerivedText([item({ kind: 'reflexion', answer: '', answerSource: null })], 'D.pdf')).toBe('')
    expect(composeDerivedText([], 'D.pdf')).toBe('')
  })

  /*
   * Der Name reist in JEDEM Auszug mit („Quelle 1 (<name>): …"). Damit ist die Herkunft beim
   * Generator und beim Kontrolleur, ohne dass ein Markierungssatz in den Lehrtext muss — der
   * wuerde dort mitgelernt und spaeter abgefragt.
   */
  it('kennzeichnet das abgeleitete Material im Namen', () => {
    expect(derivedMaterialName('Dossier.pdf')).toContain('Dossier.pdf')
    expect(derivedMaterialName('Dossier.pdf')).not.toBe('Dossier.pdf')
  })
})

describe('Wonach nachrecherchiert wird', () => {
  it('nimmt gemeldete Unsicherheit und Themen aus Auftraegen', () => {
    const queries = researchQueriesFor([
      item({ needsResearch: true, question: 'Wochenaufenthalter Steuerpflicht?' }),
      item({ kind: 'arbeitsauftrag', question: 'Film ansehen', answer: '', answerSource: null, topic: 'Mosuo' }),
    ])
    expect(queries).toContain('Wochenaufenthalter Steuerpflicht?')
    expect(queries).toContain('Mosuo')
  })

  /*
   * Das Material der Person hat Vorrang vor dem Netz — es ist das, woran sie geprueft wird.
   */
  it('recherchiert nicht nach, was sicher im Material stand', () => {
    expect(researchQueriesFor([item()])).toEqual([])
  })

  it('fragt nichts doppelt', () => {
    const queries = researchQueriesFor([
      item({ needsResearch: true, question: 'Gleiche Frage' }),
      item({ needsResearch: true, question: 'Gleiche Frage' }),
    ])
    expect(queries).toEqual(['Gleiche Frage'])
  })

  it('uebergeht Auftraege ohne erkennbares Thema', () => {
    expect(
      researchQueriesFor([
        item({ kind: 'arbeitsauftrag', question: 'Notizblatt holen', answer: '', answerSource: null, topic: '' }),
      ]),
    ).toEqual([])
  })
})

describe('Zusammenfassung der Aufbereitung', () => {
  it('zaehlt Arten, Ergaenzungen und Unsicherheit getrennt', () => {
    const summary = derivationSummary([
      item({ answerSource: 'material' }),
      item({ answerSource: 'model', needsResearch: true }),
      item({ answerSource: 'web' }),
      item({ kind: 'arbeitsauftrag', answer: '', answerSource: null }),
      item({ kind: 'reflexion', answer: '', answerSource: null }),
    ])
    expect(summary).toEqual({
      wissensfragen: 3,
      arbeitsauftraege: 1,
      reflexionen: 1,
      ergaenzt: 2,
      unsicher: 1,
    })
  })
})
