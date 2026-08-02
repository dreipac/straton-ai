import { useEffect, useRef, useState } from 'react'
import { ContextMenu } from '../../../components/ui/menu/ContextMenu'
import { MenuItem } from '../../../components/ui/menu/MenuItem'

type LanguageOption = {
  id: 'de' | 'en' | 'hr' | 'it' | 'sq' | 'es-PE'
  label: string
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { id: 'de', label: 'Deutsch' },
  { id: 'en', label: 'English' },
  { id: 'hr', label: 'Hrvatski' },
  { id: 'it', label: 'Italiano' },
  { id: 'sq', label: 'Shqip' },
  { id: 'es-PE', label: 'Español (Perú)' },
]

type FontOption = {
  id: string
  label: string
  /** Alle im Projekt installierten Fonts (siehe main.tsx / fonts.css) — Menüeintrag rendert im
   *  jeweils eigenen Font, damit man die Wahl direkt sieht. */
  fontFamily: string
}

const FONT_OPTIONS: FontOption[] = [
  { id: 'manrope', label: 'Manrope', fontFamily: "'Manrope Variable', sans-serif" },
  { id: 'plus-jakarta-sans', label: 'Plus Jakarta Sans', fontFamily: "'Plus Jakarta Sans Variable', sans-serif" },
  { id: 'roboto', label: 'Roboto', fontFamily: "'Roboto', sans-serif" },
  { id: 'satoshi', label: 'Satoshi', fontFamily: "'Satoshi Variable', 'Manrope Variable', sans-serif" },
]

/** Öffnungs-Zustand + Outside-Click-Schließen für ein Dropdown — von Sprache/System/KI-Output geteilt. */
function useDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!isOpen) {
        return
      }

      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (!(ref.current?.contains(target) ?? false)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [isOpen])

  return { isOpen, setIsOpen, ref }
}

type SettingsLanguage = 'de' | 'en' | 'hr' | 'it' | 'sq' | 'es-PE'

type GeneralSettingsSectionProps = {
  language: SettingsLanguage
  onChangeLanguage: (nextLanguage: SettingsLanguage) => void | Promise<void>
  assistantEmojisEnabled: boolean
  onToggleAssistantEmojis: () => void
  mobileComposerCompact: boolean
  onToggleMobileComposerCompact: () => void
  /** UI-Toggle dafür ist aktuell entfernt (siehe unten) — Feature/State bleibt im Code bestehen. */
  chatFoldersFeatureEnabled: boolean
  desktopFoldersInSidebar: boolean
  onToggleDesktopFoldersInSidebar: () => void
  autoRemoveEmptyChats: boolean
  isUpdatingChatSetting: boolean
  autoRemoveEmptyLearningPaths: boolean
  isUpdatingLearningPathSetting: boolean
  isCleaningEmptyChats: boolean
  chatCleanupInfo: string | null
  disableCleanup: boolean
  onToggleAutoRemoveEmptyChats: () => Promise<void>
  onToggleAutoRemoveEmptyLearningPaths: () => Promise<void>
  onCleanupEmptyChats: () => Promise<void>
}

function assistantEmojiCopy(language: SettingsLanguage): { title: string; body: string } {
  switch (language) {
    case 'en':
      return {
        title: 'Emojis in AI replies',
        body: 'Headings (##/###) include one emoji in the title; occasional emojis in the body.',
      }
    case 'hr':
      return {
        title: 'Emoji u odgovorima AI-a',
        body: 'Asistent povremeno koristi prikladne emoji.',
      }
    case 'it':
      return {
        title: 'Emoji nelle risposte IA',
        body: "L'assistente può usare di tanto in tanto emoji pertinenti al contesto.",
      }
    case 'sq':
      return {
        title: 'Emoji në përgjigjet e IA',
        body: 'Asistenti mund të përdorë herë pas here emoji të përshtatshme me kontekstin.',
      }
    case 'es-PE':
      return {
        title: 'Emojis en respuestas de IA',
        body: 'El asistente puede usar de vez en cuando emojis acordes al contexto.',
      }
    default:
      return {
        title: 'Emoji in KI-Antworten',
        body: 'Die KI verwendet Emojis beim Antworten',
      }
  }
}

