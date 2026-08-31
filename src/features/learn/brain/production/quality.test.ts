/**
 * Produktion (Kapitel 7) — Tests fuer Formate und Qualitaetssicherung.
 *
 * Der Schwerpunkt liegt auf Fehlerart 3 aus Kapitel 7.2 — der falschen Musterloesung. Sie ist
 * die gefaehrlichste, weil der Pruefer den Nutzer dann fuer eine richtige Antwort bestraft und
 * das falsche Signal zusaetzlich propagiert.
 */

import { describe, expect, it } from 'vitest'
import type { GeneratedTask } from '../types'
import { InvariantViolation } from '../invariants'
import {
  composeMatchingAnswer,
  counterSolveShare,
  descriptionsDescribeTheText,
  extractMatchPairsFromPrompt,
  extractOrdinalOptionReference,
  formatRotationOffset,
  formatSpec,
  formatsForDepth,
  isDiagnosticFormat,
  isKnownTaskFormat,
  matchingAssignmentComplete,
  optionsLookLikeFullAssignments,
  permuteOptionsDeterministically,
  promptReferencesTheSource,
  requiresCounterSolve,
  selectFormat,
  DEPTH_EVIDENCE_STRENGTH,
  FORMAT_SPECS,
} from './formats'
import {
  answersAgree,
  assertTaskCleared,
  buildControlVerdict,
  buildRejectionHint,
  decideProduction,
  gatePlanFor,
  resolveCounterSolveAnswer,
  MAX_GENERATION_ATTEMPTS,
} from './quality'

function task(overrides: Partial<GeneratedTask> = {}): GeneratedTask {
  return {
    conceptId: 'c1',
    format: 'calculation',
    depth: 'apply',
    difficulty: 3,
    prompt: 'Wie lautet die Subnetzmaske fuer 60 Hosts?',
    expectedAnswer: '255.255.255.192',
    sourceGrounding: 'Skript S. 12',
    reason: 'Das faengt an zu verblassen.',
    ...overrides,
  }
}

describe('Formatzuordnung zur Anwendungstiefe (Kapitel 6.6)', () => {
  /*
   * Die Tabelle aus 6.6 ist verbindlich: drei Formate je Stufe, der Nutzer waehlt nie. Dieser
   * Block prueft nicht Verhalten, sondern die Uebereinstimmung mit dem Dokument — ein zehntes
   * Format oder eine verschobene Stufe faellt hier auf, statt erst im Lernerbild.
   */
  const TABELLE: Record<string, string[]> = {
    recognize: ['multipleChoice', 'shortAnswer', 'matching'],
    apply: ['calculation', 'procedure', 'clozeCalculation'],
    transfer: ['scenario', 'errorHunt', 'justification'],
  }

  it('haelt sich Stufe fuer Stufe an die Tabelle', () => {
    for (const [depth, expected] of Object.entries(TABELLE)) {
      expect(
        formatsForDepth(depth as 'recognize' | 'apply' | 'transfer').map((f) => f.format),
        `Stufe ${depth}`,
      ).toEqual(expected)
    }
  })

  it('kennt genau die neun Formate der Tabelle und kein zehntes', () => {
    expect(FORMAT_SPECS).toHaveLength(9)
    expect(new Set(FORMAT_SPECS.flatMap((s) => s.depths)).size).toBe(3)
  })

  it('ordnet jedem Format genau eine Stufe zu', () => {
    // Ein Format auf zwei Stufen macht die Aussage „Evidenz auf dieser Stufe" mehrdeutig.
    for (const spec of FORMAT_SPECS) {
      expect(spec.depths, spec.format).toHaveLength(1)
    }
  })

  it('leitet die Evidenzstaerke aus der Stufe ab, nicht aus dem Format', () => {
    for (const spec of FORMAT_SPECS) {
      expect(spec.evidenceStrength, spec.format).toBe(DEPTH_EVIDENCE_STRENGTH[spec.depths[0]])
    }
  })

  it('kennt die Fehlersuche als einzigen diagnostischen Sonderfall', () => {
    const diagnostic = FORMAT_SPECS.filter((s) => s.diagnostic).map((s) => s.format)
    expect(diagnostic).toEqual(['errorHunt'])
    expect(isDiagnosticFormat('errorHunt')).toBe(true)
    expect(isDiagnosticFormat('calculation')).toBe(false)
  })
})

describe('Formatkatalog', () => {
  it('deckt alle drei Anwendungstiefen ab', () => {
    expect(formatsForDepth('recognize').length).toBeGreaterThan(0)
    expect(formatsForDepth('apply').length).toBeGreaterThan(0)
    expect(formatsForDepth('transfer').length).toBeGreaterThan(0)
  })

  it('laesst Multiple Choice nicht auf die Transferstufe — die Alternativen verraten das Konzept', () => {
    expect(formatSpec('multipleChoice').depths).not.toContain('transfer')
  })

  it('haelt fuer die Transferstufe eingekleidete Aufgaben bereit', () => {
    expect(formatsForDepth('transfer').map((f) => f.format)).toContain('scenario')
  })

  it('gibt jedem Format einen Auftrag an den Generator mit', () => {
    for (const spec of FORMAT_SPECS) {
      expect(spec.brief.trim().length, `${spec.format} ohne Auftrag`).toBeGreaterThan(20)
    }
  })
})

