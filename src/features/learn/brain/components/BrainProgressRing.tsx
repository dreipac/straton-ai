/**
 * Fortschrittsring des aktiven Lernpfads (UI-Spezifikation 3.1).
 *
 * Steht im Seitentitel statt in einer eigenen Kopfzeile im Pfad-Tab — der Fortschritt soll auf
 * allen Tabs sichtbar bleiben, nicht nur im Pfad selbst.
 */

const RING_RADIUS = 22
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

export type BrainProgressRingProps = {
  progress: number
  className?: string
}

export function BrainProgressRing({ progress, className }: BrainProgressRingProps) {
  const percent = Math.round(progress * 100)
  const dashOffset = RING_CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, progress)))

  return (
    <div
      className={`brain-path-header-ring${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={`Fortschritt ${percent} Prozent`}
    >
      <svg viewBox="0 0 52 52" aria-hidden="true">
        <circle className="brain-path-header-ring-track" cx="26" cy="26" r={RING_RADIUS} />
        <circle
          className="brain-path-header-ring-value"
          cx="26"
          cy="26"
          r={RING_RADIUS}
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span className="brain-path-header-ring-label">{percent}%</span>
    </div>
  )
}
