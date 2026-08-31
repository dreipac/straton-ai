export type LearnErrorLogbookHintCardProps = {
  count: number
  onOpen: () => void
  onDismiss: () => void
}

export function LearnErrorLogbookHintCard(props: LearnErrorLogbookHintCardProps) {
  const { count, onOpen, onDismiss } = props
  if (count <= 0) {
    return null
  }

  return (
    <div className="learn-error-logbook-hint" role="status">
      <div className="learn-error-logbook-hint-card-wrap">
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
        <button
          type="button"
          className="learn-error-logbook-hint-close"
          aria-label="Hinweis schließen"
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onDismiss()
          }}
        >
          <span className="learn-error-logbook-hint-close-icon" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
