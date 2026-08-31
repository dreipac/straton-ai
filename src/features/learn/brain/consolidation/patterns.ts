/**
 * Schicht 6 — Fehlermuster (Kapitel 10).
 *
 * Muster entstehen FREI. Es gibt keinen vordefinierten Katalog: „Ein fester Katalog kann nur
 * finden, was vorher gedacht wurde. Fachspezifische Muster wie ‚verwechselt Netz- und
 * Broadcast-Adresse' — die nuetzlichsten — kaemen darin nie vor."
 *
 * Das bekannte Risiko ist das Ausfransen: „Liest zu schnell", „ueberfliegt die Aufgabe" und
 * „uebersieht Angaben" sind dreimal dasselbe in drei Formulierungen. Kapitel 10 nennt vier
 * Auflagen dagegen, und alle vier stehen hier:
 *
 *  1. Halbstrukturierte Form — `kind` ist eine feste Auswahl, `object` ist frei. Gruppiert wird
 *     ueber beides, nicht ueber Prosa.
 *  2. Herkunft mitschreiben — jedes Auftreten merkt sich Konzept und Fach. Daraus beantwortet
 *     sich von selbst, ob ein Muster generisch oder fachspezifisch ist. Diese Information ist
 *     nachtraeglich NICHT rekonstruierbar.
 *  3. Stabile Namen (Invariante I12).
 *  4. Musterverschmelzung folgt derselben Regel wie Konzeptverschmelzung — zerstoererisch, also
 *     Protokoll und Ruecknahme.
 *
 * GELTUNGSBEREICH (Kapitel 10, neu in 1.1): Der Katalog wird **pro Nutzer** gefuehrt, nicht pro
 * Lernpfad. Deshalb kommt in dieser Datei keine `pathId` vor, und `ErrorObservation` traegt
 * keine — die Gruppierung darf gar nicht erst die Moeglichkeit haben, nach Pfad zu trennen.
 *
 * „Ohne pfadueebergreifende Sammlung erreicht ein generisches Muster die Anzeigeschwelle unter
 *  Umstaenden nie, weil sich die Belege auf mehrere Pfade verteilen und keiner allein genuegend
 *  Evidenz hat. Genau die generischen Muster sind aber die wertvollsten."
 *
 * Abgrenzung zu Entscheidung 4: Wissensgraph und Lernerbild bleiben pro Lernpfad getrennt — die
 * Konzepte von „Netzwerke" und „Steuern" haben nichts miteinander zu tun. Nur der Musterkatalog
 * liegt eine Ebene hoeher, beim Nutzer. Genau deshalb ist `subject` (das Fach) das Feld, an dem
 * sich generisch von fachspezifisch unterscheidet: es ersetzt die Pfadzugehoerigkeit als
 * Streuungsmass, ohne die Sammlung zu zerschneiden.
 *
 * Rein — kein DOM, kein I/O.
 */

import type { ErrorCauseKind, ErrorPattern } from '../types'
import { assertPatternNameStable } from '../invariants'

/** Ein einzelnes Auftreten, so wie es aus `learn_error_observations` kommt. */
export type ErrorObservation = {
  id: string
  conceptId: string
  kind: ErrorCauseKind
  object: string
  rawDescription: string
  /** Herkunft — Auflage 2. Ohne dieses Feld ist `scope` nicht bestimmbar. */
  subject: string
  occurredAt: string
}

/**
 * Anzeigeschwelle (Kapitel 10).
 *
 * „Die Schwelle ist keine reine Zahl, sondern Wiederholung ueber verschiedene Konzepte und
 *  ueber Zeit. Sieben Fehler an einem mueden Abend in einem einzigen Thema sind kein
 *  Charakterzug, sondern ein schlechter Abend."
 *
 * Deshalb drei Bedingungen statt einer Zahl.
 */
export const SURFACE_MIN_OCCURRENCES = 4
export const SURFACE_MIN_DISTINCT_CONCEPTS = 2
export const SURFACE_MIN_DISTINCT_DAYS = 3

/** Ab so vielen unverwandten Konzepten gilt ein Muster als generisch statt fachspezifisch. */
export const GENERIC_MIN_DISTINCT_SUBJECTS = 2
export const GENERIC_MIN_DISTINCT_CONCEPTS = 4

/**
 * Objektbeschreibungen normalisieren, damit „Netz- und Broadcast-Adresse" und
 * „netz und broadcastadresse" zusammenfallen.
 *
 * Bewusst konservativ: Kleinschreibung, Bindestriche und Fuellwoerter weg, Rest bleibt. Eine
 * aggressivere Normalisierung wuerde unterschiedliche Fehler zusammenwerfen — und ein Muster,
 * das zwei Dinge meint, ist als Einsicht wertlos.
 */
const FILLER_WORDS = new Set(['der', 'die', 'das', 'und', 'oder', 'von', 'zu', 'bei', 'im', 'in', 'den', 'dem'])