describe('Formatwahl', () => {
  it('ist deterministisch', () => {
    const a = selectFormat({ depth: 'apply', attemptIndex: 3 })
    const b = selectFormat({ depth: 'apply', attemptIndex: 3 })
    expect(a.format).toBe(b.format)
  })

  it('wechselt mit dem Versuchszaehler — sonst misst man am Ende das Format', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 6; i += 1) {
      seen.add(selectFormat({ depth: 'apply', attemptIndex: i }).format)
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  it('vermeidet die Wiederholung des letzten Formats', () => {
    const first = selectFormat({ depth: 'apply', attemptIndex: 0 })
    const second = selectFormat({ depth: 'apply', attemptIndex: 0, avoidFormat: first.format })
    expect(second.format).not.toBe(first.format)
  })

  it('waehlt bei bekanntem Verwechslungsmuster das trennschaerfste Format der Stufe', () => {
    // Erkennen: die Zuordnung stellt die verwechselten Begriffe direkt nebeneinander.
    expect(selectFormat({ depth: 'recognize', attemptIndex: 0, hasConfusionPattern: true }).format).toBe('matching')
    // Uebertragen: bei der Fehlersuche zeigt der Nutzer selbst auf die Verwechslung.
    expect(selectFormat({ depth: 'transfer', attemptIndex: 0, hasConfusionPattern: true }).format).toBe('errorHunt')
  })

  it('erfindet auf der Anwenden-Stufe kein Sonderformat fuer Verwechslungen', () => {
    /*
     * Die Tabelle aus Kapitel 6.6 kennt auf dieser Stufe kein Format, das eine Verwechslung
     * gezielt aufloest. Statt eines an der Tabelle vorbei erfundenen Formats bleibt es bei der
     * normalen Rotation — das Muster wirkt dann ueber die Tiefe darueber und darunter.
     */
    const withPattern = selectFormat({ depth: 'apply', attemptIndex: 0, hasConfusionPattern: true })
    const without = selectFormat({ depth: 'apply', attemptIndex: 0 })
    expect(withPattern.format).toBe(without.format)
  })
})

describe('Zuordnungsantwort — interaktive Eingabe statt Fliesstext', () => {
  const terms = ['Grundfreibetrag', 'Werbungskosten']
  const descriptions = ['Steuerfreier Sockelbetrag', 'Berufsbedingte Ausgaben']

  it('ist erst vollstaendig, wenn jeder Begriff zugeordnet ist', () => {
    expect(matchingAssignmentComplete('', terms.length)).toBe(false)
    expect(matchingAssignmentComplete('0,', terms.length)).toBe(false)
    expect(matchingAssignmentComplete('0,1', terms.length)).toBe(true)
  })

  it('gilt nie als vollstaendig ohne Begriffe', () => {
    expect(matchingAssignmentComplete('', 0)).toBe(false)
  })

  it('ignoriert eine Zuweisung mit falscher Feldanzahl', () => {
    expect(matchingAssignmentComplete('0,1,2', terms.length)).toBe(false)
  })

  it('setzt Begriff und zugeordnete Beschreibung lesbar zusammen', () => {
    const answer = composeMatchingAnswer(terms, descriptions, '1,0')
    expect(answer).toBe('Grundfreibetrag → Berufsbedingte Ausgaben; Werbungskosten → Steuerfreier Sockelbetrag')
  })

  it('markiert eine fehlende Zuordnung statt sie zu verschweigen', () => {
    const answer = composeMatchingAnswer(terms, descriptions, '0,')
    expect(answer).toBe('Grundfreibetrag → Steuerfreier Sockelbetrag; Werbungskosten → (nicht zugeordnet)')
  })
})

describe('extractMatchPairsFromPrompt — Nachlese, wenn der Generator die Pflichtfelder nicht liefert', () => {
  it('liest Begriffe und Beschreibungen aus einem einzeiligen Aufgabentext', () => {
    const prompt =
      'Ordne jeden Begriff seiner Beschreibung zu.\n' +
      'A) Grundfreibetrag B) Werbungskosten C) Sonderausgaben\n' +
      '1) Steuerfreier Sockelbetrag 2) Berufsbedingte Ausgaben 3) Privat veranlasste Ausgaben mit Abzugsrecht'
    expect(extractMatchPairsFromPrompt(prompt)).toEqual({
      terms: ['Grundfreibetrag', 'Werbungskosten', 'Sonderausgaben'],
      descriptions: [
        'Steuerfreier Sockelbetrag',
        'Berufsbedingte Ausgaben',
        'Privat veranlasste Ausgaben mit Abzugsrecht',
      ],
    })
  })

  it('uebersteht eine Ueberschrift zwischen Begriffs- und Beschreibungsblock', () => {
    const prompt =
      'Ordnen Sie die drei Begriffe den passenden Beschreibungen zu.\n\n' +
      'Begriffe: A) Abzüge B) Bruttolohn C) Nettolohn\n\n' +
      'Beschreibungen: 1) Posten, die vom Bruttolohn abgezogen werden koennen. ' +
      '2) Lohn vor Abzuegen. 3) Lohn nach Abzuegen.'
    expect(extractMatchPairsFromPrompt(prompt)).toEqual({
      terms: ['Abzüge', 'Bruttolohn', 'Nettolohn'],
      descriptions: [
        'Posten, die vom Bruttolohn abgezogen werden koennen.',
        'Lohn vor Abzuegen.',
        'Lohn nach Abzuegen.',
      ],
    })
  })

  it('liefert null ohne jede Kennzeichnung', () => {
    expect(extractMatchPairsFromPrompt('Ordne die Begriffe den Beschreibungen zu.')).toBeNull()
  })

  it('liefert null bei nur einem Paar (unter der Mindestzahl)', () => {
    expect(extractMatchPairsFromPrompt('A) Begriff eins\n1) Beschreibung eins')).toBeNull()
  })

  it('liefert null, wenn Begriffe und Beschreibungen unterschiedlich viele sind', () => {
    expect(extractMatchPairsFromPrompt('A) X B) Y\n1) Eins 2) Zwei 3) Drei')).toBeNull()
  })

  it('liest auch, wenn Ziffern vor Buchstaben stehen', () => {
    // Die Reihenfolge ist nur bei einer bewusst als `matching` geschriebenen Aufgabe
    // vorgeschrieben (siehe agents/prompts.ts) — ein Generator, der versehentlich unter dem
    // Auftrag multipleChoice eine Zuordnung schreibt, kennt diese Konvention nicht.
    expect(extractMatchPairsFromPrompt('1) Eins 2) Zwei\nA) Ausfuehrliche erste Beschreibung B) Ausfuehrliche zweite Beschreibung')).toEqual(
      {
        terms: ['Eins', 'Zwei'],
        descriptions: ['Ausfuehrliche erste Beschreibung', 'Ausfuehrliche zweite Beschreibung'],
      },
    )
  })

  it('erkennt eine Ziffernkennzeichnung mit Punkt statt Klammer, Begriffe zuerst', () => {
    // Das konkret beobachtete Fehlmuster: eine als multipleChoice deklarierte Aufgabe, deren
    // Generator eine Zuordnung mit "1. Begriff" statt "A) Begriff" geschrieben hat.
    const prompt =
      'Ordne jeden Begriff der passenden Beschreibung zu:\n\n' +
      'Begriffe: 1. Nettolohn 2. Abzüge 3. Steuerbares Einkommen\n\n' +
      'Beschreibungen: A) Das Einkommen, das nach Abzug erlaubter Abzüge für die Besteuerung ' +
      'übrig bleibt; Grundlage für die Einkommenssteuerberechnung. B) Der Lohn, der nach Abzug ' +
      'von Sozialversicherungen und anderen gesetzlichen Abzügen ausbezahlt wird. C) Posten, die ' +
      'vom Bruttolohn oder Einkommen abgezogen werden können (z. B. Sozialversicherungen, ' +
      'Berufsauslagen) und das steuerbare Einkommen reduzieren.'
    expect(extractMatchPairsFromPrompt(prompt)).toEqual({
      terms: ['Nettolohn', 'Abzüge', 'Steuerbares Einkommen'],
      descriptions: [
        'Das Einkommen, das nach Abzug erlaubter Abzüge für die Besteuerung übrig bleibt; ' +
          'Grundlage für die Einkommenssteuerberechnung.',
        'Der Lohn, der nach Abzug von Sozialversicherungen und anderen gesetzlichen Abzügen ' +
          'ausbezahlt wird.',
        'Posten, die vom Bruttolohn oder Einkommen abgezogen werden können (z. B. ' +
          'Sozialversicherungen, Berufsauslagen) und das steuerbare Einkommen reduzieren.',
      ],
    })
  })

  it('laesst sich von "z. B." in einer Beschreibung nicht als falscher Buchstabenmarker taeuschen', () => {
    // "z. B." ist woertlich "Leerzeichen, B, Punkt, Leerzeichen" — genau die Form eines
    // Buchstabenmarkers. Ohne die strikte, von vorne fortschreitende Suche wuerde das die
    // erwartete Anzahl Beschreibungen verfaelschen.
    const prompt = 'A) X B) Y\n1) Erste Beschreibung 2) Zweite (z. B. mit einem Beispiel)'
    expect(extractMatchPairsFromPrompt(prompt)).toEqual({
      terms: ['X', 'Y'],
      descriptions: ['Erste Beschreibung', 'Zweite (z. B. mit einem Beispiel)'],
    })
  })

  it('liefert null bei einer Dezimalzahl mit Punkt statt einer Ziffernkennzeichnung', () => {
    // "1.5" ohne Leerzeichen nach dem Punkt darf nicht als Marker "1." gelesen werden.
    expect(extractMatchPairsFromPrompt('Der Faktor betraegt 1.5 fuer alle Faelle.')).toBeNull()
  })
})

describe('optionsLookLikeFullAssignments — Nachlese fuer multipleChoice', () => {
  it('erkennt Optionen, die selbst alternative Komplett-Zuordnungen sind', () => {
    const options = ['A-1, B-2, C-3', 'A-2, B-1, C-3', 'A-1, B-3, C-2', 'A-3, B-1, C-2']
    expect(optionsLookLikeFullAssignments(options)).toBe(true)
  })

  it('erkennt auch Pfeil- oder Wort-Trenner statt Bindestrich', () => {
    const options = ['A→1, B→2, C→3', 'A zu 2, B zu 1, C zu 3']
    expect(optionsLookLikeFullAssignments(options)).toBe(true)
  })

  it('gilt nicht fuer echte Einzelaussagen-Optionen', () => {
    const options = [
      'Ein steuerfreier Sockelbetrag',
      'Berufsbedingte Ausgaben, die abgezogen werden koennen',
      'Privat veranlasste Ausgaben mit Abzugsrecht',
      'Der Betrag nach Abzug aller Posten vom Bruttolohn',
    ]
    expect(optionsLookLikeFullAssignments(options)).toBe(false)
  })

  it('schlaegt nicht schon bei einer einzelnen zufaelligen Erwaehnung an', () => {
    // Nur eine Option enthaelt ueberhaupt ein Buchstabe-Ziffer-Muster, und auch dort nur einmal.
    expect(optionsLookLikeFullAssignments(['Konto A-1 wird zuerst belastet', 'Eine andere Aussage'])).toBe(false)
  })
})

describe('extractOrdinalOptionReference — Nachlese fuer expectedAnswer bei multipleChoice', () => {
  it('loest einen Wortverweis auf ("die zweite Option")', () => {
    expect(extractOrdinalOptionReference('Die zweite Option ist richtig: Lohnsteigerungen …', 4)).toBe(1)
  })

  it('loest einen Zahlenverweis auf ("Option 3")', () => {
    expect(extractOrdinalOptionReference('Option 3 ist korrekt, weil …', 4)).toBe(2)
  })

  it('loest einen Buchstabenverweis auf ("Option B")', () => {
    expect(extractOrdinalOptionReference('Option B trifft zu.', 4)).toBe(1)
  })

  it('liefert null, wenn der referenzierte Index ausserhalb der Optionsanzahl liegt', () => {
    expect(extractOrdinalOptionReference('Die vierte Option ist richtig.', 2)).toBeNull()
  })

  it('liefert null ohne jeden Verweis — eine bereits woertliche Aussage bleibt unveraendert', () => {
    expect(extractOrdinalOptionReference('Eine Lohnerhoehung gleicht nur die Inflation aus.', 4)).toBeNull()
  })
})

describe('descriptionsDescribeTheText — Zuordnungen ueber den Text statt ueber die Sache', () => {
  it('erkennt das beobachtete Fehlmuster', () => {
    // Woertlich aus einer ausgespielten Aufgabe zu „Einnahmequellen des Bundes".
    const descriptions = [
      'Sammelbegriff für die Mittel, die dem Bund zufliessen',
      'Im Text konkret genannte Beispiele für solche Mittel',
      'Bereich, zu dem im Text nach den wichtigsten Einnahmequellen gefragt wird',
    ]
    expect(descriptionsDescribeTheText(descriptions)).toBe(true)
  })

  it('gilt nicht fuer echte Bedeutungsbeschreibungen', () => {
    const descriptions = [
      'Lohn vor Abzügen wie Sozialversicherung und Steuern',
      'Der Lohn, der nach Abzug der gesetzlichen Abzüge ausbezahlt wird',
      'Posten, die vom Bruttolohn abgezogen werden können',
    ]
    expect(descriptionsDescribeTheText(descriptions)).toBe(false)
  })

  it('bleibt bei einer leeren Liste stumm', () => {
    expect(descriptionsDescribeTheText([])).toBe(false)
  })
})

describe('formatRotationOffset — Abwechslung schon in der ersten Sitzung', () => {
  it('ist deterministisch (I11)', () => {
    expect(formatRotationOffset('konzept-a')).toBe(formatRotationOffset('konzept-a'))
  })

  it('verteilt verschiedene Konzepte ueber die Rotation, statt alle bei 0 beginnen zu lassen', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const positions = new Set(ids.map((id) => formatRotationOffset(id) % 3))
    expect(positions.size).toBeGreaterThan(1)
  })
})

