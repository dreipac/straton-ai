import type { CSSProperties } from 'react'
import { ACCENT_PALETTES } from '../constants/accentPalettes'
import { HOVER_PALETTES } from '../constants/hoverPalettes'
import type { LearnPathTitleColorMode } from '../constants/learnPathTitleColor'
import { MESSAGE_BOX_PALETTES } from '../constants/messageBoxPalettes'
import type { ChatBackgroundMode, ThemeMode } from '../uiSettings'

type PersonalizeSettingsSectionProps = {
  themeMode: ThemeMode
  sidebarScale: '100' | '75'
  chatBackground: ChatBackgroundMode
  accentPaletteId: string
  hoverPaletteId: string
  messageBoxPaletteId: string
  learnPathTitleColorMode: LearnPathTitleColorMode
  onChangeThemeMode: (nextThemeMode: ThemeMode) => void
  onChangeSidebarScale: (nextScale: '100' | '75') => void
  onChangeChatBackground: (nextMode: ChatBackgroundMode) => void
  onChangeAccentPalette: (nextPaletteId: string) => void
  onChangeHoverPalette: (nextPaletteId: string) => void
  onChangeMessageBoxPalette: (nextPaletteId: string) => void
  onChangeLearnPathTitleColorMode: (nextMode: LearnPathTitleColorMode) => void
  showSidebarScaleOption?: boolean
}

