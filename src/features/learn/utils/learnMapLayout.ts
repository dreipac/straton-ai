import type { CSSProperties } from 'react'
import type { Edge, Node } from '@xyflow/react'
import type { SyllabusEntry, TopicSession } from '../services/learn.persistence'
import {
  TOPIC_MASTERY_THRESHOLD,
  TOPIC_MAX_STEPS,
  hasUnansweredTopicStep,
  sanitizeChapterTitlesForUi,
} from './learnPageHelpers'

export type LearnMapNodeKind = 'topic' | 'diagnostic' | 'step'
export type LearnMapNodeVisualStatus = 'locked' | 'active' | 'completed'
export type LearnMapEdgeState = 'done' | 'flow' | 'locked'

export type LearnMapNodeData = {
  title: string
  visualStatus: LearnMapNodeVisualStatus
  kind: LearnMapNodeKind
  topicIndex: number
  /** Position des Zwischenschritts innerhalb seines Themas (0-basiert; Diagnosetest = -1). */
  stepIndex?: number
  /** Ghost-Halt: der nächste Zwischenschritt wird gerade generiert — rein visuell, nicht klickbar. */
  pending?: boolean
  /** Fortschritt Richtung Meisterschaft (0–100, 100 = Schwelle erreicht) — nur für aktive Themen. */
  masteryPercent?: number
  /** Meisterschafts-Sterne (1–3) für gemeisterte Themen, aus masteryScore abgeleitet. */
  stars?: number
  /** Choreografie-Flags (vom Canvas injiziert, nicht vom Layout): einmalige Freischalt-/Abschluss-Animation. */
  justUnlocked?: boolean
  justCompleted?: boolean
  /** Choreografie: dieser Zwischenschritt ist gerade neu auf der Linie erschienen (Halt „poppt" ein). */
  justRevealed?: boolean
  [key: string]: unknown
}

export type LearnMapNode = Node<LearnMapNodeData>
export type LearnMapGraph = { nodes: LearnMapNode[]; edges: Edge[] }

/** Verlauf von UNTEN nach oben: Thema 0 sitzt unten (y = 0), jedes weitere darüber (negatives y).
 *  Horizontal windet sich der Pfad in einer festen Serpentine (0 → rechts → 0 → links → 0 …).
 *
 *  Die Segmenthöhe zwischen zwei Themen ist DYNAMISCH: Grundhöhe ohne Halte, sonst wächst sie mit
 *  der Anzahl der Haltepunkte (Diagnosetest + Zwischenschritte + ggf. Ghost-Halt). Die Halte sitzen
 *  in festen Pixel-Abständen auf der Linie — gleichmäßig luftig, egal ob 1 oder 7 Halte. */
const SEGMENT_BASE_HEIGHT = 340
/** Thema → erster Halt (Diagnosetest bewusst „weiter hinten", nicht an der Kachel klebend). */
const FIRST_STOP_OFFSET = 200
/** Fester Abstand zwischen zwei Haltepunkten. */
const STOP_SPACING = 115
/** Letzter Halt → nächstes Thema (inkl. Platz für die Themen-Kachel selbst, ~85px hoch). */
const LAST_STOP_HEADROOM = 250

const SERPENTINE_X = 150
/** Halbe Themen-Breite (~11.8rem) — die Verbindungslinie läuft durch die Knoten-Mitte, die
 *  Haltepunkte richten sich an derselben horizontalen Achse aus. */
const TOPIC_HANDLE_X_OFFSET = 95
/** Halbe Kantenlänge eines Schritt-Dots (~1.1rem) — Position ist die linke obere Ecke, daher die
 *  berechnete Mitte um diesen Betrag zurückversetzen, damit der Dot mittig auf der Linie sitzt. */
const STEP_DOT_HALF = 9

/** Eintritts-Choreografie beim Öffnen des Tabs: erst poppt die Fläche auf, dann erscheinen die
 *  Themen gestaffelt (NODE_ENTER_BASE_MS als Vorlauf für die Flächen-Pop), danach zeichnen sich die
 *  Kanten kurz NACH dem jeweils angebundenen Zielknoten. */
const NODE_ENTER_BASE_MS = 260
const NODE_STAGGER_MS = 70
const EDGE_ENTER_BASE_MS = 560
const EDGE_STAGGER_MS = 90

