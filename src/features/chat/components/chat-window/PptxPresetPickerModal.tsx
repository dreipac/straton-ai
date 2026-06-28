import { PPTX_PRESET_DISPLAY, PPTX_PRESET_KEYS, type PptxPresetKey } from '../../constants/pptxExportPrompt'
import { PPTX_PRESET_SPECS } from '../../utils/pptxOutline'

type PptxPresetPickerModalProps = {
  open: boolean
  /** `pick`: vor einer Neugenerierung (kein aktuelles Preset). `switch`: "Design ändern" an einer bestehenden Präsentation — aktuelles Preset wird markiert. */
  mode: 'pick' | 'switch'
  currentPreset?: PptxPresetKey
  onConfirm: (preset: PptxPresetKey) => void
  onCancel: () => void
}

/** Mini-CSS-Vorschau einer Karte — dieselben Werte wie das echte Rendering (`PPTX_PRESET_SPECS`), kein zweites Farbschema. */
function PptxPresetCardSwatch({ preset }: { preset: PptxPresetKey }) {
  const spec = PPTX_PRESET_SPECS[preset]
  const isLight = spec.titleTreatment === 'editorial-light'
  return (
    <span
      className="chat-preset-picker-swatch"
      style={{
        background: `linear-gradient(135deg, ${spec.gradientFrom}, ${spec.gradientTo})`,
      }}
      aria-hidden="true"
    >
      <span
        className="chat-preset-picker-swatch-bar"
        style={{
          background: isLight ? spec.accent : spec.accentOnDark,
          opacity: isLight ? 1 : 0.85,
        }}
      />
      <span
        className="chat-preset-picker-swatch-bar chat-preset-picker-swatch-bar--short"
        style={{
          background: isLight ? spec.accent : spec.accentOnDark,
          opacity: isLight ? 0.55 : 0.45,
        }}
      />
    </span>
  )
}

export function PptxPresetPickerModal({
  open,
  mode,
  currentPreset,
  onConfirm,
  onCancel,
}: PptxPresetPickerModalProps) {
  return (
    <div
      className={`chat-slide-preview chat-preset-picker${open ? ' is-open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
      aria-label={mode === 'switch' ? 'Design ändern' : 'Design für die Präsentation wählen'}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('.chat-preset-picker-panel')) {
          return
        }
        onCancel()
      }}
    >
      <div className="chat-slide-preview-panel chat-preset-picker-panel">
        <header className="chat-slide-preview-header">
          <p className="chat-slide-preview-kicker">
            {mode === 'switch' ? 'Design ändern' : 'Design für deine Präsentation'}
          </p>
          <button type="button" className="chat-slide-preview-close" onClick={onCancel} aria-label="Schließen">
            ×
          </button>
        </header>
        <p className="chat-preset-picker-hint">
          {mode === 'switch'
            ? 'Wähle ein anderes Design — Inhalt und Folien bleiben unverändert.'
            : 'Wähle ein Design — der Inhalt wird danach passend dazu erstellt.'}
        </p>
        <div className="chat-preset-picker-grid">
          {PPTX_PRESET_KEYS.map((preset) => {
            const display = PPTX_PRESET_DISPLAY[preset]
            const isActive = preset === currentPreset
            return (
              <button
                key={preset}
                type="button"
                className={`chat-preset-picker-card${isActive ? ' is-active' : ''}`}
                onClick={() => onConfirm(preset)}
              >
                <PptxPresetCardSwatch preset={preset} />
                <span className="chat-preset-picker-card-label">{display.label}</span>
                <span className="chat-preset-picker-card-description">{display.description}</span>
                {isActive ? <span className="chat-preset-picker-card-active-badge">Aktuell</span> : null}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