export function PersonalizeSettingsSection({
  themeMode,
  sidebarScale,
  chatBackground,
  accentPaletteId,
  hoverPaletteId,
  messageBoxPaletteId,
  learnPathTitleColorMode,
  onChangeThemeMode,
  onChangeSidebarScale,
  onChangeChatBackground,
  onChangeAccentPalette,
  onChangeHoverPalette,
  onChangeMessageBoxPalette,
  onChangeLearnPathTitleColorMode,
  showSidebarScaleOption = true,
}: PersonalizeSettingsSectionProps) {
  const gradientAccents = ACCENT_PALETTES.filter((palette) => !palette.id.startsWith('solid-'))
  const solidAccents = ACCENT_PALETTES.filter((palette) => palette.id.startsWith('solid-'))

  return (
    <div className="personalize-panel">
      <div className="personalize-theme-row">
        <p className="personalize-subtitle">Theme</p>
        <div className="personalize-theme-grid" role="radiogroup" aria-label="Theme auswählen">
          <button
            type="button"
            className={`personalize-theme-tile ${themeMode === 'light' ? 'is-active' : ''}`}
            onClick={() => onChangeThemeMode('light')}
            role="radio"
            aria-checked={themeMode === 'light'}
          >
            <span className="personalize-theme-preview is-light" />
            <span>White</span>
          </button>
          <button
            type="button"
            className={`personalize-theme-tile ${themeMode === 'dark' ? 'is-active' : ''}`}
            onClick={() => onChangeThemeMode('dark')}
            role="radio"
            aria-checked={themeMode === 'dark'}
          >
            <span className="personalize-theme-preview is-dark" />
            <span>Dark</span>
          </button>
          <button
            type="button"
            className={`personalize-theme-tile ${themeMode === 'pink-glass' ? 'is-active' : ''}`}
            onClick={() => onChangeThemeMode('pink-glass')}
            role="radio"
            aria-checked={themeMode === 'pink-glass'}
          >
            <span className="personalize-theme-preview is-pink-glass" />
            <span>Pink Glass</span>
          </button>
          <button
            type="button"
            className={`personalize-theme-tile ${themeMode === 'black' ? 'is-active' : ''}`}
            onClick={() => onChangeThemeMode('black')}
            role="radio"
            aria-checked={themeMode === 'black'}
          >
            <span className="personalize-theme-preview is-black" />
            <span>Black</span>
          </button>
        </div>
      </div>
      {showSidebarScaleOption ? (
        <>
          <div className="settings-section-divider" />
          <div className="personalize-scale-row">
            <p className="personalize-subtitle">Skalierung der Sidebar-Buttons</p>
            <p className="personalize-hint">100% = kompakt, 150% = größer.</p>
            <div
              className={`personalize-scale-toggle ${sidebarScale === '75' ? 'is-75' : 'is-100'}`}
              role="group"
              aria-label="Sidebar Skalierung"
            >
              <span className="personalize-scale-pill" aria-hidden="true" />
              <button
                type="button"
                className={`personalize-scale-option ${sidebarScale === '100' ? 'is-active' : ''}`}
                onClick={() => onChangeSidebarScale('100')}
              >
                150%
              </button>
              <button
                type="button"
                className={`personalize-scale-option ${sidebarScale === '75' ? 'is-active' : ''}`}
                onClick={() => onChangeSidebarScale('75')}
              >
                100%
              </button>
            </div>
          </div>
          <div className="settings-section-divider" />
        </>
      ) : (
        <div className="settings-section-divider" />
      )}
      <div className="personalize-theme-row">
        <p className="personalize-subtitle">Chat Hintergrund</p>
        <div className="personalize-theme-grid" role="radiogroup" aria-label="Chat Hintergrund auswählen">
          <button
            type="button"
            className={`personalize-theme-tile ${chatBackground === 'space-dark' ? 'is-active' : ''}`}
            onClick={() => onChangeChatBackground('space-dark')}
            role="radio"
            aria-checked={chatBackground === 'space-dark'}
          >
            <span className="personalize-theme-preview is-space-dark" />
            <span>Weltall dunkel</span>
          </button>
          <button
            type="button"
            className={`personalize-theme-tile ${chatBackground === 'space-stars' ? 'is-active' : ''}`}
            onClick={() => onChangeChatBackground('space-stars')}
            role="radio"
            aria-checked={chatBackground === 'space-stars'}
          >
            <span className="personalize-theme-preview is-space-stars" />
            <span>Weltall Sterne</span>
          </button>
        </div>
      </div>
      <div className="settings-section-divider" />
      <div className="personalize-accent-row">
        <p className="personalize-subtitle">Akzentfarbe</p>
        <p className="personalize-accent-subtitle">Verläufe</p>
        <div className="personalize-accent-grid" role="radiogroup" aria-label="Akzentfarbe Verlauf auswählen">
          {gradientAccents.map((palette) => (
            <button
              key={palette.id}
              type="button"
              className={`personalize-accent-tile ${accentPaletteId === palette.id ? 'is-active' : ''}`}
              onClick={() => onChangeAccentPalette(palette.id)}
              style={{ '--tile-gradient': palette.gradient } as CSSProperties}
              role="radio"
              aria-checked={accentPaletteId === palette.id}
              aria-label={palette.label}
              title={palette.label}
            >
              <span className="personalize-accent-preview" style={{ background: palette.gradient }} />
            </button>
          ))}
        </div>
        <p className="personalize-accent-subtitle">Vollfarben</p>
        <div className="personalize-accent-grid" role="radiogroup" aria-label="Akzentfarbe Vollfarbe auswählen">
          {solidAccents.map((palette) => (
            <button
              key={palette.id}
              type="button"
              className={`personalize-accent-tile ${accentPaletteId === palette.id ? 'is-active' : ''}`}
              onClick={() => onChangeAccentPalette(palette.id)}
              style={{ '--tile-gradient': palette.gradient } as CSSProperties}
              role="radio"
              aria-checked={accentPaletteId === palette.id}
              aria-label={palette.label}
              title={palette.label}
            >
              <span className="personalize-accent-preview" style={{ background: palette.gradient }} />
            </button>
          ))}
        </div>
      </div>
      <div className="settings-section-divider" />
      <div className="personalize-hover-row">
        <p className="personalize-subtitle">Hover Farbton</p>
        <div className="personalize-hover-grid" role="radiogroup" aria-label="Hover Farbton auswählen">
          {HOVER_PALETTES.map((palette) => (
            <button
              key={palette.id}
              type="button"
              className={`personalize-hover-tile ${hoverPaletteId === palette.id ? 'is-active' : ''}`}
              onClick={() => onChangeHoverPalette(palette.id)}
              style={{ '--tile-gradient': palette.preview } as CSSProperties}
              role="radio"
              aria-checked={hoverPaletteId === palette.id}
              aria-label={palette.label}
              title={palette.label}
            >
              <span className="personalize-hover-preview" style={{ backgroundImage: palette.preview }} />
            </button>
          ))}
        </div>
      </div>
      <div className="settings-section-divider" />
      <div className="personalize-message-row">
        <p className="personalize-subtitle">Message Box Farbton</p>
        <div className="personalize-message-grid" role="radiogroup" aria-label="Message Box Farbton auswählen">
          {MESSAGE_BOX_PALETTES.map((palette) => (
            <button
              key={palette.id}
              type="button"
              className={`personalize-message-tile ${messageBoxPaletteId === palette.id ? 'is-active' : ''}`}
              onClick={() => onChangeMessageBoxPalette(palette.id)}
              style={{ '--tile-gradient': palette.preview } as CSSProperties}
              role="radio"
              aria-checked={messageBoxPaletteId === palette.id}
              aria-label={palette.label}
              title={palette.label}
            >
              <span className="personalize-message-preview" style={{ backgroundImage: palette.preview }} />
            </button>
          ))}
        </div>
      </div>
      <div className="settings-section-divider" />
      <div className="personalize-scale-row">
        <p className="personalize-subtitle">Lernpfad-Titel</p>
        <p className="personalize-hint">Farbe des Titels im Lernbereich (neben dem Symbol).</p>
        <div
          className={`personalize-scale-toggle ${learnPathTitleColorMode === 'accent' ? 'is-75' : ''}`}
          role="group"
          aria-label="Lernpfad-Titel Farbe"
        >
          <span className="personalize-scale-pill" aria-hidden="true" />
          <button
            type="button"
            className={`personalize-scale-option ${learnPathTitleColorMode === 'neutral' ? 'is-active' : ''}`}
            onClick={() => onChangeLearnPathTitleColorMode('neutral')}
          >
            Neutral
          </button>
          <button
            type="button"
            className={`personalize-scale-option ${learnPathTitleColorMode === 'accent' ? 'is-active' : ''}`}
            onClick={() => onChangeLearnPathTitleColorMode('accent')}
          >
            Akzent
          </button>
        </div>
      </div>
    </div>
  )
}
