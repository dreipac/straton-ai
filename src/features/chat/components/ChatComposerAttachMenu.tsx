import { useEffect, useRef, useState, type TransitionEvent } from 'react'
import attachmentIcon from '../../../assets/icons/attachment.svg'
import plusIcon from '../../../assets/icons/plus.svg'
import starsIcon from '../../../assets/icons/stars.svg'
import { preventIosBlurOnlyTapWhenChatInputFocused } from '../../../utils/chatComposerFocusTap'
import { MenuItem } from '../../../components/ui/menu/MenuItem'
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
  const [menuInDom, setMenuInDom] = useState(false)
  const [menuVisible, setMenuVisible] = useState(false)
  const anchorRef = useRef<HTMLDivElement | null>(null)

  const currentReplyLabel =
    CHAT_REPLY_MODE_OPTIONS.find((option) => option.id === replyMode)?.label ?? 'Comfort'

  useEffect(() => {
    if (isMobile) {
      setMenuInDom(false)
      setMenuVisible(false)
      return
    }
    if (menuOpen) {
      setMenuInDom(true)
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setMenuVisible(true))
      })
      return () => cancelAnimationFrame(frame)
    }
    setMenuVisible(false)
  }, [isMobile, menuOpen])

  function handleAttachMenuTransitionEnd(event: TransitionEvent<HTMLDivElement>) {
    if (event.currentTarget !== event.target) {
      return
    }
    if (event.propertyName !== 'opacity' && event.propertyName !== 'transform') {
      return
    }
    if (!menuVisible && menuInDom) {
      setMenuInDom(false)
    }
  }

  useEffect(() => {
    if (!menuOpen) {
      return
    }
    function handlePointerDown(event: MouseEvent) {
      const anchor = anchorRef.current
      if (!anchor || anchor.contains(event.target as Node)) {
        return
      }
      setMenuOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

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
      {!isMobile && menuInDom ? (
        <div
          className={`thread-menu chat-composer-attach-menu${menuVisible ? ' is-visible' : ''}`}
          role="menu"
          aria-label="Anhang-Menü"
          onTransitionEnd={handleAttachMenuTransitionEnd}
        >
          <MenuItem
            iconSrc={attachmentIcon}
            className="chat-composer-attach-menu-item"
            onClick={handleUploadFile}
          >
            Datei anhängen
          </MenuItem>
          {showReplyModeOption ? (
            <div className="chat-composer-attach-submenu-wrap">
              <button
                type="button"
                className="thread-menu-item chat-composer-attach-menu-item chat-composer-attach-submenu-trigger"
                role="menuitem"
                aria-haspopup="menu"
              >
                <img
                  className="ui-icon thread-menu-item-icon"
                  src={starsIcon}
                  alt=""
                  aria-hidden="true"
                />
                <span className="chat-composer-attach-submenu-trigger-label">{currentReplyLabel}</span>
                <span className="chat-composer-attach-submenu-chevron" aria-hidden="true" />
              </button>
              <div
                className="thread-menu chat-composer-attach-submenu"
                role="menu"
                aria-label="Antwortmodus wählen"
              >
                {CHAT_REPLY_MODE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={option.id === replyMode}
                    className={`thread-menu-item chat-composer-attach-menu-item${
                      option.id === replyMode ? ' is-selected' : ''
                    }`}
                    onClick={() => handleReplyModePick(option.id)}
                  >
                    {option.id === replyMode ? (
                      <span className="chat-composer-attach-menu-item-check" aria-hidden="true" />
                    ) : (
                      <span className="chat-composer-attach-menu-item-check-spacer" aria-hidden="true" />
                    )}
                    <span className="chat-composer-attach-menu-item-label">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