export function normaliseObject(value: string): string {
  return value
    .toLowerCase()
    .replace(/[-–—/]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter((word) => word.length > 0 && !FILLER_WORDS.has(word))
    .sort()
    .join(' ')
}

/** Gruppierungsschluessel eines Auftretens: feste Form plus normalisiertes Objekt. */
export function groupKeyOf(observation: Pick<ErrorObservation, 'kind' | 'object'>): string {
  return `${observation.kind}::${normaliseObject(observation.object)}`
}

export type PatternCandidate = {
  key: string
  kind: ErrorCauseKind
  object: string
  observations: ErrorObservation[]
  distinctConceptIds: string[]
  subjects: string[]
  distinctDays: number
  firstSeenAt: string
  lastSeenAt: string
}

function dayOf(iso: string): string {
  return iso.slice(0, 10)
}

/**
 * Auftreten zu Kandidaten gruppieren.
 *
 * Als Objektbeschreibung des Kandidaten wird die HAEUFIGSTE Originalformulierung genommen, nicht
 * die normalisierte: der Name soll spaeter lesbar sein, nicht wie ein Datenbankschluessel.
 */
export function groupObservations(observations: ErrorObservation[]): PatternCandidate[] {
  const groups = new Map<string, ErrorObservation[]>()
  for (const observation of observations) {
    const key = groupKeyOf(observation)
    const bucket = groups.get(key)
    if (bucket) {
      bucket.push(observation)
    } else {
      groups.set(key, [observation])
    }
  }

  const candidates: PatternCandidate[] = []
  for (const [key, group] of groups) {
    const sorted = [...group].sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1))

    const objectCounts = new Map<string, number>()
    for (const observation of group) {
      const label = observation.object.trim()
      if (label.length > 0) {
        objectCounts.set(label, (objectCounts.get(label) ?? 0) + 1)
      }
    }
    const object =
      [...objectCounts.entries()].sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : 1))[0]?.[0] ?? ''

    candidates.push({
      key,
      kind: sorted[0].kind,
      object,
      observations: sorted,
      distinctConceptIds: [...new Set(group.map((o) => o.conceptId))].sort(),
      subjects: [...new Set(group.map((o) => o.subject).filter((s) => s.trim().length > 0))].sort(),
      distinctDays: new Set(group.map((o) => dayOf(o.occurredAt))).size,
      firstSeenAt: sorted[0].occurredAt,
      lastSeenAt: sorted[sorted.length - 1].occurredAt,
    })
  }

  return candidates.sort((a, b) =>
    b.observations.length !== a.observations.length
      ? b.observations.length - a.observations.length
      : a.key < b.key
        ? -1
        : 1,
  )
}

/**
 * Generisch oder fachspezifisch?
 *
 * Ergibt sich allein aus der mitgeschriebenen Herkunft: ein Muster ueber viele unverwandte
 * Konzepte und mehrere Faecher ist generisch, eines, das sich in einer Ecke des Graphen ballt,
 * fachspezifisch.
 *
 * Generische Muster sind besonders wertvoll, weil sie das Fach ueberdauern: „Du liest
 * Aufgabenstellungen zu schnell" gilt in Netzwerktechnik genauso wie in Recht und Mathematik.
 * Das ist die Aussage, die einen Nutzer tatsaechlich trifft — kein Lehrer mit 24 Schuelern und
 * kein Chatbot ohne Gedaechtnis liefert das.
 */
export function scopeOf(candidate: PatternCandidate): ErrorPattern['scope'] {
  if (candidate.distinctConceptIds.length < 2) {
    return 'unknown'
  }
  if (
    candidate.subjects.length >= GENERIC_MIN_DISTINCT_SUBJECTS ||
    candidate.distinctConceptIds.length >= GENERIC_MIN_DISTINCT_CONCEPTS
  ) {
    return 'generic'
  }
  return 'domainSpecific'
}

const KIND_PHRASE: Record<ErrorCauseKind, string> = {
  confused: 'Verwechselt',
  omitted: 'Laesst aus',
  misapplied: 'Wendet falsch an',
  overlooked: 'Uebersieht',
}

/**
 * Einen Namen taufen (Invariante I12: ab jetzt stabil).
 *
 * Feste Satzform aus der Auswahl plus freiem Objekt — genau die halbstrukturierte Form aus
 * Kapitel 5.2, jetzt als lesbarer Name. „Verwechselt Netz- und Broadcast-Adresse" ist ein Satz,
 * den ein Nutzer ueber sich selbst versteht.
 */
export function nameFor(candidate: PatternCandidate): string {
  const object = candidate.object.trim()
  if (object.length === 0) {
    return KIND_PHRASE[candidate.kind]
  }
  return `${KIND_PHRASE[candidate.kind]} ${object}`.slice(0, 120)
}