describe('permuteOptionsDeterministically — die richtige Option steht nicht immer vorn', () => {
  const options = ['Erste', 'Zweite', 'Dritte', 'Vierte']

  it('ist deterministisch (I11): gleicher Startwert, gleiche Reihenfolge', () => {
    const a = permuteOptionsDeterministically(options, 0, 'aufgabe-1')
    const b = permuteOptionsDeterministically(options, 0, 'aufgabe-1')
    expect(a.options).toEqual(b.options)
    expect(a.correctIndex).toBe(b.correctIndex)
  })

  it('behaelt genau dieselben Optionen, nur in anderer Reihenfolge', () => {
    const result = permuteOptionsDeterministically(options, 0, 'aufgabe-1')
    expect([...result.options].sort()).toEqual([...options].sort())
  })

  it('fuehrt den Index der richtigen Option mit', () => {
    const result = permuteOptionsDeterministically(options, 2, 'aufgabe-1')
    expect(result.correctIndex).not.toBeNull()
    expect(result.options[result.correctIndex as number]).toBe('Dritte')
  })

  it('verschiebt die richtige Option ueber verschiedene Aufgaben hinweg weg von Position 0', () => {
    const seeds = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8']
    const landedPositions = new Set(
      seeds.map((seed) => permuteOptionsDeterministically(options, 0, seed).correctIndex),
    )
    expect(landedPositions.size).toBeGreaterThan(1)
  })

  it('laesst eine einzelne Option unangetastet', () => {
    expect(permuteOptionsDeterministically(['Nur eine'], 0, 'a')).toEqual({
      options: ['Nur eine'],
      correctIndex: 0,
    })
  })

  it('kommt ohne bekannten Index aus', () => {
    const result = permuteOptionsDeterministically(options, null, 'aufgabe-1')
    expect(result.correctIndex).toBeNull()
    expect([...result.options].sort()).toEqual([...options].sort())
  })
})

