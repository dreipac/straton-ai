import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  useNodesInitialized,
  useOnViewportChange,
  useReactFlow,
} from '@xyflow/react'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import type { SyllabusEntry, TopicSession } from '../services/learn.persistence'
import {
  buildTopicMapGraph,
  topicNodeId,
  type LearnMapNodeVisualStatus,
} from '../utils/learnMapLayout'
import { splitLearningGoals } from '../utils/learnPageHelpers'
import { LearnMapInteractionContext, type LearnMapStepSelection } from '../utils/learnMapInteractionContext'
import { LearnMapEdge } from './LearnMapEdge'
import { LearnMapStepNode, LearnMapTopicNode } from './LearnMapNodes'

const learnMapNodeTypes = {
  learnMapTopic: LearnMapTopicNode,
  learnMapStep: LearnMapStepNode,
}

const learnMapEdgeTypes = {
  learnMapEdge: LearnMapEdge,
}

export type LearnMapCanvasProps = {
  syllabus: SyllabusEntry[]
  topicSessions: TopicSession[]
  effectiveTopic: string
  /** Themen-Index, auf den beim Öffnen zentriert wird und dessen Sichtbarkeit den "Zurück zum Pfad"-Button steuert. */
  focusTopicIndex: number
  onOpenTopic: (topicIndex: number) => void
  /** false = kompakte Vorschau (kein Pan/Zoom), true = Vollbild-Landkarte. */
  interactive: boolean
}

const OFFSCREEN_MARGIN_PX = 28

/** Etappen-Rhythmus: alle N Kapitel ein Etappenziel — hält das nächste Ziel immer nah (Goal-Gradient). */
const MILESTONE_SIZE = 3
const XP_PER_CORRECT_ANSWER = 10
const XP_PER_MASTERED_TOPIC = 100

/** Abschluss-Choreografie: Zeitachse in ms ab Statuswechsel auf 'mastered' (Modal blendet parallel aus). */
const CELEBRATE_CAMERA_DELAY_MS = 320
const MARKER_TRAVEL_AT_MS = 1650
const UNLOCK_BLOOM_AT_MS = 2700
const CHOREOGRAPHY_END_MS = 3900
const CHOREOGRAPHY_END_NO_NEXT_MS = 2300

function clampTopicIndex(index: number, totalTopics: number): number {
  if (totalTopics <= 0) {
    return 0
  }
  if (index < 0) {
    return totalTopics - 1
  }
  return Math.min(totalTopics - 1, index)
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Zahl weich hochzählen (rAF, ease-out) — der XP-Wert im HUD „tickt" statt zu springen. */
function useCountUp(target: number, durationMs = 900): number {
  const [display, setDisplay] = useState(target)
  const fromRef = useRef(target)
  const rafRef = useRef(0)

  useEffect(() => {
    const from = fromRef.current
    if (from === target) {
      return
    }
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs)
      const eased = 1 - (1 - progress) ** 3
      const value = Math.round(from + (target - from) * eased)
      fromRef.current = value
      setDisplay(value)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, durationMs])

  return display
}

type ChoreographyRefState = {
  active: boolean
  finalMarkerIndex: number
  timeouts: number[]
}