/** Deterministischer Serpentinen-Versatz (nur vom Index abhängig → Themen liegen bei jedem Render
 *  an exakt derselben Position, „beim Generieren" festgelegt). */
function topicSerpentineX(topicIndex: number): number {
  const phase = topicIndex % 4
  if (phase === 1) return SERPENTINE_X
  if (phase === 3) return -SERPENTINE_X
  return 0
}

/** Horizontale Achse der Verbindungslinie eines Themas (Serpentinen-X + halbe Themen-Breite). */
function topicLineX(topicIndex: number): number {
  return topicSerpentineX(topicIndex) + TOPIC_HANDLE_X_OFFSET
}

export function topicNodeId(topicIndex: number): string {
  return `topic-${topicIndex}`
}

function diagnosticNodeId(topicIndex: number): string {
  return `topic-${topicIndex}-diagnostic`
}

function stepNodeId(topicIndex: number, stepIndex: number): string {
  return `topic-${topicIndex}-step-${stepIndex}`
}

/** Gestaffelte Einblend-Verzögerung (CSS-Var, von .learn-map-node gelesen) — Karte „baut sich auf".
 *  Vorlauf NODE_ENTER_BASE_MS, damit die Themen erst NACH der Flächen-Pop erscheinen. */
function nodeEnterDelay(topicIndex: number, chainOffset = 0): CSSProperties {
  const delayMs = Math.min(NODE_ENTER_BASE_MS + topicIndex * NODE_STAGGER_MS + chainOffset * 45, NODE_ENTER_BASE_MS + 620)
  return { '--lm-delay': `${delayMs}ms` } as CSSProperties
}

/** Zeichen-Verzögerung einer Kante (Basis + Rang) — die Linie wird kurz nach dem angebundenen
 *  Zielknoten „gezogen". rank ≈ Reihenfolge im Aufbau von unten nach oben. */
function edgeEnterDelayMs(rank: number): number {
  return Math.min(EDGE_ENTER_BASE_MS + rank * EDGE_STAGGER_MS, EDGE_ENTER_BASE_MS + 900)
}

/** Meisterschafts-Sterne aus dem Themen-Mastery-Score (EWMA 0..1): 3 = souverän, 2 = solide, 1 = geschafft.
 *  Ohne erfasste Versuche (z. B. direkt gemeistert) volle Sterne — kein Abzug ohne Datengrundlage. */
export function masteryStarsForSession(session: TopicSession): number {
  if (session.masteryAttempts === 0) {
    return 3
  }
  if (session.masteryScore >= 0.85) {
    return 3
  }
  return session.masteryScore >= 0.6 ? 2 : 1
}

/** Fortschritt Richtung Meisterschaft in Prozent (100 = Schwelle erreicht). */
export function masteryProgressPercent(session: TopicSession): number {
  return Math.round(Math.min(1, session.masteryScore / TOPIC_MASTERY_THRESHOLD) * 100)
}

type StopDescriptor = {
  id: string
  kind: 'diagnostic' | 'step'
  title: string
  stepIndex: number
  status: LearnMapNodeVisualStatus
  /** Ghost-Halt: Platzhalter, solange der nächste Zwischenschritt generiert wird. */
  pending: boolean
}

type TopicComputed = {
  stops: StopDescriptor[]
  isUnlocked: boolean
  isMastered: boolean
}

