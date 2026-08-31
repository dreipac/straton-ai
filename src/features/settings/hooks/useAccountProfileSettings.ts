import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { UserProfile } from '../../auth/services/auth.service'
import type { SettingsSectionId } from '../constants/settingsSections'

type UseAccountProfileSettingsArgs = {
  user: User | null
  profile: UserProfile | null
  isConfigured: boolean
  /** Auto-Save der Namen läuft nur, solange die "Mein Konto"-Sektion sichtbar ist. */
  activeSection: SettingsSectionId
  updateProfileNames: (firstName: string, lastName: string) => Promise<void>
  uploadProfileAvatar: (file: File) => Promise<void>
  removeProfileAvatar: () => Promise<void>
  updateEmail: (email: string) => Promise<void>
  /** Zeigt den dezenten "Gespeichert"-Hinweis im Header — gleicher Indikator wie bei den anderen
      Settings-Hooks, deshalb von aussen hereingereicht statt hier neu gebaut. */
  onSaved: () => void
}

/**
 * Name/E-Mail/Avatar auf "Mein Konto" — aus `SettingsPage.tsx` ausgelagert (State + Effekte +
 * Handler gehörten inhaltlich zusammen, lagen aber wie die anderen Settings-Themen direkt in der
 * God Component). Namen speichern debounced automatisch im Hintergrund, sobald sich der Entwurf vom
 * zuletzt gespeicherten Stand unterscheidet; E-Mail und Avatar laufen über explizite Aktionen.
 */
export function useAccountProfileSettings({
  user,
  profile,
  isConfigured,
  activeSection,
  updateProfileNames,
  uploadProfileAvatar,
  removeProfileAvatar,
  updateEmail,
  onSaved,
}: UseAccountProfileSettingsArgs) {
  const [isSavingAccount, setIsSavingAccount] = useState(false)
  const [firstNameDraft, setFirstNameDraft] = useState('')
  const [lastNameDraft, setLastNameDraft] = useState('')
  const [emailDraft, setEmailDraft] = useState('')
  const [isSavingEmail, setIsSavingEmail] = useState(false)
  const [emailMessage, setEmailMessage] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [isAvatarBusy, setIsAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const lastSavedNamesRef = useRef({ firstName: '', lastName: '' })

  useEffect(() => {
    const firstName = profile?.first_name ?? ''
    const lastName = profile?.last_name ?? ''
    setFirstNameDraft(firstName)
    setLastNameDraft(lastName)
    lastSavedNamesRef.current = { firstName, lastName }
  }, [profile?.first_name, profile?.last_name])

  useEffect(() => {
    setEmailDraft(user?.email ?? '')
    setEmailMessage(null)
    setEmailError(null)
  }, [user?.email])

  useEffect(() => {
    if (activeSection !== 'account') {
      return
    }

    const nextFirstName = firstNameDraft.trim()
    const nextLastName = lastNameDraft.trim()
    const lastSaved = lastSavedNamesRef.current
    const hasChanged = nextFirstName !== lastSaved.firstName || nextLastName !== lastSaved.lastName

    if (!hasChanged) {
      return
    }

    const timerId = window.setTimeout(async () => {
      try {
        setIsSavingAccount(true)
        await updateProfileNames(nextFirstName, nextLastName)
        lastSavedNamesRef.current = { firstName: nextFirstName, lastName: nextLastName }
        onSaved()
      } finally {
        setIsSavingAccount(false)
      }
    }, 450)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [activeSection, firstNameDraft, lastNameDraft, updateProfileNames, onSaved])

  function handleAvatarFileSelected(file: File) {
    setAvatarError(null)
    void (async () => {
      try {
        setIsAvatarBusy(true)
        await uploadProfileAvatar(file)
      } catch (err) {
        setAvatarError(err instanceof Error ? err.message : 'Profilbild konnte nicht gespeichert werden.')
      } finally {
        setIsAvatarBusy(false)
      }
    })()
  }

  function handleRemoveAvatar() {
    setAvatarError(null)
    void (async () => {
      try {
        setIsAvatarBusy(true)
        await removeProfileAvatar()
      } catch (err) {
        setAvatarError(err instanceof Error ? err.message : 'Profilbild konnte nicht entfernt werden.')
      } finally {
        setIsAvatarBusy(false)
      }
    })()
  }

  async function handleSaveEmail() {
    if (!user || !isConfigured) {
      return
    }

    setEmailMessage(null)
    setEmailError(null)
    const trimmed = emailDraft.trim()
    const next = trimmed.toLowerCase()
    const current = (user.email ?? '').toLowerCase()
    if (next === current) {
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError('Bitte eine gültige E-Mail-Adresse eingeben.')
      return
    }

    try {
      setIsSavingEmail(true)
      await updateEmail(trimmed)
      setEmailMessage(
        'Änderung angefordert. Bitte den Bestätigungslink in der E-Mail zur neuen Adresse öffnen — erst danach ist die E-Mail aktiv.',
      )
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'E-Mail konnte nicht geändert werden.')
    } finally {
      setIsSavingEmail(false)
    }
  }

  function handleEmailDraftChange(value: string) {
    setEmailDraft(value)
    setEmailMessage(null)
    setEmailError(null)
  }

  return {
    isSavingAccount,
    firstNameDraft,
    setFirstNameDraft,
    lastNameDraft,
    setLastNameDraft,
    emailDraft,
    isSavingEmail,
    emailMessage,
    emailError,
    isAvatarBusy,
    avatarError,
    handleAvatarFileSelected,
    handleRemoveAvatar,
    handleSaveEmail,
    handleEmailDraftChange,
  }
}
