import type { CSSProperties } from 'react'
import { ACCENT_PALETTES } from '../constants/accentPalettes'
import { HOVER_PALETTES } from '../constants/hoverPalettes'

type PersonalizeSettingsSectionProps = {
  themeMode: 'light' | 'dark'
  sidebarScale: '100' | '75'
  accentPaletteId: string
  hoverPaletteId: string
  onToggleTheme: () => void
  onChangeSidebarScale: (nextScale: '100' | '75') => void
  onChangeAccentPalette: (nextPaletteId: string) => void
  onChangeHoverPalette: (nextPaletteId: string) => void
}

export function PersonalizeSettingsSection({
  themeMode,
  sidebarScale,
  accentPaletteId,
  hoverPaletteId,
  onToggleTheme,
  onChangeSidebarScale,
  onChangeAccentPalette,
  onChangeHoverPalette,
}: PersonalizeSettingsSectionProps) {
  return (
    <div className="personalize-panel">
      <p className="personalize-subtitle">Wechsle zwischen White und Dark Mode fuer dein Interface.</p>
      <button type="button" className="personalize-theme-toggle" onClick={onToggleTheme}>
        {themeMode === 'light' ? 'Dark Mode aktivieren' : 'White Mode aktivieren'}
      </button>
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
    </div>
  )
}
