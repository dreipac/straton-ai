type ModalHeaderProps = {
  title: string
  onClose: () => void
  closeLabel: string
  headingLevel?: 'h1' | 'h2' | 'h3' | 'h4'
  className?: string
}

export function ModalHeader({
  title,
  onClose,
  closeLabel,
  headingLevel = 'h2',
  className,
}: ModalHeaderProps) {
  const HeadingTag = headingLevel
  const classes = ['settings-title-row', className ?? ''].filter(Boolean).join(' ')

  return (
    <div className={classes}>
      <HeadingTag>{title}</HeadingTag>
      <button type="button" className="settings-close-button" onClick={onClose} aria-label={closeLabel}>
        <span className="ui-icon settings-close-icon" aria-hidden="true" />
      </button>
    </div>
  )
}
