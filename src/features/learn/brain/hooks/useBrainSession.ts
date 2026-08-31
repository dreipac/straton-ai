/**
 * Die Lernsitzung — der geschlossene Kreislauf an der Oberflaeche.
 *
 * Hier laeuft zusammen, was die Schichten einzeln koennen: Planer waehlt, Generator erzeugt,
 * Kontrolleur gibt frei, Pruefer bewertet, Wahrnehmung schreibt ins Lernerbild, Propagation
 * verteilt Zweifel. Der Hook orchestriert nur — er entscheidet nichts selbst.
 *
 * Drei Regeln aus den Dokumenten sind hier verdrahtet und nicht verhandelbar:
 *
 *  - **I5 (Torwaechter).** Keine Aufgabe erreicht den Nutzer ohne Kontrolleur-Befund.
 *    `assertTaskCleared` laeuft vor jeder Auslieferung — und wirft, statt zu warnen.
 *  - **Vollstaendige Vorproduktion (Abweichung von Kapitel 7.1, siehe unten).** Der gesamte
 *    Sitzungsplan wird beim Start gleichzeitig angestossen, nicht nur die naechste Aufgabe.
 *  - **Kapitel 4.8 (Werte erst in der Bilanz).** Der Hook gibt waehrend der Sitzung keine
 *    aktualisierten Werte heraus. Er sammelt sie und legt sie am Ende auf einmal vor.
 *
 * ---
 *
 * ## Abweichung von Kapitel 7.1: vollstaendige statt versetzte Vorproduktion
 *
 * Die Architektur sah urspruenglich vor, immer nur EINE Aufgabe im Voraus zu erzeugen — die
 * naechste, waehrend der Nutzer an der aktuellen sitzt — und diese zu verwerfen, sobald sich die
 * Lage aendert. Begruendung: „Nur in Echtzeit erzeugtes Material kennt den Moment."
 *
 * In der Praxis bedeutete das: nur die ERSTE Aufgabe wartete planmaessig, aber jede folgende
 * Aufgabe wartete faktisch trotzdem, sobald die Person schneller antwortete, als die
 * Vorproduktion im Hintergrund hinterherkam — und genau das war die Beschwerde, die zu dieser
 * Aenderung fuehrte: „ich muss bei jeder Frage warten".
 *
 * **Entschieden:** Beim Start einer Sitzung werden ALLE geplanten Aufgaben gleichzeitig
 * angestossen, nicht nur die naechste. Nur die ERSTE Aufgabe hat noch unvermeidbare Wartezeit —
 * es gibt nichts, womit sie ueberlappen koennte. Alle folgenden Aufgaben laufen im Hintergrund
 * mit, waehrend die Person die erste liest und beantwortet, und liegen bei Kapitel 4.2s
 * uebliche Sitzungslaenge (5 bis 7 Aufgaben) in aller Regel laengst bereit, wenn sie gebraucht
 * werden.
 *
 * Was dabei NICHT aufgegeben wird: Torwaechter I5 laeuft fuer jede einzelne Aufgabe unveraendert
 * — vollstaendige Vorproduktion aendert NUR den Zeitpunkt der Erzeugung, nie die Pruefung davor.
 * Was tatsaechlich aufgegeben wird: der Momentbezug innerhalb einer laufenden Sitzung — eine
 * Aufgabe zu Platz 4 entsteht nicht mehr aus dem Wissen, dass die Person bei Platz 2 gerade einen
 * Fehler gemacht hat. Das war im Code bisher ohnehin nicht verdrahtet (`lastErrorHint` wird beim
 * Erzeugen einer Sitzungsaufgabe nirgends gesetzt), der Verlust ist also kleiner, als er klingt.
 * Zwischen SITZUNGEN bleibt der Momentbezug vollstaendig erhalten: der Planer sieht bei jeder
 * neuen Sitzung den aktuellen Stand des Lernerbilds, nur nicht mehr innerhalb einer laufenden.
 *
 * Fuer sehr lange Sitzungen waere das Sammeln aller Aufgaben viele gleichzeitige Modellaufrufe.
 * Bei der ueblichen Sitzungslaenge ist das vertretbar; `production/prefetch.ts` haelt die
 * urspruengliche, versetzte Vorproduktion mit Staleness-Pruefung als wiederverwendbaren Baustein
 * bereit, falls das je wieder gebraucht wird.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  BrainConcept,
  BrainPrerequisiteEdge,
  ExaminerVerdict,
  EvidenceEvent,
  GeneratedTask,
  LearnerConceptImage,
  PlannedTask,
} from '../types'
import type { LearnGenerationMode } from '../../services/learn.persistence'
import { emptyImage } from '../memory/learnerImage'
import { perceiveGradedAnswer } from '../perception/evidence'
import { ESCALATION_THRESHOLD } from '../perception/examiner'
import { generateClearedTask } from '../production/generateTask'
import { buildPlaceholderTask, evaluatePlaceholderVerdict, placeholderDelay } from '../production/placeholderTask'
import { callWithEscalation } from '../agents/client'
import { parseExaminerResult } from '../agents/contracts'
import { recordErrorObservation, recordEvidenceEvent, recordPlannedTask } from '../services/brainEvidence.persistence'
import { clearBrainSession, loadBrainSession, saveBrainSession } from '../services/brainSession.persistence'
import { upsertLearnerImages } from '../services/brainMemory.persistence'
import { addEvidenceWeight } from '../services/brainConsolidation.persistence'

export type SessionPhase = 'idle' | 'producing' | 'answering' | 'checking' | 'feedback' | 'finished' | 'failed'

export type SessionFeedback = {
  verdict: ExaminerVerdict
  /** Wurde die Aufgabe als „weiss ich nicht" abgegeben? (Kapitel 4.6) */
  wasDontKnow: boolean
}

