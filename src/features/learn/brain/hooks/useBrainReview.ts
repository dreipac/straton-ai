/**
 * Der Wiederholungsstapel (UI-Spezifikation Kapitel 5).
 *
 * Die zweite Oberflaeche, die der Planer speist — und die einzige, die aus einem Vorrat schoepft
 * statt in Echtzeit zu erzeugen (Architekturkapitel 7.1). Der Unterschied ist kein technisches
 * Detail, sondern das Produkterlebnis: „Bei siebzehn kurzen Abfragen, die man im Zug durchklickt,
 * ist Tempo das ganze Produkterlebnis."
 *
 * Drei Grenzen sind hier verdrahtet:
 *
 *  - **Was hineindarf**, entscheidet `planner/responsibility.ts` und sonst nichts (Kapitel 6.7).
 *    Dieser Hook filtert nicht selbst; er nimmt die Warteschlange, wie sie kommt.
 *  - **Auf welcher Tiefe** gearbeitet wird, steht fest: Erkennen. `assertReviewOnly` macht jeden
 *    Abweichungsversuch zum Fehler statt zur Abkuerzung.
 *  - **Was eine Antwort bewirkt**, ist dasselbe wie im Pfad: direkte Evidenz bewegt die
 *    Beherrschung (I1). „Verpatzte Wiederholungen senken die Beherrschung und koennen ein Konzept
 *    zurueck in den Pfad rutschen lassen."
 */

import { useCallback, useRef, useState } from 'react'
import type {
  BrainConcept,
  BrainPrerequisiteEdge,
  ExaminerVerdict,
  GeneratedTask,
  LearnerConceptImage,
} from '../types'
import type { LearnGenerationMode } from '../../services/learn.persistence'
import { emptyImage } from '../memory/learnerImage'
import { perceiveGradedAnswer } from '../perception/evidence'
import { ESCALATION_THRESHOLD } from '../perception/examiner'
import { generateClearedTask } from '../production/generateTask'
import { buildPlaceholderTask, evaluatePlaceholderVerdict, placeholderDelay } from '../production/placeholderTask'
import {
  assertReviewOnly,
  buildStock,
  nextFromStock,
  reviewStackFormats,
  REVIEW_STOCK_SIZE,
  topUpStock,
  type ReviewStock,
} from '../production/reviewStock'
import { REVIEW_STACK_DEPTH, buildReviewQueue } from '../planner/responsibility'
import { SHORT_SESSION_ITEMS } from '../ui/reviewView'
import { callWithEscalation } from '../agents/client'
import { parseExaminerResult } from '../agents/contracts'
import { loadReviewStocks, saveReviewStock } from '../services/brainReviewStock.persistence'
import { recordErrorObservation, recordEvidenceEvent } from '../services/brainEvidence.persistence'
import { upsertLearnerImages } from '../services/brainMemory.persistence'
import { addEvidenceWeight } from '../services/brainConsolidation.persistence'

export type ReviewPhase = 'idle' | 'producing' | 'answering' | 'feedback' | 'finished' | 'failed'

export type ReviewStackItemState = {
  conceptId: string
  conceptName: string
  /** Der Faelligkeitsgrund — steht als Kennzeichnung ueber der Abfrage (Kapitel 5.3). */
  reason: string
}

export type BrainReviewState = {
  phase: ReviewPhase
  index: number
  queue: ReviewStackItemState[]
  task: GeneratedTask | null
  verdict: ExaminerVerdict | null
  error: string | null
  /** Die Lernerbilder nach dem Stapel — Grundlage der Abschlussanzeige (Kapitel 5.4). */
  touched: LearnerConceptImage[]
  /** Wurde der Stapel vorzeitig verlassen? Aendert nichts an den verbuchten Antworten. */
  aborted: boolean
}

const INITIAL: BrainReviewState = {
  phase: 'idle',
  index: 0,
  queue: [],
  task: null,
  verdict: null,
  error: null,
  touched: [],
  aborted: false,
}

