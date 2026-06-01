import type { ReactNode } from 'react'
import { preventIosBlurOnlyTapWhenChatInputFocused } from '../../../../utils/chatComposerFocusTap'

export type ChatMobileQuickTileProps = {
  active: boolean
  tileClassName: string
  onActivate: () => void
  onDeactivate: () => void
  deactivateAriaLabel: string
  children: ReactNode
}

/** Mobil: Schnellkachel mit kleinem X oben rechts zum Deaktivieren. */
export function ChatMobileQuickTile({
  active,
  tileClassName,
  onActivate,
  onDeactivate,
  deactivateAriaLabel,
  children,
}: ChatMobileQuickTileProps) {
  return (
    <div className={`chat-quick-tile-wrap${active ? ' is-active' : ''}`}>
      <button
        type="button"
        className={tileClassName}
        onPointerDown={preventIosBlurOnlyTapWhenChatInputFocused}
        onClick={onActivate}
      >
        {children}
      </button>
      {active ? (
        <button
          type="button"
          className="chat-quick-tile-dismiss"
          aria-label={deactivateAriaLabel}
          onPointerDown={(e) => {
            e.stopPropagation()
            preventIosBlurOnlyTapWhenChatInputFocused(e)
          }}
          onClick={(e) => {
            e.stopPropagation()
            onDeactivate()
          }}
        >
          <span aria-hidden>×</span>
        </button>
      ) : null}
    </div>
  )
}