/** Halte eines Themas (Diagnosetest + Zwischenschritte + ggf. Ghost) aus der Session ableiten. */
function computeTopicStops(
  topicIndex: number,
  session: TopicSession | undefined,
  isUnlocked: boolean,
): StopDescriptor[] {
  if (!session || !isUnlocked) {
    return []
  }
  const isMastered = session.status === 'mastered'
  const stops: StopDescriptor[] = []

  const chainIds: string[] = []
  if (session.diagnosticBlueprint) {
    chainIds.push(diagnosticNodeId(topicIndex))
  }
  session.stepBlueprints.forEach((_, stepIndex) => {
    chainIds.push(stepNodeId(topicIndex, stepIndex))
  })
  const lastChainId = chainIds[chainIds.length - 1]

  if (session.diagnosticBlueprint) {
    const diagId = diagnosticNodeId(topicIndex)
    const isActive = !isMastered && lastChainId === diagId
    stops.push({
      id: diagId,
      kind: 'diagnostic',
      title: 'Diagnosetest',
      stepIndex: -1,
      status: isActive ? 'active' : 'completed',
      pending: false,
    })
  }
  session.stepBlueprints.forEach((blueprint, stepIndex) => {
    const id = stepNodeId(topicIndex, stepIndex)
    const isActive = !isMastered && lastChainId === id
    stops.push({
      id,
      kind: 'step',
      title: blueprint.title.trim() || `Lernschritt ${stepIndex + 1}`,
      stepIndex,
      status: isActive ? 'active' : 'completed',
      pending: false,
    })
  })

  // Ghost-Halt: der nächste Zwischenschritt wird gerade generiert (Spiegel der Generierungs-Bedingung
  // in useTopicStepGeneration) — er reserviert seinen Platz auf der Linie, damit beim Eintreffen des
  // echten Schrittes nichts verrutscht.
  const expectingNextStep =
    session.status === 'learning' &&
    session.masteryScore < TOPIC_MASTERY_THRESHOLD &&
    session.stepBlueprints.length < TOPIC_MAX_STEPS &&
    !hasUnansweredTopicStep(session)
  if (expectingNextStep) {
    stops.push({
      id: `topic-${topicIndex}-pending-${session.stepBlueprints.length}`,
      kind: 'step',
      title: 'Wird vorbereitet …',
      stepIndex: session.stepBlueprints.length,
      status: 'locked',
      pending: true,
    })
  }

  return stops
}

/** Segmenthöhe zwischen Thema N und N+1 — wächst mit der Anzahl der Halte. */
function segmentHeightFor(stopCount: number): number {
  if (stopCount === 0) {
    return SEGMENT_BASE_HEIGHT
  }
  return FIRST_STOP_OFFSET + (stopCount - 1) * STOP_SPACING + LAST_STOP_HEADROOM
}

/**
 * Landkarte: baut deterministisch Knoten/Kanten für react-flow aus syllabus + topicSessions.
 * Themen in fester Serpentine (unten → oben); die Zwischenschritte eines Themas sitzen als
 * Haltepunkte in festen Pixel-Abständen auf der geschwungenen Linie zum nächsten Thema.
 * Rein und ohne Seiteneffekte.
 */