export type BrainSessionState = {
  phase: SessionPhase
  /** Der aktuelle Platz in der geplanten Sitzung. */
  index: number
  taskCount: number
  planned: PlannedTask | null
  task: GeneratedTask | null
  feedback: SessionFeedback | null
  error: string | null
  /** Lernerbilder vor der Sitzung — Grundlage der Abschlussbilanz (Kapitel 4.9). */
  imagesBefore: Map<string, LearnerConceptImage>
  imagesAfter: Map<string, LearnerConceptImage>
  events: EvidenceEvent[]
  startedAt: string | null
}

export type UseBrainSessionArgs = {
  userId: string | null
  pathId: string | null
  concepts: BrainConcept[]
  edges: BrainPrerequisiteEdge[]
  images: Map<string, LearnerConceptImage>
  /** Auszug aus dem Quellmaterial je Konzept. Ohne ihn ist keine Freigabe nach I5 moeglich. */
  sourceExcerptFor: (conceptId: string) => string
  /**
   * Websuche fuer den Fall, dass das Material die Frage stellt, ohne sie zu beantworten.
   * Optional — ohne sie faellt die Erzeugung auf das Fachwissen des Modells zurueck, nie auf
   * einen Abbruch. Siehe `GenerateTaskArgs.searchWeb`.
   */
  searchWeb?: (query: string) => Promise<string>
  /** Fachbezeichnung — Herkunft der Fehlerbeobachtung (Kapitel 10, Auflage 2). */
  subject: string
  /** Steht ein Eskalationsmodell fuer den Pruefer bereit? (Kapitel 5.3) */
  examinerEscalationAvailable?: boolean
  /**
   * Platzhalter-Modus (Admin-Test ohne API-Kosten, siehe `production/placeholderTask.ts`): erzeugt
   * und bewertet Aufgaben deterministisch statt ueber die Modellrollen. Ohne diesen Schalter riefe
   * eine Sitzung auf einem Platzhalter-Pfad trotzdem den Generator, den Kontrolleur und den Pruefer
   * auf — genau die Kosten, die der Platzhalter-Modus im uebrigen Lernbereich vermeidet.
   */
  generationMode: LearnGenerationMode
}

