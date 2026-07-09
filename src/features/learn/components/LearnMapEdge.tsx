import { getBezierPath, Position, type EdgeProps } from '@xyflow/react'
import type { CSSProperties } from 'react'
import type { LearnMapEdgeState } from '../utils/learnMapLayout'

/**
 * Kanten der Lernlandkarte in drei Zuständen:
 * - done: gemeisterte Strecke — leuchtende Lichtspur (breiter Glow unter der Linie) hinter dem Nutzer.
 * - flow: Strecke zum aktiven Knoten — zusätzlich wandert ein Licht-Puls in Zielrichtung (Handlungs-Sog).
 * - locked: gedimmte Linie ohne Extras.
 *
 * Die Linie ist ein geschwungener Bogen (getBezierPath): Da die Themen in der Serpentine seitlich
 * versetzt liegen, entsteht zwischen zwei Knoten eine sanfte S-Kurve statt einer geraden Diagonale.
 * Der Pfad wird als eigener Pfad gerendert (statt BaseEdge), damit er sich beim Öffnen des Tabs
 * „zeichnen" kann: pathLength=1 + stroke-dasharray/-dashoffset laufen die Kante entlang. Die
 * Zeichen-Verzögerung (data.enterDelayMs) kommt aus dem Layout und staffelt die Kanten von unten
 * nach oben, kurz nachdem der jeweilige Zielknoten erschienen ist. Der Puls-Pfad nutzt ebenfalls
 * pathLength=100, damit er unabhängig von der echten Kantenlänge gleich schnell von source → target
 * wandert.
 *
 * data.filling (Choreografie): true, solange sich das Teilstück gerade bis zum nächsten Halt füllt —
 * die Linie zeichnet sich dann erneut (CSS), egal ob sie beim Eintritt schon einmal gezeichnet wurde.
 */
export function LearnMapEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  data,
}: EdgeProps) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition: sourcePosition ?? Position.Top,
    targetX,
    targetY,
    targetPosition: targetPosition ?? Position.Bottom,
    curvature: 0.32,
  })
  const state: LearnMapEdgeState =
    data?.state === 'done' || data?.state === 'flow' ? (data.state as LearnMapEdgeState) : 'locked'
  const rawDelay = data?.enterDelayMs
  const enterDelayMs = typeof rawDelay === 'number' ? rawDelay : 560
  const isFilling = data?.filling === true

  // Verzögerung als CSS-Var an die Gruppe — Linie/Glow/Puls erben sie und starten synchron.
  const groupStyle = { '--lm-edge-delay': `${enterDelayMs}ms` } as CSSProperties

  return (
    <g
      className={`learn-map-edge-group learn-map-edge-group--${state}${isFilling ? ' is-filling' : ''}`}
      style={groupStyle}
    >
      {state !== 'locked' ? <path d={path} className="learn-map-edge-glow" aria-hidden="true" /> : null}
      <path id={id} d={path} pathLength={1} className="react-flow__edge-path learn-map-edge-line" />
      {state === 'flow' ? (
        <path d={path} pathLength={100} className="learn-map-edge-pulse" aria-hidden="true" />
      ) : null}
    </g>
  )
}