function LearnMapCanvasInner(props: LearnMapCanvasProps) {
  const { syllabus, topicSessions, effectiveTopic, focusTopicIndex, onOpenTopic, interactive } = props

  const { nodes, edges } = useMemo(
    () => buildTopicMapGraph(syllabus, topicSessions, effectiveTopic),
    [syllabus, topicSessions, effectiveTopic],
  )

  const containerRef = useRef<HTMLDivElement | null>(null)
  const reactFlow = useReactFlow()
  const nodesInitialized = useNodesInitialized()
  const [isFocusNodeOffscreen, setIsFocusNodeOffscreen] = useState(false)
  const [selectedTopicIndex, setSelectedTopicIndex] = useState<number | null>(null)
  const [selectedStep, setSelectedStep] = useState<LearnMapStepSelection | null>(null)
  const focusNodeId = topicNodeId(focusTopicIndex)

  const totalTopics = syllabus.length
  const masteredCount = topicSessions.filter((session) => session?.status === 'mastered').length

  // --- Abschluss-Choreografie: Feiern → Marker-Reise → Aufblühen des nächsten Themas ---
  const [celebratingTopicIndex, setCelebratingTopicIndex] = useState<number | null>(null)
  const [heldLockedTopicIndexes, setHeldLockedTopicIndexes] = useState<number[]>([])
  const [justUnlockedTopicIndexes, setJustUnlockedTopicIndexes] = useState<number[]>([])
  const [markerTopicIndex, setMarkerTopicIndex] = useState(() => clampTopicIndex(focusTopicIndex, totalTopics))
  const choreographyRef = useRef<ChoreographyRefState>({ active: false, finalMarkerIndex: 0, timeouts: [] })
  const prevTopicStatusRef = useRef<Map<number, LearnMapNodeVisualStatus> | null>(null)
  const graphSignatureRef = useRef<string | null>(null)
  const entryPanTimerRef = useRef<number | null>(null)

  // --- Halt-Choreografie: Wenn nach Abschluss eines Schrittes/der Diagnose der nächste Zwischenschritt
  // auf der Linie erscheint, zeichnet sich das neue Teilstück (Kante mountet + is-filling) und der
  // Halt „poppt" danach ein (justRevealed). Wir merken uns pro Thema den aktiven Halt und lösen nur
  // bei einem echten Wechsel (nicht beim ersten Aufbau) aus. ---
  const [revealingStopIds, setRevealingStopIds] = useState<string[]>([])
  const prevActiveStopByTopicRef = useRef<Map<number, string> | null>(null)
  const stopSignatureRef = useRef<string | null>(null)
  const revealTimeoutsRef = useRef<number[]>([])

  const interaction = useMemo(
    () => ({
      onOpenTopic,
      onSelectTopic: (topicIndex: number) => {
        setSelectedStep(null)
        setSelectedTopicIndex(topicIndex)
      },
      onSelectStep: (selection: LearnMapStepSelection) => {
        setSelectedTopicIndex(null)
        setSelectedStep(selection)
      },
    }),
    [onOpenTopic],
  )

  // Ausgewähltes Thema für die Vorschaukarte: Titel kommt aus dem Layout-Knoten (bereinigt),
  // die Lernziele aus dem Syllabus. Bei ungültigem Index (z. B. nach Plan-Änderung) → keine Karte.
  const selectedTopic = useMemo(() => {
    if (selectedTopicIndex === null) {
      return null
    }
    const node = nodes.find((candidate) => candidate.id === topicNodeId(selectedTopicIndex))
    if (!node) {
      return null
    }
    return {
      index: selectedTopicIndex,
      number: selectedTopicIndex + 1,
      title: node.data.title,
      learningGoals: splitLearningGoals(syllabus[selectedTopicIndex]?.learningGoal ?? ''),
    }
  }, [selectedTopicIndex, nodes, syllabus])

  // Schritt-Detailkarte: nur der AKTIVE Halt ist auswählbar. Ändert sich der Graph (z. B. Schritt
  // erledigt, nächster erscheint), zeigt der Lookup auf keinen aktiven Knoten mehr → Karte schließt.
  const selectedStepInfo = useMemo(() => {
    if (!selectedStep) {
      return null
    }
    const node = nodes.find(
      (candidate) =>
        candidate.data.kind !== 'topic' &&
        candidate.data.topicIndex === selectedStep.topicIndex &&
        (typeof candidate.data.stepIndex === 'number' ? candidate.data.stepIndex : -1) === selectedStep.stepIndex,
    )
    if (!node || node.data.visualStatus !== 'active') {
      return null
    }
    return {
      topicIndex: selectedStep.topicIndex,
      topicNumber: selectedStep.topicIndex + 1,
      title: node.data.title,
      isDiagnostic: node.data.kind === 'diagnostic',
      stepNumber: selectedStep.stepIndex + 1,
    }
  }, [selectedStep, nodes])

  useEffect(() => {
    if (selectedStep && !selectedStepInfo) {
      setSelectedStep(null)
    }
  }, [selectedStep, selectedStepInfo])

  const checkFocusVisibility = useCallback(() => {
    if (!interactive) {
      return
    }
    const container = containerRef.current
    const internalNode = reactFlow.getInternalNode(focusNodeId)
    if (!container || !internalNode) {
      setIsFocusNodeOffscreen(false)
      return
    }
    const { width, height } = container.getBoundingClientRect()
    const viewport = reactFlow.getViewport()
    const nodeWidth = internalNode.measured.width ?? 0
    const nodeHeight = internalNode.measured.height ?? 0
    const centerFlowX = internalNode.internals.positionAbsolute.x + nodeWidth / 2
    const centerFlowY = internalNode.internals.positionAbsolute.y + nodeHeight / 2
    const screenX = centerFlowX * viewport.zoom + viewport.x
    const screenY = centerFlowY * viewport.zoom + viewport.y
    const offscreen =
      screenX < OFFSCREEN_MARGIN_PX ||
      screenX > width - OFFSCREEN_MARGIN_PX ||
      screenY < OFFSCREEN_MARGIN_PX ||
      screenY > height - OFFSCREEN_MARGIN_PX
    setIsFocusNodeOffscreen(offscreen)
  }, [focusNodeId, interactive, reactFlow])

  useOnViewportChange({ onChange: checkFocusVisibility })

  /** Choreografie sofort in den Endzustand bringen (Klick auf die Karte überspringt sie). */
  const skipChoreography = useCallback(() => {
    const state = choreographyRef.current
    if (!state.active) {
      return
    }
    state.timeouts.forEach((timeout) => window.clearTimeout(timeout))
    state.timeouts = []
    state.active = false
    setCelebratingTopicIndex(null)
    setHeldLockedTopicIndexes([])
    setJustUnlockedTopicIndexes([])
    setMarkerTopicIndex(state.finalMarkerIndex)
    reactFlow.fitView({
      nodes: [{ id: topicNodeId(state.finalMarkerIndex) }],
      duration: 300,
      padding: 0.6,
      maxZoom: 1,
    })
  }, [reactFlow])

  // Statuswechsel der Themen beobachten: 'mastered' startet die Abschluss-Choreografie
  // (Feier-Animation → Marker reist weiter → nächstes Thema blüht auf). Läuft genau dann,
  // wenn das Themen-Modal schließt, weil der Status im selben Handler gesetzt wird.
  useEffect(() => {
    const signature = syllabus.map((entry) => entry.topic).join('|')
    const topicStatuses = new Map<number, LearnMapNodeVisualStatus>()
    for (const node of nodes) {
      if (node.data.kind === 'topic') {
        topicStatuses.set(node.data.topicIndex, node.data.visualStatus)
      }
    }
    const prev = graphSignatureRef.current === signature ? prevTopicStatusRef.current : null
    prevTopicStatusRef.current = topicStatuses
    graphSignatureRef.current = signature
    if (!prev) {
      return
    }

    const completedNow: number[] = []
    const unlockedNow: number[] = []
    let unexpectedChanges = 0
    topicStatuses.forEach((status, index) => {
      const before = prev.get(index)
      if (before === undefined || before === status) {
        return
      }
      if (before === 'active' && status === 'completed') {
        completedNow.push(index)
      } else if (before === 'locked' && status === 'active') {
        unlockedNow.push(index)
      } else {
        unexpectedChanges += 1
      }
    })

    // Nur die echte Lern-Transition feiern (genau ein Thema aktiv → gemeistert). Alles andere
    // (Pfadwechsel, wiederhergestellte Daten) still übernehmen, sonst feiert die Karte falsch.
    if (unexpectedChanges > 0 || completedNow.length !== 1) {
      if (unlockedNow.length > 0 && unexpectedChanges === 0 && completedNow.length === 0) {
        setJustUnlockedTopicIndexes(unlockedNow)
        const timeout = window.setTimeout(() => setJustUnlockedTopicIndexes([]), 1600)
        choreographyRef.current.timeouts.push(timeout)
      }
      return
    }

    const completedIndex = completedNow[0]
    const nextIndex = unlockedNow.length > 0 ? Math.min(...unlockedNow) : null
    const finalMarkerIndex = nextIndex ?? clampTopicIndex(focusTopicIndex, totalTopics)

    const state = choreographyRef.current
    state.timeouts.forEach((timeout) => window.clearTimeout(timeout))
    state.timeouts = []
    state.finalMarkerIndex = finalMarkerIndex

    if (prefersReducedMotion()) {
      setMarkerTopicIndex(finalMarkerIndex)
      reactFlow.fitView({ nodes: [{ id: topicNodeId(finalMarkerIndex) }], duration: 0, padding: 0.6, maxZoom: 1 })
      return
    }

    state.active = true
    setCelebratingTopicIndex(completedIndex)
    setHeldLockedTopicIndexes(unlockedNow)
    setMarkerTopicIndex(completedIndex)

    const schedule = (delayMs: number, fn: () => void) => {
      state.timeouts.push(window.setTimeout(fn, delayMs))
    }

    schedule(CELEBRATE_CAMERA_DELAY_MS, () => {
      reactFlow.fitView({ nodes: [{ id: topicNodeId(completedIndex) }], duration: 500, padding: 0.6, maxZoom: 1 })
    })

    if (nextIndex !== null) {
      schedule(MARKER_TRAVEL_AT_MS, () => {
        setMarkerTopicIndex(finalMarkerIndex)
        reactFlow.fitView({ nodes: [{ id: topicNodeId(finalMarkerIndex) }], duration: 950, padding: 0.6, maxZoom: 1 })
      })
      schedule(UNLOCK_BLOOM_AT_MS, () => {
        setHeldLockedTopicIndexes([])
        setJustUnlockedTopicIndexes(unlockedNow)
      })
      schedule(CHOREOGRAPHY_END_MS, () => {
        setCelebratingTopicIndex(null)
        setJustUnlockedTopicIndexes([])
        state.active = false
      })
    } else {
      schedule(CHOREOGRAPHY_END_NO_NEXT_MS, () => {
        setCelebratingTopicIndex(null)
        setMarkerTopicIndex(finalMarkerIndex)
        state.active = false
      })
    }
  }, [nodes, syllabus, focusTopicIndex, totalTopics, reactFlow])

  // Marker folgt außerhalb der Choreografie dem aktiven Thema (Frontier).
  useEffect(() => {
    if (choreographyRef.current.active) {
      return
    }
    setMarkerTopicIndex(clampTopicIndex(focusTopicIndex, totalTopics))
  }, [focusTopicIndex, totalTopics])

  // Neuen aktiven Haltepunkt erkennen → Linie füllt sich, dann poppt der Halt ein.
  useEffect(() => {
    const signature = syllabus.map((entry) => entry.topic).join('|')
    const activeStopByTopic = new Map<number, string>()
    for (const node of nodes) {
      if (node.data.kind !== 'topic' && node.data.visualStatus === 'active') {
        activeStopByTopic.set(node.data.topicIndex, node.id)
      }
    }
    const prev = stopSignatureRef.current === signature ? prevActiveStopByTopicRef.current : null
    prevActiveStopByTopicRef.current = activeStopByTopic
    stopSignatureRef.current = signature

    if (!prev) {
      return
    }

    const newlyRevealed: string[] = []
    activeStopByTopic.forEach((stopId, topicIndex) => {
      const before = prev.get(topicIndex)
      // Nur echte Fortschritte feiern: der aktive Halt hat gewechselt (vorher gab es schon einen).
      if (before && before !== stopId) {
        newlyRevealed.push(stopId)
      }
    })

    if (newlyRevealed.length === 0 || prefersReducedMotion()) {
      return
    }

    setRevealingStopIds((current) => [...new Set([...current, ...newlyRevealed])])
    const timeout = window.setTimeout(() => {
      setRevealingStopIds((current) => current.filter((id) => !newlyRevealed.includes(id)))
      revealTimeoutsRef.current = revealTimeoutsRef.current.filter((t) => t !== timeout)
    }, 1400)
    revealTimeoutsRef.current.push(timeout)
  }, [nodes, syllabus])

  // Timer beim Unmount aufräumen (Choreografie + Einstiegs-Kamerafahrt + Halt-Reveals).
  useEffect(() => {
    const state = choreographyRef.current
    const revealTimeouts = revealTimeoutsRef.current
    return () => {
      state.timeouts.forEach((timeout) => window.clearTimeout(timeout))
      revealTimeouts.forEach((timeout) => window.clearTimeout(timeout))
      if (entryPanTimerRef.current !== null) {
        window.clearTimeout(entryPanTimerRef.current)
      }
    }
  }, [])

  // Choreografie-Zustände in die Layout-Knoten einspiegeln: gehaltene Themen bleiben optisch
  // gesperrt, bis der Marker angekommen ist — erst dann blühen sie mit 'justUnlocked' auf.
  const displayNodes = useMemo(() => {
    if (
      celebratingTopicIndex === null &&
      heldLockedTopicIndexes.length === 0 &&
      justUnlockedTopicIndexes.length === 0 &&
      revealingStopIds.length === 0
    ) {
      return nodes
    }
    return nodes.map((node) => {
      if (node.data.kind !== 'topic') {
        // Zwischenschritt-Halte: neu erschienenen Halt für die Einpopp-Animation markieren.
        if (revealingStopIds.includes(node.id)) {
          return { ...node, data: { ...node.data, justRevealed: true } }
        }
        return node
      }
      const topicIndex = node.data.topicIndex
      const isHeld = heldLockedTopicIndexes.includes(topicIndex)
      const isJustUnlocked = justUnlockedTopicIndexes.includes(topicIndex)
      const isJustCompleted = celebratingTopicIndex === topicIndex
      if (!isHeld && !isJustUnlocked && !isJustCompleted) {
        return node
      }
      return {
        ...node,
        data: {
          ...node.data,
          visualStatus: isHeld ? ('locked' as const) : node.data.visualStatus,
          justUnlocked: isJustUnlocked,
          justCompleted: isJustCompleted,
        },
      }
    })
  }, [nodes, celebratingTopicIndex, heldLockedTopicIndexes, justUnlockedTopicIndexes, revealingStopIds])

  // Kante, die in einen neu erscheinenden Halt mündet: sofort „füllen" (is-filling) statt der
  // langen Eintritts-Staffelung — die Linie wächst zum neuen Halt, bevor er einpoppt.
  const displayEdges = useMemo(() => {
    if (revealingStopIds.length === 0) {
      return edges
    }
    return edges.map((edge) =>
      revealingStopIds.includes(edge.target)
        ? { ...edge, data: { ...(edge.data ?? {}), filling: true } }
        : edge,
    )
  }, [edges, revealingStopIds])

  const hasPlayedEntryPanRef = useRef(false)

  useEffect(() => {
    if (nodes.length === 0 || choreographyRef.current.active) {
      return
    }
    // Bewusst nur bei Mount/Fokuswechsel zentrieren, NICHT bei jeder Knotenänderung (z. B. neu generierter
    // Zwischenschritt im Hintergrund) — das würde die Sicht des Nutzers beim Pannen ungewollt zurückreißen.
    const isFirstFit = !hasPlayedEntryPanRef.current
    hasPlayedEntryPanRef.current = true
    if (isFirstFit && interactive && focusTopicIndex > 0 && !prefersReducedMotion()) {
      // Rückkehr-Kamerafahrt: erst der Startpunkt, dann entlang der Lichtspur zum aktuellen
      // Standort schwenken — „schau, wie weit du gekommen bist".
      reactFlow.fitView({ nodes: [{ id: topicNodeId(0) }], duration: 0, padding: 0.6, maxZoom: 1 })
      entryPanTimerRef.current = window.setTimeout(() => {
        entryPanTimerRef.current = null
        reactFlow.fitView({ nodes: [{ id: focusNodeId }], duration: 1400, padding: 0.6, maxZoom: 1 })
      }, 450)
      return
    }
    reactFlow.fitView({ nodes: [{ id: focusNodeId }], duration: 650, padding: 0.6, maxZoom: 1 })
    window.requestAnimationFrame(checkFocusVisibility)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNodeId])

  function handleRecenter() {
    reactFlow.fitView({ nodes: [{ id: focusNodeId }], duration: 300, padding: 0.6, maxZoom: 1 })
  }

  // --- „Du bist hier"-Marker: schwebender Akzent-Orb über dem aktuellen Thema. Lebt im
  // Viewport-Portal (Flow-Koordinaten) und reist per CSS-Transition mit, wenn sich der Index ändert. ---
  const markerPosition = useMemo(() => {
    if (totalTopics === 0) {
      return null
    }
    const nodeId = topicNodeId(clampTopicIndex(markerTopicIndex, totalTopics))
    const layoutNode = nodes.find((candidate) => candidate.id === nodeId)
    if (!layoutNode) {
      return null
    }
    // Erst nach der Vermessung durch react-flow die echte Knotenbreite nutzen (davor Layout-Schätzwert).
    const measuredWidth = (nodesInitialized ? reactFlow.getInternalNode(nodeId)?.measured.width : undefined) ?? 190
    return {
      x: layoutNode.position.x + measuredWidth / 2,
      y: layoutNode.position.y,
    }
  }, [markerTopicIndex, totalTopics, nodes, reactFlow, nodesInitialized])

  // --- HUD-Werte: Etappen (Goal-Gradient) + XP (tickender Zähler) ---
  const totalXp = useMemo(() => {
    let xp = 0
    for (const session of topicSessions) {
      if (!session) {
        continue
      }
      if (session.status === 'mastered') {
        xp += XP_PER_MASTERED_TOPIC
      }
      for (const leaf of [session.diagnosticSession, session.stepSession]) {
        if (!leaf) {
          continue
        }
        for (const correct of Object.values(leaf.correctnessByStepId)) {
          if (correct) {
            xp += XP_PER_CORRECT_ANSWER
          }
        }
      }
    }
    return xp
  }, [topicSessions])
  const displayXp = useCountUp(totalXp)

  const milestoneLabel = useMemo(() => {
    if (totalTopics === 0) {
      return ''
    }
    if (masteredCount >= totalTopics) {
      return 'Alle Etappen geschafft'
    }
    const stage = Math.floor(masteredCount / MILESTONE_SIZE) + 1
    const nextMilestoneAt = Math.min(totalTopics, stage * MILESTONE_SIZE)
    const remaining = Math.max(1, nextMilestoneAt - masteredCount)
    return `Noch ${remaining} Kapitel bis Etappe ${stage}`
  }, [masteredCount, totalTopics])

  const hudRingRadius = 14
  const hudRingCircumference = 2 * Math.PI * hudRingRadius
  const hudRingOffset = hudRingCircumference * (1 - (totalTopics > 0 ? masteredCount / totalTopics : 0))

  return (
    <div className="learn-map-canvas" ref={containerRef} onPointerDownCapture={skipChoreography}>
      {/* Aurora-Hintergrund: große, stark weichgezeichnete Farb-Lecks in Tonstufen der Akzentfarbe,
          die langsam und zeitversetzt „atmen" — ruhig statt Raster/Neon. */}
      <div className="learn-map-aurora" aria-hidden="true">
        <span className="learn-map-aurora-blob learn-map-aurora-blob--a" />
        <span className="learn-map-aurora-blob learn-map-aurora-blob--b" />
        <span className="learn-map-aurora-blob learn-map-aurora-blob--c" />
        <span className="learn-map-aurora-blob learn-map-aurora-blob--d" />
      </div>
      <LearnMapInteractionContext.Provider value={interaction}>
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={learnMapNodeTypes}
          edgeTypes={learnMapEdgeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={interactive}
          zoomOnScroll={interactive}
          zoomOnPinch={interactive}
          zoomOnDoubleClick={false}
          minZoom={0.4}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          className="learn-map-flow"
        >
          {markerPosition ? (
            <ViewportPortal>
              <div
                className="learn-map-marker"
                style={{ transform: `translate(${markerPosition.x}px, ${markerPosition.y}px)` }}
                aria-hidden="true"
              >
                <span className="learn-map-marker-inner">
                  <span className="learn-map-marker-halo" />
                  <span className="learn-map-marker-orb" />
                </span>
              </div>
            </ViewportPortal>
          ) : null}
        </ReactFlow>
      </LearnMapInteractionContext.Provider>
      {interactive && totalTopics > 0 ? (
        <div
          className="learn-map-hud"
          role="status"
          aria-label={`${masteredCount} von ${totalTopics} Themen gemeistert, ${totalXp} Erfahrungspunkte`}
        >
          <svg className="learn-map-hud-ring" viewBox="0 0 36 36" width="34" height="34" aria-hidden="true">
            <circle className="learn-map-hud-ring-track" cx="18" cy="18" r={hudRingRadius} />
            <circle
              className="learn-map-hud-ring-fill"
              cx="18"
              cy="18"
              r={hudRingRadius}
              strokeDasharray={hudRingCircumference}
              strokeDashoffset={hudRingOffset}
              transform="rotate(-90 18 18)"
            />
          </svg>
          <div className="learn-map-hud-copy">
            <p className="learn-map-hud-value">
              {masteredCount}/{totalTopics} Themen
              <span className="learn-map-hud-xp" key={totalXp}>
                {displayXp} XP
              </span>
            </p>
            <p className="learn-map-hud-label">{milestoneLabel}</p>
          </div>
        </div>
      ) : null}
      {interactive ? (
        <div className="learn-map-zoom" aria-label="Kartenzoom">
          <button
            type="button"
            className="learn-map-zoom-button"
            onClick={() => reactFlow.zoomIn({ duration: 180 })}
            aria-label="Vergrößern"
          >
            <span className="learn-map-zoom-icon learn-map-zoom-icon--in" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="learn-map-zoom-button"
            onClick={() => reactFlow.zoomOut({ duration: 180 })}
            aria-label="Verkleinern"
          >
            <span className="learn-map-zoom-icon learn-map-zoom-icon--out" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="learn-map-zoom-button"
            onClick={handleRecenter}
            aria-label="Auf aktives Thema zentrieren"
          >
            <span className="learn-map-zoom-icon learn-map-zoom-icon--center" aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {interactive && isFocusNodeOffscreen ? (
        <button type="button" className="learn-map-recenter-button" onClick={handleRecenter}>
          Zurück zum Pfad
        </button>
      ) : null}
      {selectedTopic ? (
        <div className="learn-map-preview" role="dialog" aria-label={`Kapitel ${selectedTopic.number}`}>
          <button
            type="button"
            className="learn-map-preview-close"
            onClick={() => setSelectedTopicIndex(null)}
            aria-label="Vorschau schließen"
          >
            <span className="learn-map-preview-close-icon" aria-hidden="true" />
          </button>
          <span className="learn-map-preview-eyebrow">Kapitel {selectedTopic.number}</span>
          <h3 className="learn-map-preview-title">{selectedTopic.title}</h3>
          {selectedTopic.learningGoals.length > 0 ? (
            <ul className="learn-map-preview-goals">
              {selectedTopic.learningGoals.map((goal) => (
                <li key={goal} className="learn-map-preview-goal">
                  {goal}
                </li>
              ))}
            </ul>
          ) : null}
          <PrimaryButton
            type="button"
            className="learn-map-preview-start"
            onClick={() => {
              onOpenTopic(selectedTopic.index)
              setSelectedTopicIndex(null)
            }}
          >
            Kapitel starten
          </PrimaryButton>
        </div>
      ) : null}
      {selectedStepInfo ? (
        <div
          className="learn-map-preview learn-map-preview--step"
          role="dialog"
          aria-label={selectedStepInfo.isDiagnostic ? 'Diagnosetest' : `Zwischenschritt ${selectedStepInfo.stepNumber}`}
        >
          <button
            type="button"
            className="learn-map-preview-close"
            onClick={() => setSelectedStep(null)}
            aria-label="Vorschau schließen"
          >
            <span className="learn-map-preview-close-icon" aria-hidden="true" />
          </button>
          <span className="learn-map-preview-eyebrow">
            {selectedStepInfo.isDiagnostic
              ? `Kapitel ${selectedStepInfo.topicNumber} · Diagnosetest`
              : `Kapitel ${selectedStepInfo.topicNumber} · Zwischenschritt ${selectedStepInfo.stepNumber}`}
          </span>
          <h3 className="learn-map-preview-title">{selectedStepInfo.title}</h3>
          <p className="learn-map-preview-step-hint">
            {selectedStepInfo.isDiagnostic
              ? 'Kurzer Einstiegstest — er zeigt, was du schon kannst und worauf sich die nächsten Schritte konzentrieren.'
              : 'Ein fokussierter Lernschritt zu diesem Thema. Du machst genau diesen Schritt und kehrst danach zur Karte zurück.'}
          </p>
          <PrimaryButton
            type="button"
            className="learn-map-preview-start"
            onClick={() => {
              onOpenTopic(selectedStepInfo.topicIndex)
              setSelectedStep(null)
            }}
          >
            {selectedStepInfo.isDiagnostic ? 'Diagnosetest starten' : 'Schritt starten'}
          </PrimaryButton>
        </div>
      ) : null}
    </div>
  )
}

/** Landkarte Phase 2: gemeinsame react-flow-Karte für Vorschau (statisch) und Vollbild (pannbar). */
export function LearnMapCanvas(props: LearnMapCanvasProps) {
  return (
    <ReactFlowProvider>
      <LearnMapCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
