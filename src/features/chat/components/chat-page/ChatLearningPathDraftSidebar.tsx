import { PrimaryButton } from '../../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../../components/ui/buttons/SecondaryButton'
import type { ChatLearnDraftContext, ChatLearnDraftStep, ChatLearnProficiency } from './chatPageLearnDraft'

type ChatLearningPathDraftSidebarProps = {
  open: boolean
  loading: boolean
  step: ChatLearnDraftStep
  context: ChatLearnDraftContext | null
  files: string[]
  imageCount: number
  proficiency: ChatLearnProficiency | ''
  name: string
  onClose: () => void
  onProficiencyChange: (value: ChatLearnProficiency) => void
  onNameChange: (value: string) => void
  onStepChange: (step: ChatLearnDraftStep) => void
  onProceed: () => void
}

export function ChatLearningPathDraftSidebar({
  open,
  loading,
  step,
  context,
  files,
  imageCount,
  proficiency,
  name,
  onClose,
  onProficiencyChange,
  onNameChange,
  onStepChange,
  onProceed,
}: ChatLearningPathDraftSidebarProps) {
  return (
    <aside
      className={`chat-learnpath-draft-sidebar${open ? ' is-open' : ''}`}
      aria-label="Lernpfad vorbereiten"
    >
      <div className="chat-learnpath-draft-sidebar-header">
        <h3>Lernpfad erstellen</h3>
        <button
          type="button"
          className="chat-learnpath-draft-close"
          aria-label="Lernpfad-Einrichtung schließen"
          onClick={onClose}
        >
          X
        </button>
      </div>
      {loading ? (
        <div className="chat-learnpath-draft-loader" role="status" aria-live="polite">
          <span className="chat-learnpath-draft-loader-ring" aria-hidden="true" />
          <p>Chat-Inhalte werden analysiert…</p>
        </div>
      ) : (
        <div className="chat-learnpath-draft-body">
          {step === 'proficiency' ? (
            <>
              <p className="chat-learnpath-draft-hint">
                Die Chat-Informationen wurden für den Lernpfad gespeichert.
              </p>
              <div className="chat-learnpath-draft-meta">
                <span>Dateien: {files.length}</span>
                <span>Bilder: {imageCount}</span>
                <span>Themen: {context?.topTerms.length ?? 0}</span>
              </div>
              <div className="chat-learnpath-draft-proficiency" role="radiogroup" aria-label="Kenntnisstand">
                <p>Wie gut beherrschst du die Inhalte?</p>
                <div className="chat-learnpath-draft-proficiency-options">
                  <button
                    type="button"
                    className={`chat-learnpath-draft-level${proficiency === 'low' ? ' is-active' : ''}`}
                    onClick={() => onProficiencyChange('low')}
                  >
                    Einsteiger
                  </button>
                  <button
                    type="button"
                    className={`chat-learnpath-draft-level${proficiency === 'medium' ? ' is-active' : ''}`}
                    onClick={() => onProficiencyChange('medium')}
                  >
                    Mittel
                  </button>
                  <button
                    type="button"
                    className={`chat-learnpath-draft-level${proficiency === 'high' ? ' is-active' : ''}`}
                    onClick={() => onProficiencyChange('high')}
                  >
                    Fortgeschritten
                  </button>
                </div>
                <div className="chat-learnpath-draft-actions">
                  <PrimaryButton
                    type="button"
                    disabled={!proficiency}
                    onClick={() => onStepChange('name')}
                  >
                    Weiter
                  </PrimaryButton>
                </div>
              </div>
            </>
          ) : (
            <div className="chat-learnpath-draft-proficiency">
              <p>Wie soll dein Lernpfad heißen?</p>
              <input
                type="text"
                className="chat-learnpath-draft-name-input"
                value={name}
                onChange={(event) => onNameChange(event.currentTarget.value)}
                placeholder="z. B. Word Generator Mastery"
                maxLength={80}
              />
              <div className="chat-learnpath-draft-actions">
                <SecondaryButton type="button" onClick={() => onStepChange('proficiency')}>
                  Zurück
                </SecondaryButton>
                <PrimaryButton type="button" onClick={onProceed}>
                  Zum Lernbereich
                </PrimaryButton>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
