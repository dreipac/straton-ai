type LearningPathProgressRingProps = {
  percent: number
  className?: string
}

const RING_SIZE = 34
const STROKE = 3
const R = (RING_SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * R

export function LearningPathProgressRing({ percent, className = '' }: LearningPathProgressRingProps) {
  const percentValue = Math.min(100, Math.max(0, Math.round(percent)))
  const fillLength = (CIRCUMFERENCE * percentValue) / 100
  const gapLength = CIRCUMFERENCE - fillLength

  return (
    <span
      className={['learning-path-progress-ring', className].filter(Boolean).join(' ')}
      role="img"
      aria-label={`${percentValue} Prozent abgeschlossen`}
    >
      <svg
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        aria-hidden="true"
        className="learning-path-progress-ring__svg"
      >
        <circle
          className="learning-path-progress-ring__track"
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={R}
          fill="none"
          strokeWidth={STROKE}
        />
        {percentValue > 0 ? (
          <circle
            className="learning-path-progress-ring__fill"
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={R}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${fillLength} ${gapLength}`}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        ) : null}
      </svg>
      <span className="learning-path-progress-ring__label">{percentValue}%</span>
    </span>
  )
}
