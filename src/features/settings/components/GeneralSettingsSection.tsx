import { useCallback, useRef, useState } from 'react'
import { MenuItem } from '../../../components/ui/menu/MenuItem'
import { PopoverMenu } from '../../../components/ui/menu/PopoverMenu'
import type { SettingsLanguage } from '../constants/settingsLanguage'

type LanguageOption = {
  id: SettingsLanguage
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

type GeneralSettingsSectionProps = {
  language: SettingsLanguage
  onChangeLanguage: (nextLanguage: SettingsLanguage) => void | Promise<void>
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

export function GeneralSettingsSection({
  language,
  onChangeLanguage,
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
    inlineLabel:
      language === 'en'
        ? 'Display language'
        : language === 'hr'
          ? 'Jezik prikaza'
          : language === 'it'
            ? 'Lingua di visualizzazione'
            : language === 'sq'
              ? 'Gjuha e shfaqjes'
              : language === 'es-PE'
                ? 'Idioma de visualización'
                : 'Anzeigesprache',
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
  }

  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false)
  /* Umschliesst Auslöser und Menü — `PopoverMenu` erkennt daran Klicks, die nicht schliessen sollen. */
  const languageMenuRef = useRef<HTMLDivElement | null>(null)
  const closeLanguageMenu = useCallback(() => setIsLanguageMenuOpen(false), [])

  const selectedLanguageLabel = LANGUAGE_OPTIONS.find((option) => option.id === language)?.label ?? 'Deutsch'

  return (
    <div className="general-settings-panel">
      <h2 className="general-section-title general-section-title--plain">{i18n.title}</h2>

      <div className="settings-section-divider" />

      <div className="setting-row">
        <span className="setting-row-label setting-row-label--plain">{i18n.inlineLabel}</span>

        <div ref={languageMenuRef} className="setting-row-control">
          <button
            type="button"
            className="general-language-trigger general-language-trigger--plain"
            onClick={() => setIsLanguageMenuOpen((prev) => !prev)}
            aria-haspopup="menu"
            aria-expanded={isLanguageMenuOpen}
          >
            {selectedLanguageLabel}
            <svg
              className={`general-language-trigger-chevron${isLanguageMenuOpen ? ' is-open' : ''}`}
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <PopoverMenu
            open={isLanguageMenuOpen}
            onClose={closeLanguageMenu}
            align="end"
            anchorRef={languageMenuRef}
            ariaLabel={i18n.inlineLabel}
            className="general-language-menu"
          >
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
          </PopoverMenu>
        </div>
      </div>

      <div className="general-section-gap" />

      <h2 className="general-section-title general-section-title--plain">Daten &amp; Verlauf</h2>

      <div className="settings-section-divider" />

      <div className="setting-row">
        <span className="setting-row-label setting-row-label--stacked">
          <span className="setting-row-label-title">Auto löschen von leeren Chats</span>
          <span className="setting-row-label-desc">Leere Chats werden automatisch gelöscht.</span>
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

      <div className="setting-row-divider" />

      <div className="setting-row">
        <span className="setting-row-label setting-row-label--stacked">
          <span className="setting-row-label-title">Auto löschen von leeren Lernpfaden</span>
          <span className="setting-row-label-desc">Leere Lernpfade werden automatisch gelöscht.</span>
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

      <div className="setting-row-divider" />

      <div className="setting-row">
        <span className="setting-row-label setting-row-label--stacked">
          <span className="setting-row-label-title">Leere Chats löschen</span>
          {chatCleanupInfo ? (
            <span className="setting-row-label-desc setting-row-label-desc--success">
              {chatCleanupInfo}
            </span>
          ) : null}
        </span>
        <div className="setting-row-control">
          <button
            type="button"
            className="general-language-trigger general-language-trigger--plain"
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
  )
}