describe('Gegenloesen (Kapitel 7.2)', () => {
  it('gilt fuer Aufgaben mit eindeutiger Antwort', () => {
    expect(requiresCounterSolve('calculation')).toBe(true)
    expect(requiresCounterSolve('multipleChoice')).toBe(true)
  })

  it('gilt nicht fuer offene Erklaerfragen', () => {
    expect(requiresCounterSolve('justification')).toBe(false)
    expect(requiresCounterSolve('shortAnswer')).toBe(false)
  })

  /*
   * Regression: `scenario` und `errorHunt" HABEN eine richtige Loesung — aber als Begruendung in
   * Prosa, nicht als kurze, woertlich vergleichbare Musterloesung. Zwei unabhaengige, beide
   * richtige Begruendungen stimmen so gut wie nie wortgleich ueberein; ein Gegenloesen wuerde dort
   * reihenweise richtige Aufgaben verwerfen. Beide Formate bleiben deshalb beim Quellenabgleich,
   * wie schon `justification`.
   */
  it('gilt nicht fuer Uebertragen-Formate mit Begruendung in Prosa', () => {
    expect(requiresCounterSolve('scenario')).toBe(false)
    expect(requiresCounterSolve('errorHunt')).toBe(false)
  })

  it('ist die Regel, nicht die Schaetzung aus Kapitel 7.2', () => {
    /*
     * Kapitel 7.2 schaetzt „rund ein Drittel der Aufgaben" — geschrieben, bevor die verbindliche
     * Formattabelle aus 6.6 existierte. Massgeblich ist die Regel („alle Aufgaben mit eindeutiger,
     * kurz vergleichbarer Antwort"), und die trifft vier der neun Formate: Auswahlfrage,
     * Zuordnung, Rechenaufgabe, Lueckenrechnung. Der Test haelt die Zahl fest, damit ein Anstieg
     * der Gegenloese-Kosten auffaellt, statt sich einzuschleichen.
     */
    expect(counterSolveShare()).toBeCloseTo(4 / 9, 5)
  })

  it('fordert den Quellenabgleich immer, unabhaengig vom Format', () => {
    for (const spec of FORMAT_SPECS) {
      expect(gatePlanFor({ format: spec.format }).sourceCheck).toBe(true)
    }
  })
})

