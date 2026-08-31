import type { ReactNode } from 'react'
import { ACCENT_PALETTES, type AccentPalette } from '../constants/accentPalettes'
import type { ChatBackgroundMode, ThemeMode } from '../constants/uiSettings'

/**
 * Miniatur des App-Layouts als Vorschau: Schiene links, Chatfläche rechts, alles nur als Skelett
 * ohne Inhalte. Wird für Theme-, Chat-Hintergrund-, Sidebar-Skalierungs- und Composer-Kacheln
 * genutzt, damit alle Reihen gleich aussehen. Die Farben kommen aus den `--pv-*`-Tokens, die
 * `.personalize-theme-preview` pro Variante setzt (settings.css) — sie müssen fest hinterlegt sein,
 * weil eine Kachel die Theme- bzw. Hintergrund-Variante zeigt, die gerade *nicht* aktiv ist. Einzige
 * Ausnahme ist der Akzent: der ist unabhängig von Theme/Hintergrund und wird live aus
 * `--accent-gradient` gezogen.
 *
 * `railScale`: nur für die Sidebar-Skalierungs-Kacheln — das Bild bleibt gleich gross, es wird nur
 * die Schiene (Logo + Nav-Linien) innerhalb vergrössert, exakt das, was die Einstellung bewirkt.
 *
 * `composerStyle`: nur für die Kompaktes-Eingabefeld-Kacheln — `'compact'` zeigt Anhang | Pill-
 * Eingabe | Senden dicht gruppiert statt der einfachen vollen Composer-Leiste.
 */
function LayoutSkeletonPreview({
  variant,
  railScale,
  composerStyle,
}: {
  variant: ThemeMode | ChatBackgroundMode
  railScale?: '100' | '75'
  composerStyle?: 'compact'
}) {
  const railScaleClass = railScale ? ` is-rail-${railScale}` : ''
  return (
    <span
      className={`personalize-theme-preview personalize-theme-preview--skeleton is-${variant}${railScaleClass}`}
      aria-hidden="true"
    >
      <span className="personalize-theme-preview-rail">
        <span className="personalize-theme-preview-logo" />
        <span className="personalize-theme-preview-nav is-accent" />
        <span className="personalize-theme-preview-nav" />
        <span className="personalize-theme-preview-nav is-short" />
      </span>
      <span className="personalize-theme-preview-main">
        <span className="personalize-theme-preview-topbar" />
        <span className="personalize-theme-preview-thread">
          <span className="personalize-theme-preview-bubble is-assistant" />
          <span className="personalize-theme-preview-bubble is-user" />
        </span>
        {composerStyle === 'compact' ? (
          <span className="personalize-theme-preview-composer is-compact">
            <span className="personalize-theme-preview-composer-attach" />
            <span className="personalize-theme-preview-composer-pill" />
            <span className="personalize-theme-preview-composer-send" />
          </span>
        ) : (
          <span className="personalize-theme-preview-composer" />
        )}
      </span>
    </span>
  )
}

/**
 * Auswahlkachel mit Vorschau, Radio-Kreis und linksbündigem Titel. Der Kreis füllt sich beim
 * Aktivwerden und zeichnet den Haken nach (Animation in settings.css). Wird von den Theme- und
 * den Chat-Hintergrund-Kacheln gemeinsam genutzt, damit beide Reihen gleich aussehen.
 */
function PreviewOptionTile({
  preview,
  label,
  isActive,
  onSelect,
}: {
  preview: ReactNode
  label: string
  isActive: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`personalize-theme-tile ${isActive ? 'is-active' : ''}`}
      onClick={onSelect}
      role="radio"
      aria-checked={isActive}
    >
      {preview}
      <span className="personalize-theme-tile-label">
        <span className="personalize-theme-radio" aria-hidden="true">
          <svg className="personalize-theme-radio-check" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12.5 9.5 17 19 7.5" />
          </svg>
        </span>
        {label}
      </span>
    </button>
  )
}

/**
 * Akzentfarbe als Punkt: Farbe im Kreis, Name darunter. Aktiv = akzentfarbener Ring direkt am
 * Kreis (ohne Abstand) plus ein Haken-Badge auf dem Ring — derselbe Haken wie bei den
 * Theme-Kacheln (`.personalize-theme-radio-check`), nur als eigenständiges Badge statt inline.
 */
function AccentSwatch({
  palette,
  isActive,
  onSelect,
}: {
  palette: AccentPalette
  isActive: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`personalize-accent-swatch ${isActive ? 'is-active' : ''}`}
      onClick={onSelect}
      role="radio"
      aria-checked={isActive}
      aria-label={palette.label}
    >
      <span className="personalize-accent-dot" style={{ background: palette.gradient }}>
        <span className="personalize-accent-badge" aria-hidden="true">
          <svg className="personalize-accent-badge-check" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12.5 9.5 17 19 7.5" />
          </svg>
        </span>
      </span>
      <span className="personalize-accent-name">{palette.label}</span>
    </button>
  )
}

