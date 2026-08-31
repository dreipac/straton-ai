/**
 * Der Datenhaushalt des Gehirns fuer den Lernpfad-Bereich.
 *
 * Ein Hook statt vieler: alle Bildschirme aus Kapitel 15 der UI-Spezifikation lesen denselben
 * Zustand. Waeren es mehrere Hooks, wuerden Kopfzeile, Jetzt-Karte und Themenliste jeweils
 * eigenstaendig laden — und nach einer Antwort waere die Kopfzeile aktualisiert, die Liste
 * darunter aber noch nicht. Ein Bildschirm, der sich in Teilen aktualisiert, wirkt kaputt.
 *
 * Was hier NICHT passiert:
 *  - Keine Planung. `planSession` ist deterministisch und rein; der Hook ruft es auf, entscheidet
 *    aber nichts selbst (Invariante I11).
 *  - Keine Bewertung. Antworten laufen ueber `perception/evidence.ts`, nicht hier.
 *  - Keine Darstellung. Die Aufbereitung liegt in `brain/ui/`, damit Kapitel 15 pruefbar bleibt.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  BrainConcept,
  BrainPrerequisiteEdge,
  ErrorPattern,
  LearnerConceptImage,
  LearningGoal,
  PathOrderEntry,
  StructureProposal,
  TaskFormat,
} from '../types'
import { planSession, type SessionPlan } from '../planner/planner'
import { buildReviewQueue, responsibilityFor } from '../planner/responsibility'
import { informationGains, initialFrontSearch } from '../coldstart/frontSearch'
import { loadKnowledgeGraph, loadLearnerImages, loadPathOrder } from '../services/brainMemory.persistence'
import { loadActiveGoal } from '../services/brainGoals.persistence'
import { loadLastTaskFormats } from '../services/brainEvidence.persistence'
import { loadErrorPatterns, loadPendingProposals } from '../services/brainConsolidation.persistence'

/** Feste Sitzungslaenge (UI-Spezifikation 4.2 und 17: Vorschlag 5 bis 7). */
export const DEFAULT_SESSION_SIZE = 6

export type BrainPathData = {
  concepts: BrainConcept[]
  edges: BrainPrerequisiteEdge[]
  images: Map<string, LearnerConceptImage>
  order: PathOrderEntry[]
  goal: LearningGoal | null
  patterns: ErrorPattern[]
  proposals: StructureProposal[]
  /**
   * Zuletzt ausgespieltes Format je Konzept (`learn_task_log`) — speist `avoidFormat` im Planer.
   * Siehe `loadLastTaskFormats` fuer den Grund, warum das aus dem Protokoll kommt und nicht aus
   * dem Sitzungszustand.
   */
  lastFormatByConcept: Map<string, TaskFormat>
}

const EMPTY: BrainPathData = {
  concepts: [],
  edges: [],
  images: new Map(),
  order: [],
  goal: null,
  patterns: [],
  proposals: [],
  lastFormatByConcept: new Map(),
}

export type BrainPathState = {
  data: BrainPathData
  plan: SessionPlan | null
  /** Faelligkeitsgruende je Konzept — fuer die Kennzeichnung eingemischter Wiederholungen. */
  dueReasons: Map<string, string>
  conceptNames: Map<string, string>
  isLoading: boolean
  /** Erste Ladung noch nicht durch: die Oberflaeche zeigt dann Platzhalter statt Nullwerten. */
  hasLoadedOnce: boolean
  error: string | null
  /** Steht ueberhaupt ein Gehirn-Graph fuer diesen Pfad bereit? */
  isAvailable: boolean
  /** „Spaeter" (UI-Spezifikation 3.3): der Planer waehlt neu und begruendet erneut. */
  deferConcept: (conceptId: string) => void
  deferredConceptIds: ReadonlySet<string>
  reload: () => void
  /** Nach einer Sitzung: Zustand neu einlesen, damit die Struktur sofort sichtbar ist (Kapitel 4.9). */
  refreshAfterSession: () => Promise<void>
}