describe('Antwortvergleich', () => {
  it('erkennt identische Antworten', () => {
    expect(answersAgree('255.255.255.192', '255.255.255.192')).toBe(true)
  })

  it('toleriert Schreibweise und Leerzeichen', () => {
    expect(answersAgree(' 255.255.255.192 ', '255.255.255.192')).toBe(true)
  })

  it('erkennt dieselbe Zahl in anderer Verpackung', () => {
    expect(answersAgree('/26', '26')).toBe(true)
    expect(answersAgree('x = 26', '26')).toBe(true)
  })

  it('erkennt eine tatsaechlich andere Zahl', () => {
    expect(answersAgree('/24', '/26')).toBe(false)
  })

  it('behandelt eine leere Antwort nie als Uebereinstimmung', () => {
    expect(answersAgree('', '26')).toBe(false)
  })

  /*
   * Regression: die IPv6-Unspecified-Adresse „::" besteht ausschliesslich aus Zeichen, die als
   * abschliessende Interpunktion entfernt werden. Ohne Rueckfall wurde daraus eine leere Zeichen-
   * kette — und die Gegenloesung fiel selbst dann durch, wenn beide Antworten identisch waren.
   */
  it('streicht eine Antwort aus reiner Interpunktion nicht komplett weg', () => {
    expect(answersAgree('::', '::')).toBe(true)
    expect(answersAgree('::', ':: (die Unspecified-Adresse)')).toBe(true)
  })
})