export function GeneralSettingsSection({
  language,
  onChangeLanguage,
  assistantEmojisEnabled,
  onToggleAssistantEmojis,
  mobileComposerCompact,
  onToggleMobileComposerCompact,
  autoRemoveEmptyChats,
  isUpdatingChatSetting,
  autoRemoveEmptyLearningPaths,
  isUpdatingLearningPathSetting,
  isCleaningEmptyChats,
  chatCleanupInfo,
  disableCleanup,
  onToggleAutoRemoveEmptyChats,
  onToggleAutoRemoveEmptyLearningPaths,
  onCleanupEmptyChats,
}: GeneralSettingsSectionProps) {
  const i18n = {
    title: language === 'en' ? 'Language' : language === 'hr' ? 'Jezik' : 'Sprache',
    activeLabel:
      language === 'en'
        ? 'active'
        : language === 'hr'
          ? 'aktivno'
          : language === 'it'
            ? 'attivo'
            : language === 'sq'
              ? 'aktive'
              : language === 'es-PE'
                ? 'activo'
                : 'aktiv',
    fontsTitle:
      language === 'en'
        ? 'Fonts'
        : language === 'hr'
          ? 'Fontovi'
          : language === 'it'
            ? 'Font'
            : language === 'sq'
              ? 'Shkronjat'
              : language === 'es-PE'
                ? 'Fuentes'
                : 'Schriftarten',
    fontsSystemLabel:
      language === 'en'
        ? 'System'
        : language === 'hr'
          ? 'Sustav'
          : language === 'it'
            ? 'Sistema'
            : language === 'sq'
              ? 'Sistemi'
              : language === 'es-PE'
                ? 'Sistema'
                : 'System',
    fontsAiOutputLabel:
      language === 'en'
        ? 'AI output'
        : language === 'hr'
          ? 'AI izlaz'
          : language === 'it'
            ? 'Output IA'
            : language === 'sq'
              ? 'Dalja e AI'
              : language === 'es-PE'
                ? 'Salida de la IA'
                : 'KI-Output',
  }

  const {
    isOpen: isLanguageMenuOpen,
    setIsOpen: setIsLanguageMenuOpen,
    ref: languageMenuRef,
  } = useDropdown()
  const {
    isOpen: isSystemFontMenuOpen,
    setIsOpen: setIsSystemFontMenuOpen,
    ref: systemFontMenuRef,
  } = useDropdown()
  const {
    isOpen: isAiOutputFontMenuOpen,
    setIsOpen: setIsAiOutputFontMenuOpen,
    ref: aiOutputFontMenuRef,
  } = useDropdown()
  const [systemFontId, setSystemFontId] = useState<string>('manrope')
  const [aiOutputFontId, setAiOutputFontId] = useState<string>('manrope')

  const selectedLanguageLabel = LANGUAGE_OPTIONS.find((option) => option.id === language)?.label ?? 'Deutsch'
  const selectedSystemFontLabel =
    FONT_OPTIONS.find((option) => option.id === systemFontId)?.label ?? FONT_OPTIONS[0].label
  const selectedAiOutputFontLabel =
    FONT_OPTIONS.find((option) => option.id === aiOutputFontId)?.label ?? FONT_OPTIONS[0].label
  const emojiLabels = assistantEmojiCopy(language)

  return (
    <div className="general-settings-panel">
      <h2 className="general-section-title">{i18n.title}</h2>

      <div className="general-setting-bar squircle">
        <span className="general-setting-bar-label">{i18n.title}</span>

        <div ref={languageMenuRef} className="general-setting-control">
          <button
            type="button"
            className="general-language-trigger squircle"
            onClick={() => setIsLanguageMenuOpen((prev) => !prev)}
            aria-haspopup="menu"
            aria-expanded={isLanguageMenuOpen}
          >
            {selectedLanguageLabel}
          </button>

          {isLanguageMenuOpen ? (
            <ContextMenu className="general-language-menu">
              {LANGUAGE_OPTIONS.map((option) => (
                <MenuItem
                  key={option.id}
                  onClick={() => {
                    void onChangeLanguage(option.id)
                    setIsLanguageMenuOpen(false)
                  }}
                >
                  {option.label}
                  {option.id === language ? ` (${i18n.activeLabel})` : ''}
                </MenuItem>
              ))}
            </ContextMenu>
          ) : null}
        </div>
      </div>

      <h2 className="general-section-title">{i18n.fontsTitle}</h2>

      <div className="general-setting-bar general-setting-bar--stacked squircle">
        <div className="general-setting-bar-row">
          <span className="general-setting-bar-label">{i18n.fontsSystemLabel}</span>

          <div ref={systemFontMenuRef} className="general-setting-control">
            <button
              type="button"
              className="general-language-trigger squircle"
              onClick={() => setIsSystemFontMenuOpen((prev) => !prev)}
              aria-haspopup="menu"
              aria-expanded={isSystemFontMenuOpen}
            >
              {selectedSystemFontLabel}
            </button>

            {isSystemFontMenuOpen ? (
              <ContextMenu className="general-language-menu">
                {FONT_OPTIONS.map((option) => (
                  <MenuItem
                    key={option.id}
                    style={{ fontFamily: option.fontFamily }}
                    onClick={() => {
                      setSystemFontId(option.id)
                      setIsSystemFontMenuOpen(false)
                    }}
                  >
                    {option.label}
                    {option.id === systemFontId ? ` (${i18n.activeLabel})` : ''}
                  </MenuItem>
                ))}
              </ContextMenu>
            ) : null}
          </div>
        </div>

        <div className="general-setting-bar-divider" />

        <div className="general-setting-bar-row">
          <span className="general-setting-bar-label">{i18n.fontsAiOutputLabel}</span>

          <div ref={aiOutputFontMenuRef} className="general-setting-control">
            <button
              type="button"
              className="general-language-trigger squircle"
              onClick={() => setIsAiOutputFontMenuOpen((prev) => !prev)}
              aria-haspopup="menu"
              aria-expanded={isAiOutputFontMenuOpen}
            >
              {selectedAiOutputFontLabel}
            </button>

            {isAiOutputFontMenuOpen ? (
              <ContextMenu className="general-language-menu">
                {FONT_OPTIONS.map((option) => (
                  <MenuItem
                    key={option.id}
                    style={{ fontFamily: option.fontFamily }}
                    onClick={() => {
                      setAiOutputFontId(option.id)
                      setIsAiOutputFontMenuOpen(false)
                    }}
                  >
                    {option.label}
                    {option.id === aiOutputFontId ? ` (${i18n.activeLabel})` : ''}
                  </MenuItem>
                ))}
              </ContextMenu>
            ) : null}
          </div>
        </div>
      </div>

      <h2 className="general-section-title">Chat</h2>

      <div className="general-setting-bar general-setting-bar--stacked squircle">
        <div className="general-setting-bar-row">
          <span className="general-setting-bar-label general-setting-bar-label--stacked">
            <span className="general-setting-bar-label-title">{emojiLabels.title}</span>
            <span className="general-setting-bar-label-desc">{emojiLabels.body}</span>
          </span>
          <button
            type="button"
            className={`ios-switch ${assistantEmojisEnabled ? 'is-on' : ''}`}
            aria-label={
              language === 'en' ? 'Toggle emojis in AI replies' : 'Emoji in KI-Antworten umschalten'
            }
            aria-pressed={assistantEmojisEnabled}
            onClick={onToggleAssistantEmojis}
          >
            <span className="ios-switch-track" aria-hidden="true">
              <span className="ios-switch-thumb" />
            </span>
          </button>
        </div>

        <div className="general-setting-bar-divider" />

        <div className="general-setting-bar-row">
          <span className="general-setting-bar-label general-setting-bar-label--stacked">
            <span className="general-setting-bar-label-title">Kompaktes Eingabefeld</span>
            <span className="general-setting-bar-label-desc">Sorgt für eine kompaktere Chat-Oberfläche</span>
          </span>
          <button
            type="button"
            className={`ios-switch ${mobileComposerCompact ? 'is-on' : ''}`}
            aria-label="Kompaktes Eingabefeld umschalten"
            aria-pressed={mobileComposerCompact}
            onClick={onToggleMobileComposerCompact}
          >
            <span className="ios-switch-track" aria-hidden="true">
              <span className="ios-switch-thumb" />
            </span>
          </button>
        </div>
      </div>

      <h2 className="general-section-title">Löschen</h2>

      <div className="general-setting-bar general-setting-bar--stacked squircle">
        <div className="general-setting-bar-row">
          <span className="general-setting-bar-label general-setting-bar-label--stacked">
            <span className="general-setting-bar-label-title">Auto löschen von leeren Chats</span>
            <span className="general-setting-bar-label-desc">Leere Chats werden automatisch gelöscht.</span>
          </span>
          <button
            type="button"
            className={`ios-switch ${autoRemoveEmptyChats ? 'is-on' : ''}`}
            disabled={isUpdatingChatSetting}
            aria-label="Auto-Löschen bei leeren Chats umschalten"
            aria-pressed={autoRemoveEmptyChats}
            onClick={() => {
              void onToggleAutoRemoveEmptyChats()
            }}
          >
            <span className="ios-switch-track" aria-hidden="true">
              <span className="ios-switch-thumb" />
            </span>
          </button>
        </div>

        <div className="general-setting-bar-divider" />

        <div className="general-setting-bar-row">
          <span className="general-setting-bar-label general-setting-bar-label--stacked">
            <span className="general-setting-bar-label-title">Auto löschen von leeren Lernpfaden</span>
            <span className="general-setting-bar-label-desc">Leere Lernpfade werden automatisch gelöscht.</span>
          </span>
          <button
            type="button"
            className={`ios-switch ${autoRemoveEmptyLearningPaths ? 'is-on' : ''}`}
            disabled={isUpdatingLearningPathSetting}
            aria-label="Auto-Löschen bei leeren Lernpfaden umschalten"
            aria-pressed={autoRemoveEmptyLearningPaths}
            onClick={() => {
              void onToggleAutoRemoveEmptyLearningPaths()
            }}
          >
            <span className="ios-switch-track" aria-hidden="true">
              <span className="ios-switch-thumb" />
            </span>
          </button>
        </div>

        <div className="general-setting-bar-divider" />

        <div className="general-setting-bar-row">
          <span className="general-setting-bar-label general-setting-bar-label--stacked">
            <span className="general-setting-bar-label-title">Leere Chats löschen</span>
            {chatCleanupInfo ? (
              <span className="general-setting-bar-label-desc general-setting-bar-label-desc--success">
                {chatCleanupInfo}
              </span>
            ) : null}
          </span>
          <div className="general-setting-control">
            <button
              type="button"
              className="general-language-trigger squircle"
              disabled={disableCleanup || isCleaningEmptyChats}
              onClick={() => {
                void onCleanupEmptyChats()
              }}
            >
              {isCleaningEmptyChats ? 'Wird gelöscht …' : 'Löschen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
