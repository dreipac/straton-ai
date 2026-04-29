import { useEffect, useId, useState } from 'react'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'

export type ThinkingClarifyFreeTextModalProps = {
  /** KI-Text (nur Anzeige) */
  previewText: string
  onSubmit: (answerText: string) => void
  onDismiss: () => void
}

/** Fallback ohne JSON-Block der KI: kurze freie Antwort in der Einblendung über der Eingabe. */
export function ThinkingClarifyFreeTextModal({
  previewText,
  onSubmit,
  onDismiss,
}: ThinkingClarifyFreeTextModalProps) {
  const titleId = useId()
  const [answer, setAnswer] = useState('')

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

  return (
    <aside className="chat-thinking-clarify-sheet" role="region" aria-labelledby={titleId}>
      <div className="chat-thinking-clarify-sheet-inner">
        <h2 id={titleId} className="chat-thinking-clarify-title">
          Rückfrage
        </h2>
        <p className="chat-thinking-fallback-preview">{previewText}</p>
        <label className="chat-thinking-fallback-label" htmlFor={`${titleId}-input`}>
          Deine Antwort (kurz)
        </label>
        <textarea
          id={`${titleId}-input`}
          className="chat-thinking-clarify-custom chat-thinking-fallback-input"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Hier tippen …"
          rows={4}
          autoComplete="off"
        />
        <div className="chat-thinking-clarify-actions">
          <SecondaryButton type="button" onClick={() => onDismiss()}>
            Später
          </SecondaryButton>
          <PrimaryButton
            type="button"
            disabled={!answer.trim()}
            onClick={() => onSubmit(answer.trim())}
          >
            Antwort senden
          </PrimaryButton>
        </div>
      </div>
    </aside>
  )
}
