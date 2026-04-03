import { useState } from 'react'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { TextArea } from '../../../components/ui/inputs/TextArea'
import { submitUserFeedback } from '../../feedback/services/feedback.persistence'

type FeedbackSettingsSectionProps = {
  language: 'de' | 'en' | 'hr' | 'it' | 'sq' | 'es-PE'
  userEmail: string | null
  authorFirstName: string | null
  authorLastName: string | null
  hasUser: boolean
}

export function FeedbackSettingsSection(props: FeedbackSettingsSectionProps) {
  const { language, userEmail, authorFirstName, authorLastName, hasUser } = props
  const [text, setText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const i18n =
    language === 'en'
      ? {
          intro: 'Tell us what we can improve or what works well for you.',
          placeholder: 'Your feedback…',
          submit: 'Send feedback',
          sending: 'Sending…',
          success: 'Thank you! Your feedback has been submitted.',
          needLogin: 'Please sign in to send feedback.',
        }
      : {
          intro: 'Schreib uns, was wir verbessern können oder was dir gefällt.',
          placeholder: 'Dein Feedback…',
          submit: 'Feedback absenden',
          sending: 'Wird gesendet…',
          success: 'Danke! Dein Feedback wurde übermittelt.',
          needLogin: 'Bitte melde dich an, um Feedback zu senden.',
        }

  async function handleSubmit() {
    setMessage(null)
    setError(null)
    setIsSubmitting(true)
    try {
      await submitUserFeedback(text, {
        email: userEmail,
        firstName: authorFirstName,
        lastName: authorLastName,
      })
      setText('')
      setMessage(i18n.success)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Senden fehlgeschlagen.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <article className="settings-card">
      <p>{i18n.intro}</p>
      {!hasUser ? <p className="error-text">{i18n.needLogin}</p> : null}
      <TextArea
        className="feedback-settings-textarea"
        rows={6}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setMessage(null)
          setError(null)
        }}
        placeholder={i18n.placeholder}
        disabled={isSubmitting || !hasUser}
        aria-label={i18n.placeholder}
      />
      {error ? <p className="error-text">{error}</p> : null}
      {message ? (
        <p className="feedback-settings-success" role="status">
          {message}
        </p>
      ) : null}
      <div className="feedback-settings-actions">
        <PrimaryButton
          type="button"
          disabled={isSubmitting || !text.trim() || !hasUser}
          onClick={() => void handleSubmit()}
        >
          {isSubmitting ? i18n.sending : i18n.submit}
        </PrimaryButton>
      </div>
    </article>
  )
}