describe('Positionsaufloesung bei Auswahlfragen', () => {
  const options = [
    'Weil sie Schutz, Unterstuetzung und soziales Lernen bietet',
    'Weil sie gesetzlich vorgeschrieben ist',
    'Weil sie am haeufigsten vorkommt',
  ]

  it('loest eine Positionsnummer in den woertlichen Optionstext auf', () => {
    expect(resolveCounterSolveAnswer('1', options)).toBe(options[0])
    expect(resolveCounterSolveAnswer('2', options)).toBe(options[1])
  })

  it('toleriert Umformulierungen, die die Nummer trotzdem nennt', () => {
    expect(resolveCounterSolveAnswer('Option 3', options)).toBe(options[2])
    expect(resolveCounterSolveAnswer('3.', options)).toBe(options[2])
  })

  it('versteht auch einen Buchstaben als Ausweichform', () => {
    expect(resolveCounterSolveAnswer('B', options)).toBe(options[1])
  })

  /*
   * Regression: ohne Positionsaufloesung wurde eine korrekt gewaehlte, aber leicht umformulierte
   * Option ("sie" statt "die Familie", ein abgeschnittener Nachsatz) als Abweichung gemeldet —
   * obwohl dieselbe Option gemeint war.
   */
  it('haelt an der urspruenglichen Antwort fest, wenn keine Nummer erkennbar ist', () => {
    const prose = 'Weil sie Schutz, Unterstuetzung und soziales Lernen bietet'
    expect(resolveCounterSolveAnswer(prose, options)).toBe(prose)
  })

  it('laesst Antworten ohne Optionen unveraendert', () => {
    expect(resolveCounterSolveAnswer('255.255.255.192', undefined)).toBe('255.255.255.192')
    expect(resolveCounterSolveAnswer('255.255.255.192', [])).toBe('255.255.255.192')
  })

  it('faellt bei einer Nummer ausserhalb des Bereichs auf den Text zurueck', () => {
    expect(resolveCounterSolveAnswer('9', options)).toBe('9')
  })
})

describe('Befund des Kontrolleurs', () => {
  it('gibt eine verankerte, korrekt gegengeloeste Aufgabe frei', () => {
    const verdict = buildControlVerdict({
      task: task(),
      sourceAligned: true,
      counterAnswer: '255.255.255.192',
    })
    expect(verdict.passed).toBe(true)
    expect(verdict.counterSolved).toBe(true)
  })

  it('haelt eine Aufgabe mit abweichender Gegenloesung zurueck', () => {
    const verdict = buildControlVerdict({
      task: task(),
      sourceAligned: true,
      counterAnswer: '255.255.255.224',
    })
    expect(verdict.passed).toBe(false)
    expect(verdict.counterSolved).toBe(false)
    expect(verdict.issues.join(' ')).toMatch(/weicht ab/)
  })

  it('haelt eine Aufgabe ohne Quellenverankerung zurueck', () => {
    const verdict = buildControlVerdict({ task: task(), sourceAligned: false, counterAnswer: '255.255.255.192' })
    expect(verdict.passed).toBe(false)
  })

  it('unterscheidet „nicht gegengeloest" von „gegengeloest und abweichend"', () => {
    const open = buildControlVerdict({ task: task({ format: 'justification' }), sourceAligned: true })
    expect(open.counterSolved).toBeNull()
    expect(open.passed).toBe(true)
  })

  it('wertet eine ausgebliebene Gegenloesung als Fehlschlag, nicht als Freigabe', () => {
    const verdict = buildControlVerdict({ task: task(), sourceAligned: true, counterAnswer: '' })
    expect(verdict.counterSolved).toBe(false)
    expect(verdict.passed).toBe(false)
  })

  it('uebernimmt materialInsufficient bei einer abgelehnten Aufgabe', () => {
    const verdict = buildControlVerdict({ task: task(), sourceAligned: false, materialInsufficient: true })
    expect(verdict.materialInsufficient).toBe(true)
  })

  it('ignoriert materialInsufficient bei einer verankerten Aufgabe', () => {
    // Nur aussagekraeftig bei einer Ablehnung (siehe ControlVerdict.materialInsufficient) — ein
    // widerspruechlicher Befund des Kontrolleurs (verankert, aber angeblich Materialluecke) soll
    // nicht versehentlich eine bestandene Aufgabe zum vorzeitigen Aufgeben fuehren.
    const verdict = buildControlVerdict({
      task: task(),
      sourceAligned: true,
      counterAnswer: '255.255.255.192',
      materialInsufficient: true,
    })
    expect(verdict.materialInsufficient).toBe(false)
  })
})