const INITIAL: BrainSessionState = {
  phase: 'idle',
  index: 0,
  taskCount: 0,
  planned: null,
  task: null,
  feedback: null,
  error: null,
  imagesBefore: new Map(),
  imagesAfter: new Map(),
  events: [],
  startedAt: null,
}

export function useBrainSession(args: UseBrainSessionArgs) {
  const [state, setState] = useState<BrainSessionState>(INITIAL)

  /*
   * Der Sitzungsplan liegt in einer Ref und nicht im Zustand: er wird beim Start festgeschrieben
   * und darf sich waehrend der Sitzung nicht mehr aendern. Sonst spraenge die Segmentleiste
   * mitten im Lauf — und Kapitel 4.2 verlangt eine feste Anzahl, weil „3 von 5" sonst gelogen ist.
   */
  const planRef = useRef<PlannedTask[]>([])
  const imagesRef = useRef<Map<string, LearnerConceptImage>>(new Map())

  /** Fertig erzeugte, bereits freigegebene Aufgaben je Platz — der Vorrat aus der Vorproduktion. */
  const producedRef = useRef<Map<number, GeneratedTask>>(new Map())
  /** Laufende Erzeugungen je Platz, damit zwei Aufrufer nie dieselbe Aufgabe doppelt anstossen. */
  const producingRef = useRef<Map<number, Promise<GeneratedTask>>>(new Map())
  /*
   * Zaehlt jeden Sitzungsstart hoch. Ohne ihn koennte eine Vorproduktion aus einer BEENDETEN
   * Sitzung nach einem Neustart noch fertig werden und in die Karten der NEUEN Sitzung schreiben
   * — dieselbe Platznummer waere dann zufaellig belegt. Derselbe Schutz wie `requestRef` in
   * `useBrainPath.ts`, nur fuer Erzeugungen statt Ladevorgaenge.
   */
  const sessionTokenRef = useRef(0)

  /**
   * Was ausser Plan und Aufgaben noch zum Stand der Sitzung gehoert.
   *
   * Als Ref und nicht aus dem Zustand gelesen, weil gespeichert wird, waehrend `setState` noch
   * aussteht — der Zustand traegt an diesen Stellen noch die vorige Position. Aktualisiert wird
   * jeweils direkt neben dem `setState`, das dasselbe sichtbar macht.
   */
  const snapshotRef = useRef<{
    startedAt: string
    imagesBefore: Map<string, LearnerConceptImage>
    index: number
    events: EvidenceEvent[]
  } | null>(null)

  /** Je Pfad hoechstens ein Wiederaufnahmeversuch — siehe die Wirkung weiter unten. */
  const resumedPathRef = useRef<string | null>(null)

  /**
   * Den Stand der Sitzung festhalten.
   *
   * Fehlschlaege bleiben folgenlos: gelingt das Speichern nicht — etwa weil die Migration noch
   * nicht eingespielt ist —, laeuft die Sitzung unveraendert weiter und verhaelt sich beim
   * naechsten Aufruf wie vor dieser Erweiterung.
   */
  const persist = useCallback(() => {
    const snapshot = snapshotRef.current
    if (!args.userId || !args.pathId || !snapshot || planRef.current.length === 0) {
      return
    }
    void saveBrainSession({
      userId: args.userId,
      pathId: args.pathId,
      plan: planRef.current,
      tasks: producedRef.current,
      currentIndex: snapshot.index,
      imagesBefore: snapshot.imagesBefore,
      events: snapshot.events,
      startedAt: snapshot.startedAt,
    }).catch(() => {})
  }, [args.pathId, args.userId])

  /** Die offene Sitzung verwerfen — nach Abschluss oder Abbruch ist nichts mehr fortzusetzen. */
  const forget = useCallback(() => {
    snapshotRef.current = null
    if (args.userId && args.pathId) {
      void clearBrainSession({ userId: args.userId, pathId: args.pathId }).catch(() => {})
    }
  }, [args.pathId, args.userId])

  const conceptById = useCallback(
    (conceptId: string) => args.concepts.find((concept) => concept.id === conceptId) ?? null,
    [args.concepts],
  )

  /**
   * Eine Aufgabe erzeugen und freigeben lassen.
   *
   * Der Ablauf selbst liegt in `production/generateTask.ts` — Pfad und Wiederholungsstapel teilen
   * sich denselben Torwaechter (I5). Hier wird nur zusammengetragen, was er ueber das Konzept
   * wissen muss.
   */
  const produceTask = useCallback(
    async (planned: PlannedTask): Promise<GeneratedTask> => {
      const concept = conceptById(planned.conceptId)
      if (!concept) {
        throw new Error('Das Konzept zu dieser Aufgabe wurde nicht gefunden.')
      }

      if (args.generationMode === 'placeholder') {
        await placeholderDelay()
        return buildPlaceholderTask({
          concept,
          depth: planned.depth,
          format: planned.format,
          reason: planned.reason,
        })
      }

      return generateClearedTask({
        concept,
        depth: planned.depth,
        format: planned.format,
        sourceExcerpt: args.sourceExcerptFor(concept.id),
        reason: planned.reason,
        ...(args.searchWeb ? { searchWeb: args.searchWeb } : {}),
      })
    },
    [args, conceptById],
  )

  /**
   * Die Erzeugung eines Platzes anstossen — oder eine bereits laufende bzw. fertige zurueckgeben.
   *
   * Diese Buendelung ist der Kern der vollstaendigen Vorproduktion: `start()` ruft sie fuer JEDEN
   * Platz auf, `next()` ruft sie fuer den naechsten Platz erneut auf. Ohne die Wiederverwendung
   * hier wuerde `next()` eine zweite, ueberfluessige Erzeugung anstossen, waehrend die erste aus
   * `start()` noch laeuft — zwei Modellaufruf-Ketten fuer eine einzige Aufgabe.
   */
  const produceSlot = useCallback(
    (index: number): Promise<GeneratedTask> => {
      const planned = planRef.current[index]
      if (!planned) {
        return Promise.reject(new Error('Kein geplanter Platz an dieser Stelle.'))
      }

      const ready = producedRef.current.get(index)
      if (ready) {
        return Promise.resolve(ready)
      }

      const running = producingRef.current.get(index)
      if (running) {
        return running
      }

      const token = sessionTokenRef.current
      const promise = produceTask(planned)
        .then((task) => {
          // Nur eintragen, wenn es noch dieselbe Sitzung ist — siehe Kommentar bei `sessionTokenRef`.
          if (sessionTokenRef.current === token) {
            producedRef.current.set(index, task)
            producingRef.current.delete(index)
            /*
             * Auch die vorproduzierten Plaetze werden festgehalten, nicht nur der aktuelle. Sonst
             * ginge beim Verlassen der Sitzung genau der Vorrat verloren, dessentwegen die
             * Vorproduktion ueberhaupt existiert: die Fortsetzung erzeugte die Plaetze dahinter
             * ein zweites Mal — mit denselben Kosten und derselben Wartezeit.
             */
            persist()
          }
          return task
        })
        .catch((cause) => {
          if (sessionTokenRef.current === token) {
            producingRef.current.delete(index)
          }
          throw cause
        })

      producingRef.current.set(index, promise)
      return promise
    },
    [persist, produceTask],
  )

  /**
   * Alle Plaetze ab `fromIndex` im Hintergrund anstossen.
   *
   * Fehlschlaege werden hier bewusst verschluckt: schlaegt die Vorproduktion eines Platzes fehl,
   * passiert nichts Sichtbares — dieser Platz wird beim Erreichen ganz regulaer ueber
   * `produceSlot` neu versucht (mit frischen `MAX_GENERATION_ATTEMPTS`). Ein Fehler in der
   * Vorproduktion darf die laufende Sitzung nicht abbrechen.
   */
  const prefetchRest = useCallback(
    (fromIndex: number) => {
      for (let index = fromIndex; index < planRef.current.length; index += 1) {
        produceSlot(index).catch(() => {
          // siehe Kommentar oben
        })
      }
    },
    [produceSlot],
  )

  /**
   * Die Sitzung starten: Plan festschreiben, ALLE Aufgaben gleichzeitig anstossen.
   *
   * Nur der erste Platz wird abgewartet — die uebrigen laufen im Hintergrund mit (siehe
   * Dateikopf). `prefetchRest` wird VOR dem Warten auf den ersten Platz aufgerufen, nicht danach:
   * so ueberlappt die Erzeugung von Platz 2 bis N bereits mit der Wartezeit auf Platz 1, statt
   * erst zu beginnen, wenn Platz 1 schon fertig ist.
   */
  const start = useCallback(
    async (tasks: PlannedTask[]) => {
      if (tasks.length === 0) {
        return
      }
      sessionTokenRef.current += 1
      planRef.current = tasks
      imagesRef.current = new Map(args.images)
      producedRef.current = new Map()
      producingRef.current = new Map()

      const startedAt = new Date().toISOString()
      // Ein neuer Start ersetzt eine etwaige offene Sitzung — es gibt nur eine je Pfad.
      snapshotRef.current = { startedAt, imagesBefore: new Map(args.images), index: 0, events: [] }
      resumedPathRef.current = args.pathId

      setState({
        ...INITIAL,
        phase: 'producing',
        taskCount: tasks.length,
        planned: tasks[0],
        imagesBefore: new Map(args.images),
        startedAt,
      })

      prefetchRest(1)

      try {
        const task = await produceSlot(0)
        setState((current) => ({ ...current, phase: 'answering', task }))
        persist()

        if (args.userId && args.pathId) {
          // Invariante I8 im Protokoll: die Begruendung wird mitgeschrieben, nicht nur angezeigt.
          void recordPlannedTask({
            userId: args.userId,
            pathId: args.pathId,
            task: tasks[0],
            selectedAt: new Date().toISOString(),
          }).catch(() => {})
        }
      } catch (cause) {
        setState((current) => ({
          ...current,
          phase: 'failed',
          error: cause instanceof Error ? cause.message : 'Die Aufgabe konnte nicht erzeugt werden.',
        }))
      }
    },
    [args.images, args.pathId, args.userId, persist, prefetchRest, produceSlot],
  )

  /**
   * Eine unterbrochene Sitzung genau dort wieder aufnehmen, wo sie geschlossen wurde.
   *
   * Der Gegenentwurf zu `start`: kein neuer Plan, keine neue Erzeugung, keine neue Startzeit. Was
   * uebernommen wird, stammt aus der gespeicherten Sitzung — der festgeschriebene Plan, die bereits
   * freigegebenen Aufgaben, die Position, und fuer die Abschlussbilanz die Lernerbilder von damals
   * und die inzwischen verbuchten Ereignisse.
   *
   * Torwaechter I5 wird dabei nicht umgangen: jede dieser Aufgaben hat ihn bei ihrer Erzeugung
   * durchlaufen. Eine gespeicherte Aufgabe erneut anzuzeigen ist keine neue Erzeugung — es ist
   * dieselbe Auslieferung, nur nach einem Seitenwechsel.
   *
   * Ausdruecklich NICHT uebernommen wird `imagesRef`: dort gehoert der AKTUELLE Stand des
   * Lernerbilds hinein, denn die naechste Antwort wird gegen ihn verrechnet. Er liegt ohnehin in
   * der Datenbank, weil jede bereits beantwortete Aufgabe verbucht wurde.
   */
  const resume = useCallback(
    async (stored: {
      plan: PlannedTask[]
      tasks: Map<number, GeneratedTask>
      currentIndex: number
      imagesBefore: Map<string, LearnerConceptImage>
      events: EvidenceEvent[]
      startedAt: string
    }) => {
      sessionTokenRef.current += 1
      planRef.current = stored.plan
      imagesRef.current = new Map(args.images)
      producedRef.current = new Map(stored.tasks)
      producingRef.current = new Map()
      snapshotRef.current = {
        startedAt: stored.startedAt,
        imagesBefore: stored.imagesBefore,
        index: stored.currentIndex,
        events: stored.events,
      }

      const planned = stored.plan[stored.currentIndex]
      const ready = stored.tasks.get(stored.currentIndex) ?? null

      setState({
        ...INITIAL,
        // Fehlt ausgerechnet die aktuelle Aufgabe, wurde die Sitzung waehrend ihrer Erzeugung
        // verlassen — dann bleibt nur dieser eine Platz neu zu erzeugen, nicht die ganze Sitzung.
        phase: ready ? 'answering' : 'producing',
        index: stored.currentIndex,
        taskCount: stored.plan.length,
        planned,
        task: ready,
        imagesBefore: stored.imagesBefore,
        // Nicht leer lassen: bricht die Person sofort wieder ab, verglich die Bilanz sonst den
        // Stand von damals gegen nichts.
        imagesAfter: new Map(args.images),
        events: stored.events,
        startedAt: stored.startedAt,
      })

      // Luecken hinter der aktuellen Position auffuellen — dieselbe Vorproduktion wie beim Start.
      prefetchRest(stored.currentIndex + 1)

      if (!ready) {
        try {
          const task = await produceSlot(stored.currentIndex)
          setState((current) => ({ ...current, phase: 'answering', task }))
        } catch (cause) {
          setState((current) => ({
            ...current,
            phase: 'failed',
            error: cause instanceof Error ? cause.message : 'Die Aufgabe konnte nicht erzeugt werden.',
          }))
        }
      }
    },
    [args.images, prefetchRest, produceSlot],
  )

  /**
   * Beim Betreten des Pfads nachsehen, ob dort eine Sitzung offen steht — und sie dann oeffnen.
   *
   * Ohne Rueckfrage, weil es keine gibt: die Person hat diese Sitzung begonnen und nicht beendet.
   * Eine Zwischenfrage („moechtest du fortsetzen?") waere ein zusaetzlicher Klick fuer den
   * Normalfall und boete als einzige Alternative an, die eigene Arbeit wegzuwerfen — dafuer gibt
   * es in der Sitzung selbst schon „Abbrechen".
   *
   * `resumedPathRef` sorgt fuer genau einen Versuch je Pfad: ohne ihn wuerde jede Zustands-
   * aenderung der Sitzung den Effekt erneut auslesen lassen, und ein „Abbrechen" waere sofort
   * wieder ueberschrieben.
   */
  /*
   * `resume` und die Konzeptliste wechseln bei jedem Rendern die Identitaet (`args` ist im
   * aufrufenden Bauteil ein frisches Objekt). Haengte der Effekt unten direkt an ihnen, liefe er
   * bei jedem Rendern erneut — und sein Aufraeumen braeche das noch laufende Laden ab, waehrend
   * `resumedPathRef` einen zweiten Versuch bereits ausschliesst. Die Sitzung waere dann still
   * verloren. Deshalb ueber Refs gelesen und nur an den wirklich stabilen Werten aufgehaengt.
   */
  const resumeRef = useRef(resume)
  resumeRef.current = resume
  const conceptsRef = useRef(args.concepts)
  conceptsRef.current = args.concepts
  const conceptsReady = args.concepts.length > 0

  useEffect(() => {
    const userId = args.userId
    const pathId = args.pathId
    if (!userId || !pathId || !conceptsReady || resumedPathRef.current === pathId) {
      return
    }
    resumedPathRef.current = pathId

    let cancelled = false
    void loadBrainSession({ userId, pathId, nowIso: new Date().toISOString() })
      .then((stored) => {
        if (cancelled || !stored) {
          return
        }
        /*
         * Zwischen Speichern und Fortsetzen kann der Graph sich geaendert haben — im
         * Konzepteditor geloescht, umbenannt, neu geschnitten. Ein Plan, der auf ein Konzept
         * zeigt, das es nicht mehr gibt, laesst sich nicht ausspielen: `produceTask` faende es
         * nicht und die Sitzung stuerbe an Platz drei. Dann lieber neu planen.
         */
        const known = new Set(conceptsRef.current.map((concept) => concept.id))
        if (!stored.plan.every((planned) => known.has(planned.conceptId))) {
          void clearBrainSession({ userId, pathId }).catch(() => {})
          return
        }
        void resumeRef.current(stored)
      })
      .catch(() => {
        // Kein Datensatz, keine Tabelle, kein Netz — in allen Faellen beginnt die Person neu.
      })

    return () => {
      cancelled = true
    }
  }, [args.pathId, args.userId, conceptsReady])

  /**
   * Eine Antwort bewerten und ins Lernerbild schreiben.
   *
   * `wasDontKnow` ist kein Sonderfall der Bewertung, sondern der Protokollierung: die Antwort
   * zaehlt als direkte Evidenz (die Person kann es nachweislich nicht), aber sie erzeugt KEINE
   * Fehlerbeobachtung. Kapitel 4.6 verlangt „ausdruecklich als offen verbucht, nicht als Fehler" —
   * und „nicht als Fehler" heisst hier konkret: es wandert nicht in den Musterkatalog. Wer nichts
   * versucht hat, hat auch nichts falsch gemacht; ein Muster daraus waere erfunden.
   */
  const answer = useCallback(
    async (userAnswer: string, options: { wasDontKnow?: boolean } = {}) => {
      const planned = planRef.current[state.index]
      const task = state.task
      const concept = planned ? conceptById(planned.conceptId) : null
      if (!planned || !task || !concept || !args.userId || !args.pathId) {
        return
      }

      /* Eigene Phase statt `producing`: die Aufgabe steht schon, nur die Antwort wird noch geprueft
         — die Oberflaeche soll Prompt/Optionen dabei sichtbar lassen statt den „Aufgabe wird
         erzeugt"-Platzhalter zu zeigen. */
      setState((current) => ({ ...current, phase: 'checking' }))

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
                  depth: planned.depth,
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
          conceptNames: new Map(args.concepts.map((entry) => [entry.id, entry.name])),
          verdict: examined.data,
          depth: planned.depth,
          format: planned.format,
          difficulty: concept.difficulty,
          escalationAvailable: args.examinerEscalationAvailable ?? false,
          nowIso: new Date().toISOString(),
        })

        // Das bewertete Konzept UND die Nachbarn in einem Rutsch — getrennte Schreibvorgaenge
        // koennten dazwischen abbrechen und den Zweifel ohne die Evidenz hinterlassen.
        const touched = [result.updated, ...result.propagated]
        for (const entry of touched) {
          imagesRef.current.set(entry.conceptId, entry)
        }
        await upsertLearnerImages(args.userId, touched)

        const eventId = await recordEvidenceEvent(result.event)
        if (!options.wasDontKnow && result.event.verdict.cause) {
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
          feedback: { verdict: examined.data, wasDontKnow: options.wasDontKnow === true },
          imagesAfter: new Map(imagesRef.current),
          events: [...current.events, result.event],
        }))
        if (snapshotRef.current) {
          snapshotRef.current.events = [...snapshotRef.current.events, result.event]
          persist()
        }

        /*
         * Kein erneuter Vorproduktions-Anstoss hier: alle Plaetze wurden bereits beim Start der
         * Sitzung gleichzeitig angestossen (siehe `start()`). `next()` findet sie ueber
         * `produceSlot` entweder fertig oder noch laufend vor.
         */
      } catch (cause) {
        setState((current) => ({
          ...current,
          phase: 'failed',
          error: cause instanceof Error ? cause.message : 'Die Antwort konnte nicht bewertet werden.',
        }))
      }
    },
    [args, conceptById, persist, state.index, state.task],
  )

  /**
   * Zur naechsten Aufgabe.
   *
   * Kapitel 4.7: kein zweiter Versuch in derselben Sitzung. Der Index waechst deshalb nur, er
   * springt nie zurueck — auch nicht nach einer falschen Antwort.
   *
   * Der Regelfall ist ein sofortiger Wechsel: `produceSlot` liefert eine bereits fertige Aufgabe
   * aus der Vorproduktion ohne jede Wartezeit. Nur wenn die Vorproduktion fuer diesen Platz noch
   * laeuft oder zuvor fehlgeschlagen ist, zeigt die Oberflaeche kurz „wird erzeugt" — der Ausnahme-
   * statt der Regelfall.
   */
  const next = useCallback(async () => {
    const nextIndex = state.index + 1
    const planned = planRef.current[nextIndex]

    if (!planned) {
      // Durchgearbeitet: es gibt nichts mehr fortzusetzen, der gespeicherte Stand faellt weg.
      forget()
      setState((current) => ({ ...current, phase: 'finished' }))
      return
    }

    if (snapshotRef.current) {
      snapshotRef.current.index = nextIndex
    }

    /*
     * Die erledigten Plaetze bleiben in `producedRef` stehen (frueher wurde der erreichte Platz
     * dort entfernt). Sonst waere die gespeicherte Sitzung nach dem Weiterblaettern unvollstaendig
     * und die Fortsetzung muesste bereits gezeigte Aufgaben neu erzeugen. Doppelt erzeugt wird
     * dadurch nichts: `produceSlot` liefert einen belegten Platz unveraendert zurueck.
     */
    const ready = producedRef.current.get(nextIndex)
    if (ready) {
      setState((current) => ({
        ...current,
        index: nextIndex,
        planned,
        task: ready,
        feedback: null,
        phase: 'answering',
      }))
      persist()
      return
    }

    setState((current) => ({ ...current, index: nextIndex, planned, task: null, feedback: null, phase: 'producing' }))
    persist()
    try {
      const task = await produceSlot(nextIndex)
      setState((current) => ({ ...current, phase: 'answering', task }))
    } catch (cause) {
      setState((current) => ({
        ...current,
        phase: 'failed',
        error: cause instanceof Error ? cause.message : 'Die Aufgabe konnte nicht erzeugt werden.',
      }))
    }
  }, [forget, persist, produceSlot, state.index])

  /**
   * Sitzung abbrechen.
   *
   * Verwirft nichts: jede bereits beantwortete Aufgabe ist verbucht. Das ist dieselbe Zusage wie
   * beim Wiederholungsstapel (UI-Spezifikation 5.4) und aus demselben Grund — sonst schliessen
   * Nutzer aus Verlustangst den Tab statt abzubrechen, was dieselbe Sitzung kostet, nur schlechter.
   *
   * Noch laufende Vorproduktionen werden nicht aktiv abgebrochen (kein Abbruchmechanismus fuer
   * Modellaufrufe) — sie laufen im Hintergrund zu Ende und verpuffen wirkungslos, weil `reset`
   * bzw. der naechste `start` den Sitzungs-Zaehler weiterschaltet.
   */
  const abort = useCallback(() => {
    /*
     * Ein Abbruch ist eine Entscheidung, keine Unterbrechung. Waere der Stand danach noch
     * gespeichert, holte der naechste Aufruf des Pfads genau die Sitzung zurueck, die die Person
     * gerade weggelegt hat — das Gegenteil dessen, wofuer sie geklickt hat.
     */
    forget()
    setState((current) => ({ ...current, phase: 'finished' }))
  }, [forget])

  const reset = useCallback(() => {
    sessionTokenRef.current += 1
    planRef.current = []
    producedRef.current = new Map()
    producingRef.current = new Map()
    forget()
    setState(INITIAL)
  }, [forget])

  return { state, start, answer, next, abort, reset }
}
