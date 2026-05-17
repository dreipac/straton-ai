import menuIcon from '../../../assets/icons/menu.svg'

export type ChatToolbarMobileMenuSelectProps = {
  onSelectLearnPath: () => void
  learnPathDisabled?: boolean
  onSelectShare?: () => void
  shareLabel?: string
  shareDisabled?: boolean
  onSelectParticipants?: () => void
  showParticipantsOption?: boolean
}

/**
 * Native `<select>` als Menü-Button (iOS/PWA System-Aktionsliste).
 */
export function ChatToolbarMobileMenuSelect({
  onSelectLearnPath,
  learnPathDisabled = false,
  onSelectShare,
  shareLabel,
  shareDisabled = false,
  onSelectParticipants,
  showParticipantsOption = false,
}: ChatToolbarMobileMenuSelectProps) {
  const hasShare = Boolean(onSelectShare && shareLabel)
  const hasParticipants = Boolean(showParticipantsOption && onSelectParticipants)

  return (
    <label className="chat-toolbar-mobile-menu">
      <img className="ui-icon chat-toolbar-mobile-menu-icon" src={menuIcon} alt="" aria-hidden="true" />
      <select
        className="chat-toolbar-mobile-menu-select"
        value=""
        aria-label="Chat-Menü"
        onChange={(event) => {
          const action = event.target.value
          if (action === 'learn-path') {
            onSelectLearnPath()
          } else if (action === 'share') {
            onSelectShare?.()
          } else if (action === 'participants') {
            onSelectParticipants?.()
          }
          event.target.value = ''
          event.currentTarget.blur()
        }}
      >
        <option value="" disabled hidden>
          Menü
        </option>
        <option value="learn-path" disabled={learnPathDisabled}>
          Lernpfad erstellen
        </option>
        {hasShare ? (
          <option value="share" disabled={shareDisabled}>
            {shareLabel}
          </option>
        ) : null}
        {hasParticipants ? <option value="participants">Teilnehmer</option> : null}
      </select>
    </label>
  )
}