describe('Invariante I5 — Torwaechter', () => {
  it('laesst eine freigegebene Aufgabe durch', () => {
    const verdict = buildControlVerdict({ task: task(), sourceAligned: true, counterAnswer: '255.255.255.192' })
    expect(() => assertTaskCleared(task(), verdict)).not.toThrow()
  })

  it('verhindert die Auslieferung ohne Befund', () => {
    expect(() => assertTaskCleared(task(), null)).toThrow(InvariantViolation)
  })

  it('verhindert die Auslieferung ohne Quellenverankerung', () => {
    const verdict = buildControlVerdict({ task: task(), sourceAligned: false, counterAnswer: '255.255.255.192' })
    expect(() => assertTaskCleared(task(), verdict)).toThrow(InvariantViolation)
  })

  it('verhindert die Auslieferung einer eindeutigen Aufgabe ohne bestandenes Gegenloesen', () => {
    const verdict = buildControlVerdict({ task: task(), sourceAligned: true, counterAnswer: 'falsch' })
    expect(() => assertTaskCleared(task(), verdict)).toThrow(InvariantViolation)
  })
})

describe('Ablaufentscheidung', () => {
  it('liefert eine bestandene Aufgabe aus', () => {
    const verdict = buildControlVerdict({ task: task(), sourceAligned: true, counterAnswer: '255.255.255.192' })
    expect(decideProduction({ task: task(), verdict, attempt: 0 }).status).toBe('ready')
  })

  it('versucht es erneut, solange Versuche uebrig sind', () => {
    const verdict = buildControlVerdict({ task: task(), sourceAligned: false })
    expect(decideProduction({ task: task(), verdict, attempt: 0 }).status).toBe('retry')
  })

  it('gibt nach der letzten Runde auf, statt die Sitzung zu blockieren', () => {
    const verdict = buildControlVerdict({ task: task(), sourceAligned: false })
    const outcome = decideProduction({ task: task(), verdict, attempt: MAX_GENERATION_ATTEMPTS - 1 })
    expect(outcome.status).toBe('abandoned')
  })

  it('gibt sofort auf bei einer Materialluecke, statt Versuche zu verschwenden', () => {
    // Der Auszug aendert sich zwischen Versuchen nicht — eine Wiederholung wuerde am selben
    // fehlenden Beleg scheitern (I11). Bereits beim ersten Versuch (attempt: 0), nicht erst am Ende.
    const verdict = buildControlVerdict({ task: task(), sourceAligned: false, materialInsufficient: true })
    const outcome = decideProduction({ task: task(), verdict, attempt: 0 })
    expect(outcome.status).toBe('abandoned')
  })

  it('gibt bei einer Auswahlfrage NICHT sofort auf, auch wenn Material gemeldet wird', () => {
    /*
     * Ablenker sind falsche Aussagen und im Auszug nie belegbar — der Kontrolleur meldet deshalb
     * bei Auswahlfragen faelschlich eine Materialluecke, obwohl nur die Ablenker unpassend
     * gewaehlt waren. Ein neuer Versuch zieht andere Ablenker und kann gelingen; ein Sofortabbruch
     * wuerde hier eine brauchbare Aufgabe an einer Formfrage scheitern lassen.
     */
    const mc = task({ format: 'multipleChoice', depth: 'recognize', options: ['A', 'B', 'C'] })
    const verdict = buildControlVerdict({ task: mc, sourceAligned: false, materialInsufficient: true })
    expect(decideProduction({ task: mc, verdict, attempt: 0 }).status).toBe('retry')
  })

  it('gibt auch bei einer Auswahlfrage nach der letzten Runde auf', () => {
    const mc = task({ format: 'multipleChoice', depth: 'recognize', options: ['A', 'B', 'C'] })
    const verdict = buildControlVerdict({ task: mc, sourceAligned: false, materialInsufficient: true })
    const outcome = decideProduction({ task: mc, verdict, attempt: MAX_GENERATION_ATTEMPTS - 1 })
    expect(outcome.status).toBe('abandoned')
  })
})

describe('isKnownTaskFormat', () => {
  it('erkennt die Formate des Katalogs', () => {
    expect(isKnownTaskFormat('multipleChoice')).toBe(true)
    expect(isKnownTaskFormat('matching')).toBe(true)
  })

  it('weist unbekannte Werte ab — etwa einen alten Eintrag im Aufgabenprotokoll', () => {
    expect(isKnownTaskFormat('trueFalse')).toBe(false)
    expect(isKnownTaskFormat('')).toBe(false)
  })
})

