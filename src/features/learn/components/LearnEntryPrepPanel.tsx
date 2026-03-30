import starIcon from '../../../assets/icons/star.svg'

export type LearnEntryPrepPanelProps = {
  ariaLabel: string
  setupAnalysisArcRadius: number
  setupAnalysisArcLength: number
  setupAnalysisCircumference: number
  arcOffset: number
  overallPercent: number
  stepLabels: readonly string[]
  activeStepIndex: number
  stepPercents: number[]
  isExiting?: boolean
  loaderText?: string
}

export function LearnEntryPrepPanel(props: LearnEntryPrepPanelProps) {
  const {
    ariaLabel,
    setupAnalysisArcRadius,
    setupAnalysisArcLength,
    setupAnalysisCircumference,
    arcOffset,
    overallPercent,
    stepLabels,
    activeStepIndex,
    stepPercents,
    isExiting = false,
    loaderText = 'Dein Lernpfad wird vorbereitet...',
  } = props

  return (
    <section className={`learn-entry-prep${isExiting ? ' is-exiting' : ''}`} aria-live="polite" aria-label={ariaLabel}>
      <div className="learn-entry-prep-progress">
        <div className="learn-setup-analysis-ring">
          <svg className="learn-setup-analysis-ring-svg" width="104" height="104" viewBox="0 0 104 104" aria-hidden="true">
            <g transform="rotate(-130 52 52)">
              <circle
                className="learn-setup-analysis-ring-track"
                cx="52"
                cy="52"
                r={setupAnalysisArcRadius}
                fill="none"
                strokeDasharray={`${setupAnalysisArcLength} ${setupAnalysisCircumference}`}
              />
              <circle
                className="learn-setup-analysis-ring-progress"
                cx="52"
                cy="52"
                r={setupAnalysisArcRadius}
                fill="none"
                strokeDasharray={`${setupAnalysisArcLength} ${setupAnalysisCircumference}`}
                strokeDashoffset={arcOffset}
              />
            </g>
          </svg>
          <span className="learn-setup-analysis-percent">{overallPercent}%</span>
        </div>
        <div className="learn-topic-suggestions-loader" role="status">
          <span className="learn-topic-loader-orbit" aria-hidden="true">
            <img className="ui-icon learn-topic-loader-star is-one" src={starIcon} alt="" />
            <img className="ui-icon learn-topic-loader-star is-two" src={starIcon} alt="" />
            <img className="ui-icon learn-topic-loader-star is-three" src={starIcon} alt="" />
          </span>
          <span className="learn-topic-loader-text">{loaderText}</span>
        </div>
      </div>
      <div className="learn-entry-prep-steps">
        {stepLabels.slice(0, activeStepIndex + 1).map((label, index) => (
          <div
            key={label}
            className={`learn-entry-prep-step ${
              index < activeStepIndex ? 'is-complete' : index === activeStepIndex ? 'is-active' : ''
            }`}
          >
            <span>{label}</span>
            <strong>{Math.max(0, Math.min(100, Math.round(stepPercents[index] ?? 0)))}%</strong>
          </div>
        ))}
      </div>
    </section>
  )
}
