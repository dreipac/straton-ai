import { useCallback, useRef, useState } from 'react'
import attachmentIcon from '../../../assets/icons/attachment.svg'
import plusIcon from '../../../assets/icons/plus.svg'
import starsIcon from '../../../assets/icons/stars.svg'
import { preventIosBlurOnlyTapWhenChatInputFocused } from '../../../utils/chatComposerFocusTap'
import { MenuItem, MenuRadioItem } from '../../../components/ui/menu/MenuItem'
import { PopoverMenu } from '../../../components/ui/menu/PopoverMenu'
import { PopoverSubmenu } from '../../../components/ui/menu/PopoverSubmenu'
import {
  CHAT_REPLY_MODE_OPTIONS,
  type ChatReplyMode,
} from '../constants/chatReplyMode'

export type ChatComposerAttachMenuProps = {
  className?: string
  disabled?: boolean
  ariaLabel: string
  isMobile: boolean
  onMobileOpen: () => void
  onUploadFile: () => void
  replyMode: ChatReplyMode
  onReplyModeChange: (mode: ChatReplyMode) => void
  showReplyModeOption: boolean
}

export function ChatComposerAttachMenu({
  className,
  disabled,
  ariaLabel,
  isMobile,
  onMobileOpen,
  onUploadFile,
  replyMode,
  onReplyModeChange,
  showReplyModeOption,
}: ChatComposerAttachMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  const currentReplyLabel =
    CHAT_REPLY_MODE_OPTIONS.find((option) => option.id === replyMode)?.label ?? 'Comfort'

  /* Auf Mobile übernimmt ein Bottom Sheet. Wechselt die Breite, während das Menü offen ist, soll es
     nicht später von selbst wieder auftauchen — deshalb beim Umschlagen direkt zurücksetzen. */
  const [wasMobile, setWasMobile] = useState(isMobile)
  if (wasMobile !== isMobile) {
    setWasMobile(isMobile)
    setMenuOpen(false)
  }

  function handleAttachClick() {
    if (disabled) {
      return
    }
    if (isMobile) {
      onMobileOpen()
      return
    }
    setMenuOpen((open) => !open)
  }

  function closeMenus() {
    setMenuOpen(false)
  }

  function handleUploadFile() {
    onUploadFile()
    closeMenus()
  }

  function handleReplyModePick(mode: ChatReplyMode) {
    onReplyModeChange(mode)
    closeMenus()
  }

  return (
    <div
      className={`chat-composer-attach-menu-anchor${menuOpen ? ' is-open' : ''}`}
      ref={anchorRef}
    >
      <button
        type="button"
        className={className}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={!isMobile && menuOpen ? true : undefined}
        aria-haspopup={!isMobile ? 'menu' : undefined}
        onPointerDown={preventIosBlurOnlyTapWhenChatInputFocused}
        onClick={handleAttachClick}
      >
        <img className="ui-icon chat-send-icon" src={plusIcon} alt="" aria-hidden="true" />
      </button>
      <PopoverMenu
        open={!isMobile && menuOpen}
        onClose={closeMenu}
        direction="up"
        anchorRef={anchorRef}
        ariaLabel="Anhang-Menü"
        className="chat-composer-attach-menu"
      >
        <MenuItem
          iconSrc={attachmentIcon}
          className="chat-composer-attach-menu-item"
          onClick={handleUploadFile}
        >
          Datei anhängen
        </MenuItem>
        {showReplyModeOption ? (
          <PopoverSubmenu
            label={currentReplyLabel}
            iconSrc={starsIcon}
            ariaLabel="Antwortmodus wählen"
            className="chat-composer-attach-menu-item"
          >
            {CHAT_REPLY_MODE_OPTIONS.map((option) => (
              <MenuRadioItem
                key={option.id}
                checked={option.id === replyMode}
                className="chat-composer-attach-menu-item"
                onClick={() => handleReplyModePick(option.id)}
              >
                {option.label}
              </MenuRadioItem>
            ))}
          </PopoverSubmenu>
        ) : null}
      </PopoverMenu>
    </div>
  )
}
