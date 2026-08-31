/**
 * Schicht 3 — der Pruefer (Kapitel 5.2 und 5.3).
 *
 * Diese Datei enthaelt NICHT den Modellaufruf (der liegt in `agents/client.ts`), sondern das,
 * was mit seiner Ausgabe geschieht: sie validieren, und aus der Zuversicht die richtige
 * Reaktion ableiten.
 *
 * Warum die Zuversicht die wichtigste der drei Angaben ist (Kapitel 5.3): bei offenen Antworten
 * ist eine Bewertung manchmal eindeutig und manchmal Auslegungssache. Ein Pruefer ohne
 * Zuversichtsangabe behauptet in beiden Faellen gleich selbstbewusst etwas, und das Gehirn
 * uebernaehme es gleich stark.
 *
 * Rein — kein DOM, kein I/O.
 */

import type { ErrorCause, ErrorCauseKind, ExaminerVerdict } from '../types'

/** Unterhalb dieser Zuversicht bewegt eine Bewertung das Lernerbild nur noch schwach. */
export const LOW_CONFIDENCE_THRESHOLD = 0.6

/** Unterhalb dieser Zuversicht wird der Fall an ein staerkeres Modell weitergereicht. */
export const ESCALATION_THRESHOLD = 0.45

const CAUSE_KINDS: readonly ErrorCauseKind[] = ['confused', 'omitted', 'misapplied', 'overlooked']

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(1, value))
}

function asString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/**
 * Die Ausgabe des Pruefermodells in die halbstrukturierte Form bringen (Kapitel 5.2).
 *
 * „Freiheit im Inhalt, Disziplin in der Form." Reine Prosa laesst sich spaeter nicht gruppieren,
 * eine feste Auswahlliste wuerde Fachspezifisches nie finden. Deshalb ist `kind` eine feste
 * Auswahl und `object` frei.
 *
 * Ein unbekanntes `kind` wird NICHT geraten, sondern auf 'misapplied' gesetzt und im Rohtext
 * bewahrt — raten wuerde die spaetere Mustergruppierung mit erfundener Struktur vergiften.
 */
export function parseExaminerVerdict(raw: unknown, fallbackSubject = ''): ExaminerVerdict {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  const credit = clamp01(Number(source.credit ?? source.score ?? 0))
  const confidence = clamp01(Number(source.confidence ?? source.examinerConfidence ?? 0.5))

  const partialRaw = source.partialCredit
  const partialCredit: Record<string, number> = {}
  if (partialRaw && typeof partialRaw === 'object') {
    for (const [key, value] of Object.entries(partialRaw as Record<string, unknown>)) {
      const numeric = Number(value)
      if (Number.isFinite(numeric)) {
        partialCredit[key.slice(0, 40)] = clamp01(numeric)
      }
    }
  }

  let cause: ErrorCause | null = null
  const causeRaw = source.cause
  if (causeRaw && typeof causeRaw === 'object') {
    const c = causeRaw as Record<string, unknown>
    const kindRaw = asString(c.kind, 40)
    const object = asString(c.object, 160)
    const rawDescription = asString(c.rawDescription ?? c.description, 500)
    if (object || rawDescription) {
      cause = {
        kind: (CAUSE_KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as ErrorCauseKind) : 'misapplied',
        object,
        rawDescription,
        subject: asString(c.subject, 80) || fallbackSubject,
      }
    }
  }

  return { credit, partialCredit, cause, confidence }
}

/**
 * Reaktion auf die Zuversicht des Pruefers (Kapitel 5.3).
 *
 * Bei niedriger Zuversicht wird das Lernerbild nur schwach bewegt und stattdessen eine von zwei
 * Reaktionen ausgeloest:
 *  - dieselbe Sache wird spaeter anders verpackt erneut gefragt, oder
 *  - der Fall wird an ein staerkeres Modell weitergereicht.
 *
 * Hier wird die Mehrmodellarchitektur zum ersten Mal funktional statt dekorativ: das schnelle,
 * guenstige Modell erledigt den Normalfall, das teure wird nur bei Zweifel geweckt. Derselbe
 * Mechanismus wie im biologischen Gehirn — Routine laeuft automatisch, Zweifel zieht
 * Aufmerksamkeit an.
 */
export type ExaminerReaction = {
  /** An ein staerkeres Modell weiterreichen. */
  escalate: boolean
  /** Dieselbe Sache spaeter anders verpackt erneut fragen. */
  reask: boolean
  /** Faktor auf das Evidenzgewicht, 0..1. */
  weightFactor: number
}

export function reactionFor(verdict: ExaminerVerdict, options: { escalationAvailable: boolean }): ExaminerReaction {
  const confidence = clamp01(verdict.confidence)

  if (confidence < ESCALATION_THRESHOLD) {
    // Nur eskalieren, wenn ein staerkeres Modell konfiguriert ist. Sonst bleibt als Reaktion
    // das erneute, anders verpackte Fragen — die Bewertung darf nicht einfach voll durchschlagen.
    return options.escalationAvailable
      ? { escalate: true, reask: false, weightFactor: 0 }
      : { escalate: false, reask: true, weightFactor: confidence }
  }

  if (confidence < LOW_CONFIDENCE_THRESHOLD) {
    return { escalate: false, reask: true, weightFactor: confidence }
  }

  return { escalate: false, reask: false, weightFactor: 1 }
}

/**
 * Sind die Teilpunkte in sich schluessig?
 *
 * „Rechenweg korrekt, Ergebnis falsch" ist eine andere Diagnose als „Ansatz falsch" — aber nur,
 * solange die Teilpunkte zum Gesamtwert passen. Ein Gesamtwert von 1.0 bei durchweg leeren
 * Teilpunkten ist ein Modellfehler und soll die Zuversicht senken, statt unbemerkt einzulaufen.
 */
export function partialCreditIsConsistent(verdict: ExaminerVerdict): boolean {
  const values = Object.values(verdict.partialCredit)
  if (values.length === 0) {
    return true
  }
  const average = values.reduce((sum, v) => sum + v, 0) / values.length
  return Math.abs(average - verdict.credit) <= 0.35
}

/** Zuversicht abwerten, wenn die Bewertung in sich nicht schluessig ist. */
export function calibrateConfidence(verdict: ExaminerVerdict): ExaminerVerdict {
  if (partialCreditIsConsistent(verdict)) {
    return verdict
  }
  return { ...verdict, confidence: clamp01(verdict.confidence * 0.5) }
}
