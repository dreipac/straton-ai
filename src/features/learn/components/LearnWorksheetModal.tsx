import { useState } from 'react'
import { TextArea } from '../../../components/ui/inputs/TextArea'
import { ModalShell } from '../../../components/ui/modal/ModalShell'
import type { LearnWorksheetItem } from '../../chat/services/chat.service'

export type LearnWorksheetModalProps = {
  isMounted: boolean
  isVisible: boolean
  title: string
  items: LearnWorksheetItem[]
  isLoading: boolean
  error: string | null
  onClose: () => void
}

/** Entfernt führende Nummerierung von der KI (z. B. «1.» oder «2)»), damit nicht «1. 1. …» entsteht. */
function displayPrompt(raw: string): string {
  let t = raw.trim()
  for (let i = 0; i < 4; i += 1) {
    const next = t.replace(/^\s*\d+[.)]\s*/, '').trim()
    if (next === t) {
      break
    }
    t = next
  }
  return t
}

export function LearnWorksheetModal(props: LearnWorksheetModalProps) {
  const { isMounted, isVisible, title, items, isLoading, error, onClose } = props
  const [answersById, setAnswersById] = useState<Record<string, string>>({})

  if (!isMounted) {
    return null
  }

  return (
    <ModalShell isOpen={isVisible} className="learn-flashcards-modal-overlay" onRequestClose={onClose}>
      <section className="learn-flashcards-modal" role="dialog" aria-modal="true" aria-label="Arbeitsblatt">
        <header className="learn-flashcards-modal-header">
          <h2>Arbeitsblatt</h2>
          <button type="button" className="settings-close-button" onClick={onClose} aria-label="Schliessen">
            <span className="ui-icon settings-close-icon" aria-hidden="true" />
          </button>
        </header>
        <div className="learn-flashcards-modal-body learn-worksheet-modal-body">
          {isLoading ? (
            <p className="learn-muted learn-flashcards-modal-status">Arbeitsblatt wird erstellt…</p>
          ) : error ? (
            <p className="error-text learn-flashcards-modal-status">{error}</p>
          ) : items.length === 0 ? (
            <p className="learn-muted learn-flashcards-modal-status">Keine Aufgaben vorhanden.</p>
          ) : (
            <article className="learn-worksheet-content">
              <header className="learn-worksheet-content-header">
                <h3 className="learn-worksheet-content-title">Arbeitsblatt</h3>
                <p className="learn-worksheet-content-subtitle">{title}</p>
              </header>
              <div className="learn-worksheet-list" role="list">
                {items.map((item, index) => {
                  const n = index + 1
                  const label = `Antwort zu Aufgabe ${n}`
                  return (
                    <div key={item.id} className="learn-worksheet-item" role="listitem">
                      <div className="learn-worksheet-prompt-row">
                        <span className="learn-worksheet-num">{n}</span>
                        <p className="learn-worksheet-prompt">{displayPrompt(item.prompt)}</p>
                      </div>
                      <TextArea
                        className="learn-worksheet-answer-field"
                        rows={4}
                        placeholder="Antwort eingeben…"
                        autoComplete="off"
                        value={answersById[item.id] ?? ''}
                        onChange={(e) => {
                          const v = e.target.value
                          setAnswersById((prev) => ({ ...prev, [item.id]: v }))
                        }}
                        aria-label={label}
                      />
                    </div>
                  )
                })}
              </div>
            </article>
          )}
        </div>
      </section>
    </ModalShell>
  )
}
