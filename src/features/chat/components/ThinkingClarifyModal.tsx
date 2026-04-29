import { useEffect, useId, useState } from 'react'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'
import {
  THINKING_CUSTOM_OPTION_ID,
  type ThinkingClarifyPayload,
} from '../utils/thinkingClarify'

export type ThinkingClarifyModalProps = {
  payload: ThinkingClarifyPayload
  introMarkdown?: string
  onSubmit: (answerText: string) => void
  onDismiss: () => void
}

/** Einblendung über der Message Box: Multiple Choice + feste Option „Eigene Antwort“. */
export function ThinkingClarifyModal({
  payload,
  introMarkdown,
  onSubmit,
  onDismiss,
}: ThinkingClarifyModalProps) {
  const headingId = useId()
  const optionsWithCustom = [
    ...payload.options.map((o) => ({ id: o.id, label: o.label, isCustom: false as const })),
    { id: THINKING_CUSTOM_OPTION_ID, label: 'Eigene Antwort', isCustom: true as const },
  ]
  const [selectedId, setSelectedId] = useState<string>(() => optionsWithCustom[0]?.id ?? '')
  const [customText, setCustomText] = useState('')
  /** Kurzzusatz bei gewählter MC-Option (nicht bei „Eigene Antwort“). */
  const [supplementNote, setSupplementNote] = useState('')

  const selected = optionsWithCustom.find((o) => o.id === selectedId)
  const needsCustomText = selected?.isCustom === true
  const canSubmit =
    Boolean(selected) && (!needsCustomText || customText.trim().length > 0)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onDismiss()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  function handleSubmit() {
    if (!selected || !canSubmit) {
      return
    }
    if (selected.isCustom) {
      onSubmit(customText.trim())
      return
    }
    const sup = supplementNote.trim()
    const base = selected.label
    onSubmit(sup ? `${base}\n\n${sup}` : base)
  }

  return (
    <aside
      className="chat-thinking-clarify-sheet"
      role="region"
      aria-labelledby={headingId}
    >
      <div className="chat-thinking-clarify-sheet-inner">
        {introMarkdown?.trim() ? (
          <p className="chat-thinking-clarify-intro">{introMarkdown.trim()}</p>
        ) : null}
        <h2 id={headingId} className="chat-thinking-clarify-title">
          {payload.prompt}
        </h2>
        <div className="chat-thinking-clarify-options" role="radiogroup" aria-label="Antwort wählen">
          {optionsWithCustom.map((opt, idx) => {
            const inputId = `${headingId}-opt-${idx}`
            return (
              <label key={opt.id} className="chat-thinking-clarify-option" htmlFor={inputId}>
                <input
                  id={inputId}
                  type="radio"
                  name="thinking-clarify"
                  value={opt.id}
                  checked={selectedId === opt.id}
                  onChange={() => setSelectedId(opt.id)}
                />
                <span>{opt.label}</span>
              </label>
            )
          })}
        </div>
        {!needsCustomText ? (
          <div className="chat-thinking-clarify-supplement">
            <label className="chat-thinking-clarify-supplement-label" htmlFor={`${headingId}-sup`}>
              Optional kurz ergänzen
            </label>
            <textarea
              id={`${headingId}-sup`}
              className="chat-thinking-clarify-custom chat-thinking-clarify-supplement-input"
              value={supplementNote}
              onChange={(e) => setSupplementNote(e.target.value)}
              placeholder="Zusatz-Details, falls nötig …"
              rows={2}
            />
          </div>
        ) : null}
        {needsCustomText ? (
          <textarea
            className="chat-thinking-clarify-custom"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Deine eigene Antwort…"
            rows={3}
            aria-label="Eigene Antwort"
          />
        ) : null}
        <div className="chat-thinking-clarify-actions">
          <SecondaryButton type="button" onClick={() => onDismiss()}>
            Später
          </SecondaryButton>
          <PrimaryButton type="button" disabled={!canSubmit} onClick={() => handleSubmit()}>
            Antwort senden
          </PrimaryButton>
        </div>
      </div>
    </aside>
  )
}
