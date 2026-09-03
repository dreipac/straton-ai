import { useCallback, useEffect, useRef, useState } from 'react'
import claudeIconSrc from '../../../assets/icons/claude.svg'
import gptIconSrc from '../../../assets/icons/gpt.svg'
import webIconSrc from '../../../assets/icons/web-outlined.svg'
import { MaskIcon } from '../../../components/ui/MaskIcon'
import { MenuRadioItem } from '../../../components/ui/menu/MenuItem'
import { PopoverMenu } from '../../../components/ui/menu/PopoverMenu'
import { PopoverSubmenu } from '../../../components/ui/menu/PopoverSubmenu'
import {
  ContentBottomSheet,
  type ContentBottomSheetHandle,
} from '../../../components/ui/bottom-sheet/ContentBottomSheet'
import { preventIosBlurOnlyTapWhenChatInputFocused } from '../../../utils/chatComposerFocusTap'
import { chatToolbarMobileMediaQuery, isChatToolbarMobileViewport } from '../../../utils/mobile'
import {
  CHAT_COMPOSER_MODELS,
  getChatComposerModelMeta,
  type ChatComposerModelId,
  type ChatComposerModelOption,
} from '../constants/chatComposerModels'
import {
  chatComposerSelectionLabel,
  type ChatComposerSelection,
} from '../constants/chatComposerSelection'
import { CHAT_THINKING_MODE_OPTIONS } from '../constants/chatThinkingMode'
import {
  CHAT_WEB_SEARCH_MODE_OPTIONS,
  type ChatWebSearchMode,
  getChatWebSearchModeShortLabel,
} from '../constants/chatWebSearchMode'

export type ChatComposerModePickerProps = {
  value: ChatComposerSelection
  onChange: (selection: ChatComposerSelection) => void
  disabled?: boolean
  /** Vom Abo gesperrte Modelle — im Menü sichtbar, aber nicht anwählbar. */
  blockedModelIds?: readonly ChatComposerModelId[]
  webSearchMode: ChatWebSearchMode
  onWebSearchModeChange: (mode: ChatWebSearchMode) => void
}

/**
 * Zeichen der Verarbeitungswege: Smart Instant und Thinking wählt Straton selbst, beide tragen
 * daher die Wortmarke — dieselbe Vorlage wie der Straton-Eintrag im Einstellungsmenü. Sie liegt
 * unter `public/`, wird also über die Basis-URL adressiert statt gebündelt.
 */
const stratonIconSrc = `${import.meta.env.BASE_URL}assets/logo/Straton.png`

/** Markenfarbe von Anthropic; die übrigen Zeichen laufen in der Textfarbe ihres Umfelds mit. */
const CLAUDE_ICON_COLOR = '#d97757'

type ComposerIcon = { src: string; color?: string }

/** Zeichen des Anbieters — die Modell-IDs selbst spielen dabei keine Rolle. */
function modelIcon(option: ChatComposerModelOption): ComposerIcon {
  return option.provider === 'anthropic'
    ? { src: claudeIconSrc, color: CLAUDE_ICON_COLOR }
    : { src: gptIconSrc }
}

/** Zeichen der aktuellen Auswahl — für die Pille in der Composer-Leiste. */
function selectionIcon(value: ChatComposerSelection): ComposerIcon {
  if (value === 'normal' || value === 'thinking') {
    return { src: stratonIconSrc }
  }
  return modelIcon(getChatComposerModelMeta(value))
}

/**
 * Färbt die Pille: blau bei Thinking, sonst neutral. Eine feste Modellwahl bekommt bewusst keine
 * eigene Farbe — sie zeigt sich am Zeichen und am Namen in der Pille.
 */
function pickerRootClass(value: ChatComposerSelection): string {
  const variant = value === 'thinking' ? 'thinking' : 'normal'
  return `chat-model-picker chat-thinking-mode-picker chat-thinking-mode-picker--${variant}`
}

const tileTriggerClass = 'chat-model-picker-trigger chat-composer-tile-btn chat-composer-tile-btn--pill'

