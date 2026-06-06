type ModalHeaderProps = {
  title: string
  onClose: () => void
  closeLabel: string
  headingLevel?: 'h1' | 'h2' | 'h3' | 'h4'
  className?: string
  titleIcon?: string
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
  titleIcon,
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
      <HeadingTag
        className={`settings-title-row-heading${titleIcon ? ' settings-title-row-heading--with-icon' : ''}`}
      >
        {titleIcon ? (
          <img className="ui-icon settings-title-row-icon" src={titleIcon} alt="" aria-hidden="true" />
        ) : null}
        <span className="settings-title-row-heading-text">{title}</span>
      </HeadingTag>
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
