import { useEffect, useState } from 'react'
import { USER_INTRODUCTION_SUBTITLE } from '../../auth/constants/userIntroduction'
import {
  IntroductionEditor,
  introductionValueFromProfile,
  type IntroductionEditorValue,
} from './IntroductionEditor'
import type { UserProfile } from '../../auth/services/auth.service'

type IntroductionSettingsSectionProps = {
  profile: UserProfile | null
  disableActions: boolean
  onSaveIntroduction: (value: IntroductionEditorValue) => Promise<void>
}

export function IntroductionSettingsSection({
  profile,
  disableActions,
  onSaveIntroduction,
}: IntroductionSettingsSectionProps) {
  const [draft, setDraft] = useState<IntroductionEditorValue>(() => introductionValueFromProfile(profile))
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    setDraft(introductionValueFromProfile(profile))
  }, [
    profile?.introduction_mode,
    profile?.introduction_text,
    profile?.introduction_answers,
    profile?.introduction_updated_at,
  ])

  const updatedLabel =
    profile?.introduction_updated_at != null
      ? new Date(profile.introduction_updated_at).toLocaleString('de-CH', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : null

  return (
    <section className="introduction-settings-panel">
      <p className="introduction-section-subtitle introduction-settings-lead">{USER_INTRODUCTION_SUBTITLE}</p>
      {updatedLabel ? (
        <p className="introduction-settings-meta" role="status">
          Zuletzt gespeichert: {updatedLabel}
        </p>
      ) : (
        <p className="introduction-settings-meta introduction-settings-meta--muted" role="status">
          Noch nicht gespeichert
        </p>
      )}
      <IntroductionEditor
        value={draft}
        onChange={setDraft}
        isSaving={isSaving || disableActions}
        saveLabel="Speichern"
        showAccountHint={false}
        onSave={async () => {
          setIsSaving(true)
          setMessage(null)
          try {
            await onSaveIntroduction(draft)
            setMessage('Einführung gespeichert.')
          } catch (err) {
            setMessage(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
          } finally {
            setIsSaving(false)
          }
        }}
      />
      {message ? (
        <p className="introduction-settings-feedback" role="status">
          {message}
        </p>
      ) : null}
    </section>
  )
}