export type UseBrainPathArgs = {
  userId: string | null
  pathId: string | null
  sessionSize?: number
  /** Fehlschlaege in Folge fuer den Frustrationsschutz (Kapitel 6.2). */
  consecutiveFailures?: number
  /** Erlaubt es, den Hook stillzulegen, solange der Bereich gar nicht sichtbar ist. */
  enabled?: boolean
}

export function useBrainPath(args: UseBrainPathArgs): BrainPathState {
  const { userId, pathId, enabled = true } = args
  const sessionSize = args.sessionSize ?? DEFAULT_SESSION_SIZE
  const consecutiveFailures = args.consecutiveFailures ?? 0

  const [data, setData] = useState<BrainPathData>(EMPTY)
  const [isLoading, setIsLoading] = useState(false)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  /*
   * Zurueckgewiesene Konzepte — bewusst NUR im Oberflaechenzustand.
   *
   * „Spaeter" heisst nicht „nie", sondern „jetzt nicht". Der naechste Besuch ist ein neues Jetzt,
   * und ein Konzept, das gestern nicht passte, kann heute genau das richtige sein. Eine dauerhafte
   * Ablage haette ausserdem eine Verfallsregel gebraucht, damit sie nicht zur stillen Sperrliste
   * wird — und eine Sperrliste ohne Ablaufdatum widerspricht der Auswahlhoheit des Planers.
   */
  const [deferredConceptIds, setDeferredConceptIds] = useState<ReadonlySet<string>>(() => new Set())

  /*
   * Gegen veraltete Antworten: wechselt der Pfad waehrend eines Ladevorgangs, darf die Antwort
   * des alten Pfads den neuen Zustand nicht mehr ueberschreiben. Ohne diesen Zaehler zeigt die
   * Oberflaeche nach einem schnellen Pfadwechsel die Konzepte des vorigen Pfads.
   */
  const requestRef = useRef(0)

  const load = useCallback(async () => {
    if (!enabled || !userId || !pathId) {
      setData(EMPTY)
      setHasLoadedOnce(false)
      return
    }

    const requestId = requestRef.current + 1
    requestRef.current = requestId
    setIsLoading(true)
    setError(null)

    try {
      const graph = await loadKnowledgeGraph(pathId)
      const conceptIds = graph.concepts.map((concept) => concept.id)

      const [images, order, goal, patterns, proposals, lastFormatByConcept] = await Promise.all([
        loadLearnerImages(conceptIds),
        loadPathOrder(pathId),
        loadActiveGoal(pathId),
        loadErrorPatterns(userId),
        /*
         * Geladen wird der Kartenpruefungs-Kontext: die Einsichten-Karte sitzt im Pfad-Tab, und
         * `brain/ui/insightsView.ts` filtert daraus, was am Sitzungsbeginn gezeigt werden darf.
         * Umgekehrt waere es nicht moeglich — was hier nicht geladen ist, kann dort nicht
         * erscheinen.
         */
        loadPendingProposals({ userId, pathId, surfaceContext: 'mapReview' }),
        loadLastTaskFormats(pathId),
      ])

      if (requestRef.current !== requestId) {
        return
      }

      setData({
        concepts: graph.concepts,
        edges: graph.edges,
        images,
        order,
        goal,
        patterns,
        proposals,
        lastFormatByConcept,
      })
      setHasLoadedOnce(true)
    } catch (cause) {
      if (requestRef.current !== requestId) {
        return
      }
      setError(cause instanceof Error ? cause.message : 'Der Lernstand konnte nicht geladen werden.')
    } finally {
      if (requestRef.current === requestId) {
        setIsLoading(false)
      }
    }
  }, [enabled, userId, pathId])

  useEffect(() => {
    void load()
  }, [load, reloadToken])

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1)
  }, [])

  const deferConcept = useCallback((conceptId: string) => {
    setDeferredConceptIds((current) => {
      const next = new Set(current)
      next.add(conceptId)
      return next
    })
  }, [])

  const refreshAfterSession = useCallback(async () => {
    // Nach einer Sitzung ist die Lage neu — und mit ihr die Frage, was jetzt dran ist. Ein
    // „Spaeter" von vor der Sitzung darf den Planer danach nicht mehr binden.
    setDeferredConceptIds(new Set())
    await load()
  }, [load])

  const conceptNames = useMemo(
    () => new Map(data.concepts.map((concept) => [concept.id, concept.name])),
    [data.concepts],
  )

  /*
   * `nowIso` wird EINMAL je Planung festgehalten und nicht bei jedem Rendern neu genommen.
   * Sonst waere der Planer bei gleicher Datenlage nicht mehr reproduzierbar — zwei Renderdurchgaenge
   * in derselben Sekunde koennten verschiedene Sitzungen ergeben, und Invariante I11 waere an der
   * Oberflaeche wieder aufgehoben.
   */
  /*
   * Kaltstart-Dringlichkeit (Kapitel 9): ohne sie bleibt jedes Konzept ohne Lernerbild stumm — kein
   * `review`-, `rootCause`- oder `motivation`-Signal kann ohne Evidenz entstehen, und ohne Ziel kein
   * `goal`-Signal. Ein frisch eingerichteter Pfad haette dann in JEDER Planung eine leere Rangliste,
   * `plan.tasks` bliebe leer, und „Hier ueben" / der Sitzungsstart taeten sichtbar nichts — genau das
   * fehlte hier, bis ein leerer Platzhalter-Pfad das aufdeckte.
   *
   * `informationGains` braucht einen Suchzustand (`FrontSearchState`); die volle Version narrowt ihn
   * ueber `recordProbe` nach jeder Antwort, um die Front adaptiv einzugrenzen (siehe frontSearch.ts).
   * Diese Verengung ist eine Optimierung, keine Voraussetzung: ohne sie berechnet `informationGains`
   * bei jeder Planung den Gewinn frisch aus der aktuellen Graph-Topologie plus dem tatsaechlichen
   * Lernerbild (`openConcepts` filtert bereits ueber `directEvidenceCount` heraus, was schon beantwortet
   * wurde) — der Suchraum schrumpft also ohnehin mit jeder Sitzung, nur nicht zusaetzlich ueber
   * Ableitung aus indirekten Antworten. Ein persistenter Suchzustand ueber Sitzungen hinweg würde eine
   * eigene Kopplung zwischen `useBrainPath` und `useBrainSession` brauchen; bis das gebraucht wird,
   * ist ein frischer Zustand je Planung die einfachere, korrekte Wahl.
   */
  const coldStartGains = useMemo(
    () =>
      informationGains({
        concepts: data.concepts,
        edges: data.edges,
        images: data.images,
        search: initialFrontSearch(),
      }),
    [data.concepts, data.edges, data.images],
  )

  const plan = useMemo<SessionPlan | null>(() => {
    if (data.concepts.length === 0) {
      return null
    }
    return planSession({
      concepts: data.concepts,
      edges: data.edges,
      images: data.images,
      goal: data.goal,
      sessionSize,
      consecutiveFailures,
      coldStartGains,
      deferredConceptIds,
      lastFormatByConcept: data.lastFormatByConcept,
      nowIso: new Date().toISOString(),
    })
  }, [data, sessionSize, consecutiveFailures, coldStartGains, deferredConceptIds])

  const dueReasons = useMemo(() => {
    const nowIso = new Date().toISOString()
    const reasons = new Map<string, string>()
    for (const entry of buildReviewQueue(data.images.values(), nowIso)) {
      reasons.set(entry.conceptId, entry.reason)
    }
    return reasons
  }, [data.images])

  return {
    data,
    plan,
    dueReasons,
    conceptNames,
    isLoading,
    hasLoadedOnce,
    error,
    isAvailable: data.concepts.length > 0,
    deferConcept,
    deferredConceptIds,
    reload,
    refreshAfterSession,
  }
}

/**
 * Faellige Konzepte fuer den Zaehler im Wiederholen-Tab.
 *
 * Eigene Funktion statt eines Feldes im Hook, weil der Zaehler auch dort gebraucht wird, wo die
 * Sitzung nicht geplant wird — und weil er nach Kapitel 5.7 stabil bleiben muss: gezaehlt werden
 * Konzepte, nicht Abfragen.
 */
export function countDueConcepts(images: Map<string, LearnerConceptImage>, nowIso: string): number {
  let count = 0
  for (const image of images.values()) {
    if (responsibilityFor(image, nowIso).responsibility === 'review') {
      count += 1
    }
  }
  return count
}