describe('buildRejectionHint — der naechste Versuch weiss, woran der letzte scheiterte', () => {
  it('gibt den Befund des Kontrolleurs unveraendert zurueck', () => {
    // Der beobachtete Fall: die Musterloesung ergaenzt ein zutreffendes, aber unbelegtes Merkmal.
    const hint = buildRejectionHint([
      'Die Musterloesung ergaenzt, dass Besitzsteuern unabhaengig von Nutzung oder Ertrag erhoben werden. Diese Einschraenkung steht nicht im Quellmaterial.',
      'Aufgabe laesst sich nicht im Quellmaterial verankern.',
    ])
    expect(hint).toContain('unabhaengig von Nutzung oder Ertrag')
    // Der zusammenfassende Schlusssatz traegt nichts bei und darf den Grund nicht verduennen.
    expect(hint).not.toContain('nicht im Quellmaterial verankern')
  })

  it('gibt auch die Abweichung beim Gegenloesen zurueck', () => {
    const verdict = buildControlVerdict({
      task: task({ format: 'multipleChoice', depth: 'recognize', options: ['A', 'B'] }),
      sourceAligned: true,
      counterAnswer: 'etwas ganz anderes',
    })
    expect(buildRejectionHint(verdict.issues)).toContain('Unabhaengige Loesung weicht ab')
  })

  it('gibt null zurueck, wenn nur der Schlusssatz uebrig bleibt', () => {
    // Dann bleibt es beim bisherigen Verhalten: wiederholen ohne Hinweis, statt einen leeren zu senden.
    expect(buildRejectionHint(['Aufgabe laesst sich nicht im Quellmaterial verankern.'])).toBeNull()
    expect(buildRejectionHint([])).toBeNull()
    expect(buildRejectionHint(['   '])).toBeNull()
  })

  it('behandelt jeden Ablehnungsgrund gleich — auch einen bisher unbekannten', () => {
    // Keine Fallunterscheidung nach Fehlerart: was der Kontrolleur beanstandet, geht zurueck.
    expect(buildRejectionHint(['Ein Grund, den es heute noch nicht gibt.'])).toBe(
      'Ein Grund, den es heute noch nicht gibt.',
    )
  })
})

describe('promptReferencesTheSource — die Frage handelt vom Dokument statt von der Sache', () => {
  it('erkennt die beobachteten Wendungen', () => {
    expect(promptReferencesTheSource('Im Dossier wird genannt, dass Besitzsteuern erhoben werden. Welche?')).toBe(true)
    expect(promptReferencesTheSource('Laut dem Text: was ist der Nettolohn?')).toBe(true)
    expect(promptReferencesTheSource('Welche der im Material aufgefuehrten Steuern ist eine Besitzsteuer?')).toBe(true)
    expect(promptReferencesTheSource('Nach diesem Abschnitt — was gilt fuer Minderjaehrige?')).toBe(true)
    expect(promptReferencesTheSource('Was wird im vorliegenden Skript zur Steuerpflicht gesagt?')).toBe(true)
  })

  it('laesst eine Frage nach der Sache in Ruhe', () => {
    expect(promptReferencesTheSource('Was sind Besitzsteuern?')).toBe(false)
    expect(promptReferencesTheSource('Berechne den Nettolohn aus einem Bruttolohn von 6000 Franken.')).toBe(false)
    expect(promptReferencesTheSource('Ordne jeden Begriff der passenden Beschreibung zu.')).toBe(false)
  })

  it('laesst Verweise auf die Aufgabe selbst in Ruhe — sonst waere die Fehlersuche unmoeglich', () => {
    // `errorHunt` legt eine Loesung vor, auf die der Fragetext verweisen MUSS.
    expect(promptReferencesTheSource('In der folgenden Loesung steckt genau ein Fehler. Wo?')).toBe(false)
    expect(promptReferencesTheSource('Pruefe die untenstehende Rechnung auf ihren Ansatz.')).toBe(false)
    // Ein Szenario darf einen Fall schildern.
    expect(promptReferencesTheSource('Eine Familie zieht in eine andere Gemeinde. Was aendert sich?')).toBe(false)
  })

  it('verwechselt zusammengesetzte Woerter nicht mit dem Dokument', () => {
    // „Quellensteuer" enthaelt „Quelle", meint aber die Sache — die Wortgrenze faengt das ab.
    expect(promptReferencesTheSource('Wer unterliegt in der Schweiz der Quellensteuer?')).toBe(false)
    expect(promptReferencesTheSource('Was gehoert in Textform zum Arbeitsvertrag?')).toBe(false)
  })

  it('bewertet Zuordnungs-Beschreibungen nach demselben Massstab', () => {
    // Dieselbe Blickrichtung, eine Ebene tiefer — beide teilen sich das Muster.
    expect(descriptionsDescribeTheText(['Die im Dossier genannten Beispiele dafuer'])).toBe(true)
    expect(descriptionsDescribeTheText(['Steuerfreier Sockelbetrag'])).toBe(false)
  })
})