type PersonalizeSettingsSectionProps = {
  themeMode: ThemeMode
  sidebarScale: '100' | '75'
  chatBackground: ChatBackgroundMode
  accentPaletteId: string
  mobileComposerCompact: boolean
  onChangeThemeMode: (nextThemeMode: ThemeMode) => void
  onChangeSidebarScale: (nextScale: '100' | '75') => void
  onChangeChatBackground: (nextMode: ChatBackgroundMode) => void
  onChangeAccentPalette: (nextPaletteId: string) => void
  onChangeMobileComposerCompact: (nextCompact: boolean) => void
  showSidebarScaleOption?: boolean
}

export function PersonalizeSettingsSection({
  themeMode,
  sidebarScale,
  chatBackground,
  accentPaletteId,
  mobileComposerCompact,
  onChangeThemeMode,
  onChangeSidebarScale,
  onChangeChatBackground,
  onChangeAccentPalette,
  onChangeMobileComposerCompact,
  showSidebarScaleOption = true,
}: PersonalizeSettingsSectionProps) {
  const gradientAccents = ACCENT_PALETTES.filter((palette) => !palette.id.startsWith('solid-'))
  const solidAccents = ACCENT_PALETTES.filter((palette) => palette.id.startsWith('solid-'))

  return (
    <div className="personalize-panel">
      <div className="personalize-theme-row">
        <p className="personalize-subtitle">Theme</p>
        <div className="personalize-theme-grid" role="radiogroup" aria-label="Theme auswählen">
          {(
            [
              ['light', 'White'],
              ['dark', 'Dark'],
              ['pink-glass', 'Pink Glass'],
              ['black', 'Black'],
            ] as [ThemeMode, string][]
          ).map(([variant, label]) => (
            <PreviewOptionTile
              key={variant}
              preview={<LayoutSkeletonPreview variant={variant} />}
              label={label}
              isActive={themeMode === variant}
              onSelect={() => onChangeThemeMode(variant)}
            />
          ))}
        </div>
      </div>
      {showSidebarScaleOption ? (
        <>
          <div className="settings-section-divider" />
          <div className="personalize-theme-row">
            <p className="personalize-subtitle">Skalierung</p>
            <div className="personalize-theme-grid" role="radiogroup" aria-label="Sidebar Skalierung auswählen">
              {(
                [
                  ['75', 'Normal'],
                  ['100', 'Gross'],
                ] as ['100' | '75', string][]
              ).map(([scale, label]) => (
                <PreviewOptionTile
                  key={scale}
                  preview={<LayoutSkeletonPreview variant={themeMode} railScale={scale} />}
                  label={label}
                  isActive={sidebarScale === scale}
                  onSelect={() => onChangeSidebarScale(scale)}
                />
              ))}
            </div>
          </div>
          <div className="settings-section-divider" />
        </>
      ) : (
        <div className="settings-section-divider" />
      )}
      {themeMode !== 'light' ? (
        <>
          <div className="personalize-theme-row">
            <p className="personalize-subtitle">Chat Hintergrund</p>
            <div className="personalize-theme-grid" role="radiogroup" aria-label="Chat Hintergrund auswählen">
              {(
                [
                  ['space-dark', 'Schlicht'],
                  ['space-stars', 'Sterne'],
                ] as [ChatBackgroundMode, string][]
              ).map(([variant, label]) => (
                <PreviewOptionTile
                  key={variant}
                  preview={<LayoutSkeletonPreview variant={variant} />}
                  label={label}
                  isActive={chatBackground === variant}
                  onSelect={() => onChangeChatBackground(variant)}
                />
              ))}
            </div>
          </div>
          <div className="settings-section-divider" />
        </>
      ) : null}
      <div className="personalize-theme-row">
        <p className="personalize-subtitle">Kompaktes Eingabefeld</p>
        <div className="personalize-theme-grid" role="radiogroup" aria-label="Kompaktes Eingabefeld auswählen">
          {(
            [
              [false, 'Standard'],
              [true, 'Kompakt'],
            ] as [boolean, string][]
          ).map(([compact, label]) => (
            <PreviewOptionTile
              key={String(compact)}
              preview={<LayoutSkeletonPreview variant={themeMode} composerStyle={compact ? 'compact' : undefined} />}
              label={label}
              isActive={mobileComposerCompact === compact}
              onSelect={() => onChangeMobileComposerCompact(compact)}
            />
          ))}
        </div>
      </div>
      <div className="settings-section-divider" />
      <div className="personalize-accent-row">
        <p className="personalize-subtitle">Akzentfarbe</p>
        <p className="personalize-accent-subtitle">Vollfarben</p>
        <div className="personalize-accent-grid" role="radiogroup" aria-label="Akzentfarbe Vollfarbe auswählen">
          {solidAccents.map((palette) => (
            <AccentSwatch
              key={palette.id}
              palette={palette}
              isActive={accentPaletteId === palette.id}
              onSelect={() => onChangeAccentPalette(palette.id)}
            />
          ))}
        </div>
        <p className="personalize-accent-subtitle">Spezial</p>
        <div className="personalize-accent-grid" role="radiogroup" aria-label="Akzentfarbe Verlauf auswählen">
          {gradientAccents.map((palette) => (
            <AccentSwatch
              key={palette.id}
              palette={palette}
              isActive={accentPaletteId === palette.id}
              onSelect={() => onChangeAccentPalette(palette.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
