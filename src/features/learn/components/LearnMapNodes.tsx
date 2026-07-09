import { memo, useContext } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { LearnMapNode, LearnMapNodeData } from '../utils/learnMapLayout'
import { LearnMapInteractionContext } from '../utils/learnMapInteractionContext'

/**
 * Zwischenschritt-Haltepunkt auf der Verbindungslinie. Die Handles sitzen oben/unten, damit die
 * geschwungene Kette vertikal durch den Dot läuft. Nur der AKTIVE Halt ist anklickbar (öffnet die
 * Schritt-Detailkarte) und trägt ein Label — erledigte Halte bleiben als stille Lichtspur-Punkte
 * hinter dir, künftige Schritte existieren noch gar nicht. So erscheint immer nur EIN Zwischenschritt.
 *
 * Ghost-Halt (data.pending): der nächste Zwischenschritt wird gerade generiert — schimmernder
 * Platzhalter mit Label, rein visuell (nicht klickbar). Er reserviert exakt die Position, an der
 * der echte Schritt gleich erscheint.
 */
function LearnMapStopNode({ data }: { data: LearnMapNodeData }) {
  const { onSelectStep } = useContext(LearnMapInteractionContext)
  const isActive = data.visualStatus === 'active'
  const isPending = data.pending === true
  const stepIndex = typeof data.stepIndex === 'number' ? data.stepIndex : -1

  const revealedClass = data.justRevealed ? ' is-just-revealed' : ''
  const pendingClass = isPending ? ' learn-map-stop--pending' : ''

  return (
    <div
      className={`learn-map-stop learn-map-stop--${data.kind} is-${data.visualStatus}${pendingClass}${revealedClass}`}
    >
      <Handle type="target" position={Position.Bottom} id="in" className="learn-map-node-handle" />
      {isActive ? (
        <button
          type="button"
          className="learn-map-stop-button"
          onClick={() => onSelectStep({ topicIndex: data.topicIndex, stepIndex })}
          aria-label={`Zwischenschritt: ${data.title}`}
        >
          <span className="learn-map-stop-dot" aria-hidden="true" />
          <span className="learn-map-stop-label">{data.title}</span>
        </button>
      ) : isPending ? (
        <span className="learn-map-stop-pending-body" aria-label="Nächster Zwischenschritt wird vorbereitet">
          <span className="learn-map-stop-dot" aria-hidden="true" />
          <span className="learn-map-stop-label">{data.title}</span>
        </span>
      ) : (
        <span className="learn-map-stop-dot" aria-hidden="true" />
      )}
      <Handle type="source" position={Position.Top} id="out" className="learn-map-node-handle" />
    </div>
  )
}

/** Breites Hexagon mit abgerundeten Ecken (Bento-Look) — als SVG-Pfad, weil clip-path: polygon()
 *  keine Rundungen kann. Ecken über Quadratic-Kurven (r ≈ 10 Einheiten entlang der Kanten),
 *  preserveAspectRatio="none" streckt den Pfad auf die CSS-Größe, non-scaling-stroke hält den
 *  Rand dabei konstant dünn. */
const HEXAGON_ROUNDED_PATH =
  'M 36.9 0 L 131.1 0 Q 141.1 0 146.9 8.2 L 162.2 29.8 Q 168 38 162.2 46.2 L 146.9 67.8 Q 141.1 76 131.1 76 L 36.9 76 Q 26.9 76 21.1 67.8 L 5.8 46.2 Q 0 38 5.8 29.8 L 21.1 8.2 Q 26.9 0 36.9 0 Z'

const MASTERY_RING_RADIUS = 12
const MASTERY_RING_CIRCUMFERENCE = 2 * Math.PI * MASTERY_RING_RADIUS

function LearnMapTopicHexagon({ data }: { data: LearnMapNodeData }) {
  const { onSelectTopic } = useContext(LearnMapInteractionContext)
  const isClickable = data.visualStatus !== 'locked'
  const stars =
    data.visualStatus === 'completed' && typeof data.stars === 'number'
      ? Math.max(1, Math.min(3, data.stars))
      : null
  const masteryPercent =
    data.visualStatus === 'active' && typeof data.masteryPercent === 'number'
      ? Math.max(0, Math.min(100, data.masteryPercent))
      : null

  const choreographyClasses = `${data.justCompleted ? ' is-just-completed' : ''}${
    data.justUnlocked ? ' is-just-unlocked' : ''
  }`

  return (
    <button
      type="button"
      className={`learn-map-node learn-map-node--topic is-${data.visualStatus}${choreographyClasses}`}
      disabled={!isClickable}
      onClick={() => {
        if (isClickable) {
          onSelectTopic(data.topicIndex)
        }
      }}
    >
      <Handle type="target" position={Position.Bottom} id="topic-down" className="learn-map-node-handle" />
      <span className="learn-map-node-hexagon" aria-hidden="true">
        <svg className="learn-map-node-hexagon-shape" viewBox="0 0 168 76" preserveAspectRatio="none">
          <path d={HEXAGON_ROUNDED_PATH} vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="learn-map-node-hexagon-number">{data.topicIndex + 1}</span>
        <span className="learn-map-node-hexagon-status" />
        <span className="learn-map-node-hexagon-label">{data.title}</span>
      </span>
      {stars !== null ? (
        <span className="learn-map-node-stars" aria-label={`${stars} von 3 Sternen`}>
          {[1, 2, 3].map((slot) => (
            <span
              key={slot}
              className={`learn-map-node-star${slot <= stars ? ' is-filled' : ''}`}
              aria-hidden="true"
            />
          ))}
        </span>
      ) : null}
      {masteryPercent !== null ? (
        <span className="learn-map-node-mastery" aria-label={`Beherrschung ${masteryPercent} Prozent`}>
          <svg className="learn-map-node-mastery-ring" viewBox="0 0 30 30" width="20" height="20" aria-hidden="true">
            <circle className="learn-map-node-mastery-track" cx="15" cy="15" r={MASTERY_RING_RADIUS} />
            <circle
              className="learn-map-node-mastery-fill"
              cx="15"
              cy="15"
              r={MASTERY_RING_RADIUS}
              strokeDasharray={MASTERY_RING_CIRCUMFERENCE}
              strokeDashoffset={MASTERY_RING_CIRCUMFERENCE * (1 - masteryPercent / 100)}
              transform="rotate(-90 15 15)"
            />
          </svg>
          <span className="learn-map-node-mastery-value">{masteryPercent}%</span>
        </span>
      ) : null}
      <Handle type="source" position={Position.Top} id="topic-up" className="learn-map-node-handle" />
    </button>
  )
}

export const LearnMapTopicNode = memo(function LearnMapTopicNode({ data }: NodeProps<LearnMapNode>) {
  return <LearnMapTopicHexagon data={data} />
})

export const LearnMapStepNode = memo(function LearnMapStepNode({ data }: NodeProps<LearnMapNode>) {
  return <LearnMapStopNode data={data} />
})