/**
 * Anzeigeschwelle erreicht?
 *
 * Alle drei Bedingungen muessen erfuellt sein. Fehlt die Verteilung ueber Konzepte oder ueber
 * Tage, ist es ein schlechter Abend und kein Charakterzug.
 *
 * Wichtig, und leicht zu uebersehen: intern nutzt das Gehirn Muster laengst, bevor es sie
 * ausspricht. Es handelt auf Verdacht, es redet nur ueber Gewissheit. Diese Funktion steuert
 * nur das REDEN.
 */
export function meetsSurfaceThreshold(candidate: PatternCandidate): boolean {
  return (
    candidate.observations.length >= SURFACE_MIN_OCCURRENCES &&
    candidate.distinctConceptIds.length >= SURFACE_MIN_DISTINCT_CONCEPTS &&
    candidate.distinctDays >= SURFACE_MIN_DISTINCT_DAYS
  )
}

/**
 * Ein Muster aus einem Kandidaten bauen oder ein bestehendes fortschreiben.
 *
 * Beim Fortschreiben bleibt der Name unangetastet — `assertPatternNameStable` schlaegt an, wenn
 * jemand ihn doch aendern will. Umbenennen gibt es nur ueber eine protokollierte Verschmelzung.
 */
export function upsertPattern(args: {
  candidate: PatternCandidate
  existing: ErrorPattern | null
  userId: string
  nowIso: string
}): ErrorPattern {
  const { candidate, existing, userId, nowIso } = args
  const name = existing?.name ?? nameFor(candidate)

  if (existing) {
    assertPatternNameStable(existing.name, name)
  }

  const surfaced = existing?.surfaced === true || meetsSurfaceThreshold(candidate)

  return {
    id: existing?.id ?? '',
    userId,
    name,
    kind: candidate.kind,
    object: candidate.object,
    scope: scopeOf(candidate),
    subjects: candidate.subjects,
    distinctConceptCount: candidate.distinctConceptIds.length,
    occurrenceCount: candidate.observations.length,
    distinctDayCount: candidate.distinctDays,
    surfaced,
    userDisputed: existing?.userDisputed ?? false,
    mergedIntoId: existing?.mergedIntoId ?? null,
    firstSeenAt: existing?.firstSeenAt ?? candidate.firstSeenAt,
    lastSeenAt: nowIso,
  }
}

/**
 * Fastduplikate finden (Auflage 4).
 *
 * „Fastduplikate muessen frueh und konsequent zusammengefuehrt werden, sonst stehen nach drei
 *  Monaten achtzig Muster da, von denen zwanzig dasselbe meinen."
 *
 * Zurueck kommen Paare, nicht Verschmelzungen: eine Musterverschmelzung ist zerstoererisch und
 * braucht denselben Weg wie eine Konzeptverschmelzung — Vorschlag, Bestaetigung, Protokoll.
 */
export function findNearDuplicates(patterns: ErrorPattern[], threshold = 0.6): [ErrorPattern, ErrorPattern][] {
  const pairs: [ErrorPattern, ErrorPattern][] = []
  const active = patterns.filter((pattern) => pattern.mergedIntoId == null)

  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const a = active[i]
      const b = active[j]
      if (a.kind !== b.kind) {
        continue
      }
      if (objectSimilarity(a.object, b.object) >= threshold) {
        pairs.push([a, b])
      }
    }
  }
  return pairs
}

/**
 * Wortueberlappung zweier Objektbeschreibungen (Jaccard).
 *
 * Bewusst simpel: die Entscheidung faellt ohnehin der Nutzer. Diese Funktion muss nur Kandidaten
 * vorschlagen, die es wert sind, gefragt zu werden.
 */
export function objectSimilarity(a: string, b: string): number {
  const wordsA = new Set(normaliseObject(a).split(' ').filter(Boolean))
  const wordsB = new Set(normaliseObject(b).split(' ').filter(Boolean))
  if (wordsA.size === 0 || wordsB.size === 0) {
    return 0
  }
  let intersection = 0
  for (const word of wordsA) {
    if (wordsB.has(word)) {
      intersection += 1
    }
  }
  return intersection / (wordsA.size + wordsB.size - intersection)
}

/**
 * Ein Muster in einen Satz fassen — Beobachtung mit Beleg, kein Urteil.
 *
 * Tonalitaet aus Kapitel 10: kein Charakterurteil, sondern eine Beobachtung mit Zahlen, der man
 * widersprechen kann. Ein Widerspruch ist selbst ein wertvolles Signal.
 */
export function describePattern(pattern: ErrorPattern): string {
  const spread =
    pattern.scope === 'generic'
      ? `ueber ${pattern.distinctConceptCount} verschiedene Themen hinweg`
      : `in ${pattern.distinctConceptCount} verwandten Konzepten`
  return (
    `Mir faellt auf: ${pattern.name.toLowerCase()}. ` +
    `${pattern.occurrenceCount} Mal ${spread}, verteilt ueber ${pattern.distinctDayCount} Tage. ` +
    `Siehst du das auch so?`
  )
}
