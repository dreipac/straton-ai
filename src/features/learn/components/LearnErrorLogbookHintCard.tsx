export type LearnErrorLogbookHintCardProps = {
  count: number
  onOpen: () => void
}

export function LearnErrorLogbookHintCard(props: LearnErrorLogbookHintCardProps) {
  const { count, onOpen } = props
  if (count <= 0) {
    return null
  }

  return (
    <div className="learn-error-logbook-hint" role="status">
      <button type="button" className="learn-error-logbook-hint-card" onClick={onOpen}>
        <span className="learn-error-logbook-hint-badge" aria-hidden="true">
          {count}
        </span>
        <span className="learn-error-logbook-hint-copy">
          <span className="learn-error-logbook-hint-title">
            {count === 1 ? '1 Lücke' : `${count} Lücken`} zum Nacharbeiten
          </span>
          <span className="learn-error-logbook-hint-meta">Tippen für Details in Statistiken</span>
        </span>
      </button>
    </div>
  )
}