export function buildTopicMapGraph(
  syllabus: SyllabusEntry[],
  topicSessions: TopicSession[],
  effectiveTopic: string,
): LearnMapGraph {
  if (syllabus.length === 0) {
    return { nodes: [], edges: [] }
  }

  const titles = sanitizeChapterTitlesForUi(
    syllabus.map((entry) => entry.topic),
    effectiveTopic,
  )

  // Pass 1: Halte + Segmenthöhen je Thema, daraus die Themen-Y-Positionen (Präfixsummen).
  const perTopic: TopicComputed[] = syllabus.map((_, topicIndex) => {
    const session = topicSessions[topicIndex]
    const isUnlocked = topicIndex === 0 || topicSessions[topicIndex - 1]?.status === 'mastered'
    return {
      stops: computeTopicStops(topicIndex, session, isUnlocked),
      isUnlocked,
      isMastered: session?.status === 'mastered',
    }
  })
  const topicYs: number[] = new Array(syllabus.length)
  topicYs[0] = 0
  for (let i = 1; i < syllabus.length; i += 1) {
    topicYs[i] = topicYs[i - 1] - segmentHeightFor(perTopic[i - 1].stops.length)
  }

  const nodes: LearnMapNode[] = []
  const edges: Edge[] = []
  const lastTopicIndex = syllabus.length - 1

  // Pass 2: Knoten + Kanten.
  syllabus.forEach((entry, topicIndex) => {
    const session = topicSessions[topicIndex]
    const { stops, isUnlocked, isMastered } = perTopic[topicIndex]
    const topicId = topicNodeId(topicIndex)
    const topicY = topicYs[topicIndex]
    const segmentHeight = segmentHeightFor(stops.length)
    const isActiveTopic = !isMastered && isUnlocked

    nodes.push({
      id: topicId,
      type: 'learnMapTopic',
      position: { x: topicSerpentineX(topicIndex), y: topicY },
      data: {
        title: titles[topicIndex] ?? entry.topic,
        visualStatus: isMastered ? 'completed' : isUnlocked ? 'active' : 'locked',
        kind: 'topic',
        topicIndex,
        stars: isMastered && session ? masteryStarsForSession(session) : undefined,
        // Mastery-Fortschritt nur am aktiven Thema mit echten Antworten — Zugkraft zum Ziel.
        masteryPercent:
          isActiveTopic && session && session.masteryAttempts > 0
            ? masteryProgressPercent(session)
            : undefined,
      },
      style: nodeEnterDelay(topicIndex),
      draggable: false,
      connectable: false,
    })

    const hasNextTopic = topicIndex < lastTopicIndex
    const previousMastered = topicIndex === 0 || topicSessions[topicIndex - 1]?.status === 'mastered'

    if (stops.length === 0) {
      // Kein Halt → einfache Verbindung Thema N → Thema N+1 (Zustand wie bisher).
      if (hasNextTopic) {
        const edgeState: LearnMapEdgeState = previousMastered ? (isMastered ? 'done' : 'flow') : 'locked'
        edges.push(
          buildConnectorEdge({
            id: `edge-${topicId}-${topicNodeId(topicIndex + 1)}`,
            source: topicId,
            sourceHandle: 'topic-up',
            target: topicNodeId(topicIndex + 1),
            targetHandle: 'topic-down',
            state: edgeState,
            enterDelayMs: edgeEnterDelayMs(topicIndex),
          }),
        )
      }
      return
    }

    // Halte als Knoten platzieren + Kette geschwungener Teilstücke: Thema → Halt 1 → … → Thema N+1.
    // Feste Pixel-Abstände; X driftet anteilig von der Linien-Achse dieses Themas zur des nächsten.
    stops.forEach((stop, ordinal) => {
      const distance = FIRST_STOP_OFFSET + ordinal * STOP_SPACING
      const fraction = distance / segmentHeight
      const xFrom = topicLineX(topicIndex)
      const xTo = topicLineX(topicIndex + 1)
      const centerX = xFrom + (xTo - xFrom) * fraction

      nodes.push({
        id: stop.id,
        type: 'learnMapStep',
        position: { x: centerX - STEP_DOT_HALF, y: topicY - distance - STEP_DOT_HALF },
        data: {
          title: stop.title,
          visualStatus: stop.status,
          kind: stop.kind,
          topicIndex,
          stepIndex: stop.stepIndex,
          pending: stop.pending,
        },
        style: nodeEnterDelay(topicIndex, ordinal + 1),
        draggable: false,
        connectable: false,
      })

      const source = ordinal === 0 ? topicId : stops[ordinal - 1].id
      const sourceHandle = ordinal === 0 ? 'topic-up' : 'out'
      const state: LearnMapEdgeState = stop.pending
        ? 'locked'
        : stop.status === 'active'
          ? 'flow'
          : 'done'
      edges.push(
        buildConnectorEdge({
          id: `edge-${source}-${stop.id}`,
          source,
          sourceHandle,
          target: stop.id,
          targetHandle: 'in',
          state,
          enterDelayMs: edgeEnterDelayMs(topicIndex) + 120 + ordinal * 70,
        }),
      )
    })

    // Schluss-Aufstieg vom letzten Halt zum nächsten Hauptthema: erst freigeschaltet (done),
    // wenn dieses Thema gemeistert ist — sonst „locked" (die Strasse liegt noch vor dir).
    if (hasNextTopic) {
      const lastStop = stops[stops.length - 1]
      edges.push(
        buildConnectorEdge({
          id: `edge-${lastStop.id}-${topicNodeId(topicIndex + 1)}`,
          source: lastStop.id,
          sourceHandle: 'out',
          target: topicNodeId(topicIndex + 1),
          targetHandle: 'topic-down',
          state: isMastered ? 'done' : 'locked',
          enterDelayMs: edgeEnterDelayMs(topicIndex) + 120 + (stops.length + 1) * 70,
        }),
      )
    }
  })

  return { nodes, edges }
}

function buildConnectorEdge(params: {
  id: string
  source: string
  sourceHandle: string
  target: string
  targetHandle: string
  state: LearnMapEdgeState
  enterDelayMs: number
}): Edge {
  return {
    id: params.id,
    source: params.source,
    sourceHandle: params.sourceHandle,
    target: params.target,
    targetHandle: params.targetHandle,
    type: 'learnMapEdge',
    data: { state: params.state, enterDelayMs: params.enterDelayMs },
    className: `learn-map-edge learn-map-edge--${params.state}`,
  }
}
