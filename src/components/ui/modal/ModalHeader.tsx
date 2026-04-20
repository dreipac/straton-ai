type ModalHeaderProps = {
  title: string
  onClose: () => void
  closeLabel: string
  headingLevel?: 'h1' | 'h2' | 'h3' | 'h4'
  className?: string
  /** Mobil: Zurück-Button links (vor dem Titel) */
  onBack?: () => void
  backLabel?: string
  /** false z. B. im ProfileFullSheet: Schließen nur in der Sheet-Kopfzeile */
  showCloseButton?: boolean
}

export function ModalHeader({
  title,
  onClose,
  closeLabel,
  headingLevel = 'h2',
  className,
  onBack,
  backLabel,
  showCloseButton = true,
}: ModalHeaderProps) {
  const HeadingTag = headingLevel
  const classes = ['settings-title-row', onBack ? 'settings-title-row--with-back' : '', className ?? '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      {onBack ? (
        <button type="button" className="settings-back-button" onClick={onBack} aria-label={backLabel ?? 'Zurück'}>
          <span className="ui-icon settings-back-icon" aria-hidden="true" />
        </button>
      ) : null}
      <HeadingTag className="settings-title-row-heading">{title}</HeadingTag>
      {showCloseButton ? (
        <button type="button" className="settings-close-button" onClick={onClose} aria-label={closeLabel}>
          <span className="ui-icon settings-close-icon" aria-hidden="true" />
        </button>
      ) : (
        <span className="settings-title-row-close-spacer" aria-hidden="true" />
      )}
    </div>
  )
}