export type UseBrainReviewArgs = {
  userId: string | null
  pathId: string | null
  concepts: BrainConcept[]
  edges: BrainPrerequisiteEdge[]
  images: Map<string, LearnerConceptImage>
  sourceExcerptFor: (conceptId: string) => string
  /**
   * Websuche fuer den Fall, dass das Material die Frage stellt, ohne sie zu beantworten.
   * Optional — ohne sie faellt die Erzeugung auf das Fachwissen des Modells zurueck, nie auf
   * einen Abbruch. Siehe `GenerateTaskArgs.searchWeb`.
   */
  searchWeb?: (query: string) => Promise<string>
  subject: string
  examinerEscalationAvailable?: boolean
  /** Platzhalter-Modus (Admin-Test ohne API-Kosten) — siehe `production/placeholderTask.ts`. */
  generationMode: LearnGenerationMode
}

export function useBrainReview(args: UseBrainReviewArgs) {
  const [state, setState] = useState<BrainReviewState>(INITIAL)

  /*
   * Warteschlange und Lernerbilder liegen in Refs: der Stapel wird beim Start festgeschrieben.
   * Waechst er waehrenddessen mit — weil ein Konzept in der Zwischenzeit faellig wird —, aendert
   * sich die angezeigte Laenge mitten im Lauf, und der Zaehler aus Kapitel 5.7 waere genau die
   * springende Zahl, die er nicht sein darf.
   */
  const queueRef = useRef<ReviewStackItemState[]>([])
  const imagesRef = useRef<Map<string, LearnerConceptImage>>(new Map())
  const stocksRef = useRef<Map<string, ReviewStock>>(new Map())

  const conceptById = useCallback(
    (conceptId: string) => args.concepts.find((concept) => concept.id === conceptId) ?? null,
    [args.concepts],
  )

  /**
   * Einen Vorrat fuer ein Konzept erzeugen.
   *
   * Die Abfragen entstehen nebenlaeufig: vier Erzeugungen nacheinander waeren beim Neuanlegen
   * genau die Wartezeit, die der Vorrat vermeiden soll. Jede einzelne laeuft trotzdem durch den
   * Torwaechter (I5) — Tempo aendert nichts an der Freigabepflicht.
   */
  const produceStock = useCallback(
    async (concept: BrainConcept, image: LearnerConceptImage, count: number): Promise<GeneratedTask[]> => {
      const formats = reviewStackFormats()
      const sourceExcerpt = args.sourceExcerptFor(concept.id)

      const reason = image.reviewReason ?? 'Auffrischung aus deinem faelligen Stapel.'
      const produced = await Promise.all(
        Array.from({ length: count }, (_, index) => {
          const format = formats[index % formats.length]
          assertReviewOnly({ depth: REVIEW_STACK_DEPTH, fromReviewStack: true })
          if (args.generationMode === 'placeholder') {
            return placeholderDelay().then(() =>
              buildPlaceholderTask({ concept, depth: REVIEW_STACK_DEPTH, format, reason }),
            )
          }
          return generateClearedTask({
            concept,
            depth: REVIEW_STACK_DEPTH,
            format,
            sourceExcerpt,
            reason,
            ...(args.searchWeb ? { searchWeb: args.searchWeb } : {}),
          }).catch(() => null)
        }),
      )

      return produced.filter((task): task is GeneratedTask => task != null)
    },
    [args],
  )

  /** Die naechste Abfrage besorgen — aus dem Vorrat, wenn er traegt. */
  const serveTask = useCallback(
    async (conceptId: string): Promise<GeneratedTask> => {
      const concept = conceptById(conceptId)
      if (!concept) {
        throw new Error('Das Konzept zu dieser Abfrage wurde nicht gefunden.')
      }
      const image = imagesRef.current.get(conceptId) ?? emptyImage(conceptId, concept.difficulty)
      const decision = nextFromStock(stocksRef.current.get(conceptId) ?? null, image)

      if (decision.action === 'regenerate') {
        const tasks = await produceStock(concept, image, REVIEW_STOCK_SIZE)
        if (tasks.length === 0) {
          throw new Error(`Zu „${concept.name}" liess sich gerade keine saubere Abfrage erzeugen.`)
        }
        const stock = buildStock({ conceptId, tasks, image, nowIso: new Date().toISOString() })
        // Der erste Ausspielvorgang zaehlt mit, sonst begaenne die Rotation zweimal vorn.
        const served = nextFromStock(stock, image)
        const next = served.action === 'regenerate' ? stock : served.next
        stocksRef.current.set(conceptId, next)
        if (args.userId) {
          void saveReviewStock(args.userId, next).catch(() => {})
        }
        return served.action === 'regenerate' ? tasks[0] : served.item.task
      }

      stocksRef.current.set(conceptId, decision.next)
      if (args.userId) {
        void saveReviewStock(args.userId, decision.next).catch(() => {})
      }

      if (decision.action === 'serveAndRefill') {
        /*
         * Nachfuellen im Hintergrund: der Vorrat traegt noch, er geht nur zur Neige. Die Person
         * wartet dabei nicht — genau darin unterscheidet sich Nachfuellen vom Neuerzeugen.
         */
        void produceStock(concept, image, decision.missing).then((tasks) => {
          if (tasks.length === 0) {
            return
          }
          const filled = topUpStock(stocksRef.current.get(conceptId) ?? decision.next, tasks)
          stocksRef.current.set(conceptId, filled)
          if (args.userId) {
            void saveReviewStock(args.userId, filled).catch(() => {})
          }
        }).catch(() => {})
      }

      return decision.item.task
    },
    [args.userId, conceptById, produceStock],
  )

  /**
   * Den Stapel starten.
   *
   * `limit` unterscheidet „Stapel starten" von „Nur 3 Minuten" (Kapitel 5.2) — und sonst nichts.
   * Der kurze Durchgang ist kein anderer Modus, sondern derselbe Stapel mit weniger Abfragen;
   * jede beantwortete zaehlt gleich viel.
   */
  const start = useCallback(
    async (limit?: number) => {
      if (!args.userId || !args.pathId) {
        return
      }

      const nowIso = new Date().toISOString()
      const nameById = new Map(args.concepts.map((concept) => [concept.id, concept.name]))
      const entries = buildReviewQueue(args.images.values(), nowIso)
        .filter((entry) => nameById.has(entry.conceptId))
        .slice(0, limit ?? Number.MAX_SAFE_INTEGER)

      if (entries.length === 0) {
        return
      }

      queueRef.current = entries.map((entry) => ({
        conceptId: entry.conceptId,
        conceptName: nameById.get(entry.conceptId) ?? entry.conceptId,
        reason: entry.reason,
      }))
      imagesRef.current = new Map(args.images)

      setState({ ...INITIAL, phase: 'producing', queue: queueRef.current })

      try {
        stocksRef.current = await loadReviewStocks(queueRef.current.map((entry) => entry.conceptId))
        const task = await serveTask(queueRef.current[0].conceptId)
        setState((current) => ({ ...current, phase: 'answering', task }))
      } catch (cause) {
        setState((current) => ({
          ...current,
          phase: 'failed',
          error: cause instanceof Error ? cause.message : 'Der Stapel konnte nicht geladen werden.',
        }))
      }
    },
    [args.concepts, args.images, args.pathId, args.userId, serveTask],
  )

  /** Eine Antwort bewerten und verbuchen — derselbe Weg wie im Pfad (I1, I2). */
  const answer = useCallback(
    async (userAnswer: string) => {
      const entry = queueRef.current[state.index]
      const task = state.task
      const concept = entry ? conceptById(entry.conceptId) : null
      if (!entry || !task || !concept || !args.userId || !args.pathId) {
        return
      }

      setState((current) => ({ ...current, phase: 'producing' }))

      try {
        const examined =
          args.generationMode === 'placeholder'
            ? await placeholderDelay(150).then(() => ({
                data: evaluatePlaceholderVerdict({ concept, task, userAnswer }),
                model: 'platzhalter',
                provider: 'platzhalter',
                escalated: false,
              }))
            : await callWithEscalation({
                role: 'pruefer',
                payload: {
                  conceptName: concept.name,
                  taskPrompt: task.prompt,
                  expectedAnswer: task.expectedAnswer,
                  userAnswer,
                  subject: args.subject,
                  depth: REVIEW_STACK_DEPTH,
                },
                parse: (raw) => parseExaminerResult(raw, args.subject),
                needsEscalation: (verdict) => verdict.confidence < ESCALATION_THRESHOLD,
              })

        const image = imagesRef.current.get(concept.id) ?? emptyImage(concept.id, concept.difficulty)
        const result = perceiveGradedAnswer({
          userId: args.userId,
          pathId: args.pathId,
          conceptId: concept.id,
          image,
          images: imagesRef.current,
          edges: args.edges,
          conceptNames: new Map(args.concepts.map((item) => [item.id, item.name])),
          verdict: examined.data,
          depth: REVIEW_STACK_DEPTH,
          format: task.format,
          difficulty: concept.difficulty,
          escalationAvailable: args.examinerEscalationAvailable ?? false,
          nowIso: new Date().toISOString(),
        })

        const touched = [result.updated, ...result.propagated]
        for (const item of touched) {
          imagesRef.current.set(item.conceptId, item)
        }
        await upsertLearnerImages(args.userId, touched)

        const eventId = await recordEvidenceEvent(result.event)
        if (result.event.verdict.cause) {
          await recordErrorObservation({
            userId: args.userId,
            pathId: args.pathId,
            conceptId: concept.id,
            evidenceEventId: eventId,
            cause: result.event.verdict.cause,
            occurredAt: result.event.occurredAt,
          })
        }

        void addEvidenceWeight({
          userId: args.userId,
          pathId: args.pathId,
          weight: result.event.evidenceWeight,
        }).catch(() => {})

        setState((current) => ({
          ...current,
          phase: 'feedback',
          verdict: examined.data,
          touched: [...current.touched.filter((item) => item.conceptId !== concept.id), result.updated],
        }))
      } catch (cause) {
        setState((current) => ({
          ...current,
          phase: 'failed',
          error: cause instanceof Error ? cause.message : 'Die Antwort konnte nicht bewertet werden.',
        }))
      }
    },
    [args, conceptById, state.index, state.task],
  )

  /** Weiter im Stapel. Kein zweiter Versuch — dieselbe Regel wie in der Sitzung (Kapitel 4.7). */
  const next = useCallback(async () => {
    const nextIndex = state.index + 1
    const entry = queueRef.current[nextIndex]

    if (!entry) {
      setState((current) => ({ ...current, phase: 'finished' }))
      return
    }

    setState((current) => ({ ...current, index: nextIndex, task: null, verdict: null, phase: 'producing' }))
    try {
      const task = await serveTask(entry.conceptId)
      setState((current) => ({ ...current, phase: 'answering', task }))
    } catch (cause) {
      setState((current) => ({
        ...current,
        phase: 'failed',
        error: cause instanceof Error ? cause.message : 'Die naechste Abfrage konnte nicht geladen werden.',
      }))
    }
  }, [serveTask, state.index])

  /** Abbrechen verwirft nichts (Kapitel 5.4) — der Stapel endet nur frueher. */
  const abort = useCallback(() => {
    setState((current) => ({ ...current, phase: 'finished', aborted: true }))
  }, [])

  const reset = useCallback(() => {
    queueRef.current = []
    stocksRef.current = new Map()
    setState(INITIAL)
  }, [])

  /** „Nur 3 Minuten" (Kapitel 5.2) — derselbe Stapel, nur kuerzer. */
  const startShort = useCallback(() => start(SHORT_SESSION_ITEMS), [start])

  return { state, start, startShort, answer, next, abort, reset }
}
