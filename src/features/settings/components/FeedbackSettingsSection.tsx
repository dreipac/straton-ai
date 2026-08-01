import { useEffect, useRef, useState } from 'react'
import { ContextMenu } from '../../../components/ui/menu/ContextMenu'
import { MenuItem } from '../../../components/ui/menu/MenuItem'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'
import { TextArea } from '../../../components/ui/inputs/TextArea'
import { listChatThreads } from '../../chat/services/chat.persistence'
import type { ChatThread } from '../../chat/types'
import { submitUserFeedback } from '../../feedback/services/feedback.persistence'

type FeedbackSettingsSectionProps = {
  language: 'de' | 'en' | 'hr' | 'it' | 'sq' | 'es-PE'
  userId: string | null
  userEmail: string | null
  authorFirstName: string | null
  authorLastName: string | null
  hasUser: boolean
}

export function FeedbackSettingsSection(props: FeedbackSettingsSectionProps) {
  const { language, userId, userEmail, authorFirstName, authorLastName, hasUser } = props
  const [text, setText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement | null>(null)

  const [chatThreads, setChatThreads] = useState<ChatThread[]>([])
  const [selectedChatThreadId, setSelectedChatThreadId] = useState<string | null>(null)
  const [isChatMenuOpen, setIsChatMenuOpen] = useState(false)
  const chatMenuRef = useRef<HTMLDivElement | null>(null)

  const i18n =
    language === 'en'
      ? {
          intro: 'Tell us what we can improve or what works well for you.',
          placeholder: 'Your feedback…',
          submit: 'Send feedback',
          sending: 'Sending…',
          success: 'Thank you! Your feedback has been submitted.',
          successWithId: (id: string) => `Thank you! Your feedback ID is ${id}.`,
          needLogin: 'Please sign in to send feedback.',
          attachmentsTitle: 'Attachments (optional)',
          photoLabel: 'Photo',
          addPhoto: 'Add photo',
          removePhoto: 'Remove',
          chatLabel: 'Chat',
          noChatSelected: 'No chat selected',
          noChats: 'No chats yet',
          clearChatSelection: 'No chat',
        }
      : {
          intro: 'Schreib uns, was wir verbessern können oder was dir gefällt.',
          placeholder: 'Dein Feedback…',
          submit: 'Feedback absenden',
          sending: 'Wird gesendet…',
          success: 'Danke! Dein Feedback wurde übermittelt.',
          successWithId: (id: string) => `Danke! Deine Feedback-ID lautet ${id}.`,
          needLogin: 'Bitte melde dich an, um Feedback zu senden.',
          attachmentsTitle: 'Anhänge (optional)',
          photoLabel: 'Foto',
          addPhoto: 'Foto anhängen',
          removePhoto: 'Entfernen',
          chatLabel: 'Chat',
          noChatSelected: 'Kein Chat ausgewählt',
          noChats: 'Noch keine Chats vorhanden',
          clearChatSelection: 'Kein Chat',
        }

  useEffect(() => {
    if (!hasUser || !userId) {
      setChatThreads([])
      return
    }
    let cancelled = false
    void listChatThreads(userId)
      .then((threads) => {
        if (!cancelled) {
          setChatThreads(threads)
        }
      })
      .catch(() => {
        /* still — Chat-Anhang ist optional, kein Blocker fürs Feedback-Formular */
      })
    return () => {
      cancelled = true
    }
  }, [hasUser, userId])

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!isChatMenuOpen) {
        return
      }
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      if (!(chatMenuRef.current?.contains(target) ?? false)) {
        setIsChatMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [isChatMenuOpen])

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl)
      }
    }
  }, [photoPreviewUrl])

  function handlePhotoSelected(file: File | null) {
    setPhotoPreviewUrl((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev)
      }
      return file ? URL.createObjectURL(file) : null
    })
    setPhotoFile(file)
  }

  const selectedChatThreadTitle = chatThreads.find((thread) => thread.id === selectedChatThreadId)?.title ?? null

  async function handleSubmit() {
    setMessage(null)
    setError(null)
    setIsSubmitting(true)
    try {
      const { displayId } = await submitUserFeedback(
        text,
        {
          email: userEmail,
          firstName: authorFirstName,
          lastName: authorLastName,
        },
        {
          photoFile,
          chatThreadId: selectedChatThreadId,
        },
      )
      setText('')
      handlePhotoSelected(null)
      setSelectedChatThreadId(null)
      setMessage(i18n.successWithId(displayId))
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

      <div className="feedback-attachments">
        <p className="feedback-attachments-title">{i18n.attachmentsTitle}</p>

        <div className="feedback-attachment-row">
          <span className="feedback-attachment-label">{i18n.photoLabel}</span>
          <div className="feedback-attachment-control">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="feedback-photo-input"
              disabled={isSubmitting || !hasUser}
              onChange={(event) => handlePhotoSelected(event.target.files?.[0] ?? null)}
            />
            {photoPreviewUrl ? (
              <div className="feedback-photo-preview">
                <img src={photoPreviewUrl} alt="" className="feedback-photo-preview-img" />
                <SecondaryButton
                  type="button"
                  className="feedback-photo-remove"
                  disabled={isSubmitting}
                  onClick={() => {
                    handlePhotoSelected(null)
                    if (photoInputRef.current) {
                      photoInputRef.current.value = ''
                    }
                  }}
                >
                  {i18n.removePhoto}
                </SecondaryButton>
              </div>
            ) : (
              <SecondaryButton
                type="button"
                disabled={isSubmitting || !hasUser}
                onClick={() => photoInputRef.current?.click()}
              >
                {i18n.addPhoto}
              </SecondaryButton>
            )}
          </div>
        </div>

        <div className="feedback-attachment-row">
          <span className="feedback-attachment-label">{i18n.chatLabel}</span>
          <div ref={chatMenuRef} className="general-setting-control">
            <button
              type="button"
              className="general-language-trigger squircle feedback-chat-trigger"
              disabled={isSubmitting || !hasUser || chatThreads.length === 0}
              onClick={() => setIsChatMenuOpen((prev) => !prev)}
              aria-haspopup="menu"
              aria-expanded={isChatMenuOpen}
            >
              {chatThreads.length === 0 ? i18n.noChats : selectedChatThreadTitle ?? i18n.noChatSelected}
            </button>

            {isChatMenuOpen ? (
              <ContextMenu className="general-language-menu feedback-chat-menu">
                <MenuItem
                  onClick={() => {
                    setSelectedChatThreadId(null)
                    setIsChatMenuOpen(false)
                  }}
                >
                  {i18n.clearChatSelection}
                </MenuItem>
                {chatThreads.map((thread) => (
                  <MenuItem
                    key={thread.id}
                    onClick={() => {
                      setSelectedChatThreadId(thread.id)
                      setIsChatMenuOpen(false)
                    }}
                  >
                    {thread.title}
                  </MenuItem>
                ))}
              </ContextMenu>
            ) : null}
          </div>
        </div>
      </div>

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
