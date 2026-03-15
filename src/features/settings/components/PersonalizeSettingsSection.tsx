import type { CSSProperties } from 'react'
import { ACCENT_PALETTES } from '../constants/accentPalettes'
import { HOVER_PALETTES } from '../constants/hoverPalettes'
import { MESSAGE_BOX_PALETTES } from '../constants/messageBoxPalettes'

type PersonalizeSettingsSectionProps = {
  themeMode: 'light' | 'dark' | 'pink-glass'
  sidebarScale: '100' | '75'
  accentPaletteId: string
  hoverPaletteId: string
  messageBoxPaletteId: string
  onChangeThemeMode: (nextThemeMode: 'light' | 'dark' | 'pink-glass') => void
  onChangeSidebarScale: (nextScale: '100' | '75') => void
  onChangeAccentPalette: (nextPaletteId: string) => void
  onChangeHoverPalette: (nextPaletteId: string) => void
  onChangeMessageBoxPalette: (nextPaletteId: string) => void
}

export function PersonalizeSettingsSection({
  themeMode,
  sidebarScale,
  accentPaletteId,
  hoverPaletteId,
  messageBoxPaletteId,
  onChangeThemeMode,
  onChangeSidebarScale,
  onChangeAccentPalette,
  onChangeHoverPalette,
  onChangeMessageBoxPalette,
}: PersonalizeSettingsSectionProps) {
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
        </div>
      </div>
      <div className="settings-section-divider" />
      <div className="personalize-scale-row">
        <p className="personalize-subtitle">Skalierung der Sidebar-Buttons</p>
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
            100%
          </button>
          <button
            type="button"
            className={`personalize-scale-option ${sidebarScale === '75' ? 'is-active' : ''}`}
            onClick={() => onChangeSidebarScale('75')}
          >
            75%
          </button>
        </div>
      </div>
      <div className="settings-section-divider" />
      <div className="personalize-accent-row">
        <p className="personalize-subtitle">Akzentfarbe</p>
        <div className="personalize-accent-grid" role="radiogroup" aria-label="Akzentfarbe auswählen">
          {ACCENT_PALETTES.map((palette) => (
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
              <span className="personalize-accent-preview" style={{ backgroundImage: palette.gradient }} />
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
    </div>
  )
}
