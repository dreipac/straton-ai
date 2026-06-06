import { useEffect, useState } from 'react'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'
import { TextArea } from '../../../components/ui/inputs/TextArea'
import { AutoResizeTextArea } from '../../../components/ui/inputs/AutoResizeTextArea'
import {
  USER_INTRODUCTION_QUESTIONS,
  USER_INTRODUCTION_TEXT_MAX,
  parseUserIntroductionAnswers,
  type IntroductionMode,
  type UserIntroductionAnswers,
} from '../../auth/constants/userIntroduction'

export type IntroductionEditorValue = {
  mode: IntroductionMode
  text: string
  answers: UserIntroductionAnswers
}

type IntroductionEditorProps = {
  value: IntroductionEditorValue
  onChange: (value: IntroductionEditorValue) => void
  onSave: () => void | Promise<void>
  onLater?: () => void | Promise<void>
  isSaving?: boolean
  saveLabel?: string
  laterLabel?: string
  showLater?: boolean
  showAccountHint?: boolean
  showActions?: boolean
  compact?: boolean
}

export function IntroductionEditor({
  value,
  onChange,
  onSave,
  onLater,
  isSaving = false,
  saveLabel = 'Speichern',
  laterLabel = 'Später',
  showLater = false,
  showAccountHint = true,
  showActions = true,
  compact = false,
}: IntroductionEditorProps) {
  const [mode, setMode] = useState<IntroductionMode>(value.mode)

  useEffect(() => {
    setMode(value.mode)
  }, [value.mode])

  const setModeAndNotify = (next: IntroductionMode) => {
    setMode(next)
    onChange({ ...value, mode: next })
  }

  const updateAnswer = (id: keyof UserIntroductionAnswers, text: string) => {
    onChange({
      ...value,
      answers: { ...value.answers, [id]: text },
    })
  }

  return (
    <div className={`introduction-editor${compact ? ' introduction-editor--compact' : ''}`}>
      {showAccountHint ? (
        <p className="introduction-editor-hint">
          Vor- und Nachname änderst du unter <strong>Einstellungen → Konto</strong> — hier geht es um dich
          als Person (Alter, Hobbys, Ziele …).
        </p>
      ) : null}

      <div
        className={`introduction-editor-mode-switch${mode === 'questionnaire' ? ' is-questionnaire' : ''}`}
        role="tablist"
        aria-label="Einführungsmodus"
      >
        <span className="introduction-editor-mode-pill" aria-hidden="true" />
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'text'}
          className={`introduction-editor-mode-btn${mode === 'text' ? ' is-active' : ''}`}
          disabled={isSaving}
          onClick={() => setModeAndNotify('text')}
        >
          Freitext
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'questionnaire'}
          className={`introduction-editor-mode-btn${mode === 'questionnaire' ? ' is-active' : ''}`}
          disabled={isSaving}
          onClick={() => setModeAndNotify('questionnaire')}
        >
          Fragebogen
        </button>
      </div>

      {mode === 'text' ? (
        <label className="introduction-editor-field">
          <span className="introduction-editor-label">Erzähl kurz, wer du bist</span>
          <div className="account-settings-input-shell introduction-editor-textarea-shell">
            <TextArea
              className={compact ? 'introduction-editor-textarea--compact' : undefined}
              value={value.text}
              maxLength={USER_INTRODUCTION_TEXT_MAX}
              rows={compact ? 5 : 7}
              placeholder="Alter, Schule/Beruf, Hobbys, wofür du Straton nutzt …"
              disabled={isSaving}
              onChange={(event) => onChange({ ...value, text: event.target.value })}
            />
          </div>
          <span className="introduction-editor-char-count">
            {value.text.length.toLocaleString('de-CH')} / {USER_INTRODUCTION_TEXT_MAX.toLocaleString('de-CH')}
          </span>
        </label>
      ) : (
        <div className="introduction-editor-questionnaire">
          {USER_INTRODUCTION_QUESTIONS.map((q) => (
            <label key={q.id} className="introduction-editor-field">
              <span className="introduction-editor-label">{q.label}</span>
              <div className="account-settings-input-shell">
                <AutoResizeTextArea
                  value={value.answers[q.id] ?? ''}
                  maxLength={500}
                  maxHeightPx={240}
                  placeholder={q.placeholder}
                  disabled={isSaving}
                  className="introduction-editor-answer-textarea"
                  onChange={(event) => updateAnswer(q.id, event.target.value)}
                />
              </div>
            </label>
          ))}
        </div>
      )}

      {showActions ? (
        <div className="introduction-editor-actions">
          <PrimaryButton
            type="button"
            disabled={isSaving}
            onClick={() => {
              void onSave()
            }}
          >
            {isSaving ? 'Speichert…' : saveLabel}
          </PrimaryButton>
          {showLater && onLater ? (
            <SecondaryButton
              type="button"
              disabled={isSaving}
              onClick={() => {
                void onLater()
              }}
            >
              {laterLabel}
            </SecondaryButton>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function introductionValueFromProfile(profile: {
  introduction_mode?: string | null
  introduction_text?: string | null
  introduction_answers?: unknown
} | null): IntroductionEditorValue {
  const mode =
    profile?.introduction_mode === 'questionnaire' ? 'questionnaire' : 'text'
  return {
    mode,
    text: typeof profile?.introduction_text === 'string' ? profile.introduction_text : '',
    answers: parseUserIntroductionAnswers(profile?.introduction_answers),
  }
}