function useChatToolbarMobilePicker(): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? isChatToolbarMobileViewport() : false,
  )

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const mq = window.matchMedia(chatToolbarMobileMediaQuery())
    const sync = () => setMobile(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    window.addEventListener('resize', sync)
    return () => {
      mq.removeEventListener('change', sync)
      window.removeEventListener('resize', sync)
    }
  }, [])

  return mobile
}

/**
 * Sheet auf Mobile (≤860px) statt Popover-Dropdown: gleicher Inhalt (Modus, Modell, Web-Suche) wie
 * `ChatComposerModeDropdown`, nur als Bottom Sheet — dort passt anders als im nativen `<select>`
 * auch die Websuche mit rein (kein Untermenü nötig, alle Optionen stehen einfach untereinander).
 */
function ChatComposerModeSheet({
  value,
  onChange,
  disabled,
  blockedModelIds = [],
  webSearchMode,
  onWebSearchModeChange,
}: ChatComposerModePickerProps) {
  const [open, setOpen] = useState(false)
  const sheetRef = useRef<ContentBottomSheetHandle | null>(null)
  const currentLabel = chatComposerSelectionLabel(value)
  const currentIcon = selectionIcon(value)

  function pick(selection: ChatComposerSelection) {
    onChange(selection)
    sheetRef.current?.requestClose()
  }

  function pickWebSearchMode(mode: ChatWebSearchMode) {
    onWebSearchModeChange(mode)
    sheetRef.current?.requestClose()
  }

  return (
    <div className={pickerRootClass(value)}>
      <button
        type="button"
        className={tileTriggerClass}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Modus: ${currentLabel}. Auswahl öffnen`}
        onPointerDown={preventIosBlurOnlyTapWhenChatInputFocused}
        onClick={() => setOpen(true)}
      >
        <MaskIcon src={currentIcon.src} color={currentIcon.color} className="chat-model-picker-trigger-icon" />
        <span className="chat-model-picker-label">{currentLabel}</span>
        <span className="chat-model-picker-chevron" aria-hidden="true" />
      </button>
      <ContentBottomSheet
        ref={sheetRef}
        open={open}
        onExitComplete={() => setOpen(false)}
        title="Modus & Modell"
        bodyClassName="chat-model-picker-sheet-body"
      >
        <div className="chat-model-picker-group-label" aria-hidden="true">
          Modus
        </div>
        {CHAT_THINKING_MODE_OPTIONS.map((option) => (
          <MenuRadioItem
            key={option.id}
            checked={value === option.id}
            iconSrc={stratonIconSrc}
            onClick={() => pick(option.id)}
          >
            {option.label}
          </MenuRadioItem>
        ))}

        <div className="chat-model-picker-group-label" aria-hidden="true">
          Modell
        </div>
        {CHAT_COMPOSER_MODELS.map((option) => {
          const isBlocked = blockedModelIds.includes(option.id)
          const icon = modelIcon(option)
          return (
            <MenuRadioItem
              key={option.id}
              checked={value === option.id}
              disabled={isBlocked}
              iconSrc={icon.src}
              iconColor={icon.color}
              title={isBlocked ? 'In deinem Abo nicht verfügbar' : undefined}
              onClick={() => pick(option.id)}
            >
              {option.label}
            </MenuRadioItem>
          )
        })}

        <div className="chat-model-picker-group-label" aria-hidden="true">
          Web-Suche
        </div>
        {CHAT_WEB_SEARCH_MODE_OPTIONS.map((option) => (
          <MenuRadioItem
            key={option.id}
            checked={option.id === webSearchMode}
            iconSrc={webIconSrc}
            onClick={() => pickWebSearchMode(option.id)}
          >
            {option.label}
          </MenuRadioItem>
        ))}
      </ContentBottomSheet>
    </div>
  )
}

/**
 * Die eine Auswahl der Composer-Leiste: Verarbeitungsweg (Smart Instant, Thinking), festes Modell
 * und die Websuche in einem Menü. Ein gewähltes Modell läuft über denselben Weg wie Smart Instant,
 * nur ohne automatische Modellwahl.
 */
export function ChatComposerModePicker(props: ChatComposerModePickerProps) {
  const isMobile = useChatToolbarMobilePicker()

  if (isMobile) {
    return <ChatComposerModeSheet {...props} />
  }

  return <ChatComposerModeDropdown {...props} />
}

function ChatComposerModeDropdown({
  value,
  onChange,
  disabled,
  blockedModelIds = [],
  webSearchMode,
  onWebSearchModeChange,
}: ChatComposerModePickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const close = useCallback(() => setOpen(false), [])
  const currentLabel = chatComposerSelectionLabel(value)
  const currentIcon = selectionIcon(value)

  function pick(selection: ChatComposerSelection) {
    onChange(selection)
    setOpen(false)
  }

  /* Hält den Fokus im Eingabefeld — sonst schliesst iOS beim Antippen die Tastatur. */
  function keepComposerFocus(event: { preventDefault: () => void }) {
    event.preventDefault()
  }

  return (
    <div className={pickerRootClass(value)} ref={rootRef}>
      <button
        type="button"
        className={tileTriggerClass}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Modus: ${currentLabel}. Auswahl öffnen`}
        onPointerDown={preventIosBlurOnlyTapWhenChatInputFocused}
        onClick={() => setOpen((prev) => !prev)}
      >
        <MaskIcon
          src={currentIcon.src}
          color={currentIcon.color}
          className="chat-model-picker-trigger-icon"
        />
        <span className="chat-model-picker-label">{currentLabel}</span>
        <span className="chat-model-picker-chevron" aria-hidden />
      </button>
      <PopoverMenu
        open={open}
        onClose={close}
        direction="up"
        anchorRef={rootRef}
        ariaLabel="Modus und Modell wählen"
        className="chat-model-picker-dropdown"
      >
        {/* Nur die Listen scrollen — das Untermenü der Websuche ragt seitlich aus dem Menü heraus
            und würde in einem scrollenden Bereich abgeschnitten. */}
        <div className="chat-model-picker-options">
          {CHAT_THINKING_MODE_OPTIONS.map((option) => (
            <MenuRadioItem
              key={option.id}
              checked={value === option.id}
              iconSrc={stratonIconSrc}
              className="chat-model-picker-item"
              onMouseDown={keepComposerFocus}
              onClick={() => pick(option.id)}
            >
              {option.label}
            </MenuRadioItem>
          ))}

          <div className="chat-model-picker-group-label" aria-hidden="true">
            Modell
          </div>
          {CHAT_COMPOSER_MODELS.map((option) => {
            const isBlocked = blockedModelIds.includes(option.id)
            const icon = modelIcon(option)
            return (
              <MenuRadioItem
                key={option.id}
                checked={value === option.id}
                disabled={isBlocked}
                iconSrc={icon.src}
                iconColor={icon.color}
                className="chat-model-picker-item"
                title={isBlocked ? 'In deinem Abo nicht verfügbar' : undefined}
                onMouseDown={keepComposerFocus}
                onClick={() => pick(option.id)}
              >
                {option.label}
              </MenuRadioItem>
            )
          })}
        </div>

        <div className="chat-model-picker-separator" role="separator" />
        <PopoverSubmenu
          label="Web-Suche"
          value={getChatWebSearchModeShortLabel(webSearchMode)}
          iconSrc={webIconSrc}
          ariaLabel="Web-Suche steuern"
          className="chat-model-picker-web-search"
        >
          {CHAT_WEB_SEARCH_MODE_OPTIONS.map((option) => (
            <MenuRadioItem
              key={option.id}
              checked={option.id === webSearchMode}
              onMouseDown={keepComposerFocus}
              onClick={() => {
                onWebSearchModeChange(option.id)
                setOpen(false)
              }}
            >
              {option.label}
            </MenuRadioItem>
          ))}
        </PopoverSubmenu>
      </PopoverMenu>
    </div>
  )
}
