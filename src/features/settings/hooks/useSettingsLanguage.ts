import { useEffect, useState } from 'react'
import type { UserProfile } from '../../auth/services/auth.service'
import type { SettingsLanguage } from '../constants/settingsLanguage'

type UseSettingsLanguageArgs = {
  profile: UserProfile | null
  updateLanguage: (language: SettingsLanguage) => Promise<void>
  /** Zeigt den dezenten "Gespeichert"-Hinweis im Header. */
  onSaved: () => void
}

function readPersistedLanguage(): SettingsLanguage {
  const persisted = window.localStorage.getItem('straton-language')
  return persisted === 'en' || persisted === 'hr' || persisted === 'it' || persisted === 'sq' || persisted === 'es-PE'
    ? persisted
    : 'de'
}

/**
 * Anzeigesprache — aus `SettingsPage.tsx` ausgelagert. Quelle der Wahrheit ist `profile.language`
 * sobald das Profil geladen ist; bis dahin (und für nicht angemeldete Nutzer) gilt der zuletzt in
 * `localStorage` gespeicherte Wert. `document.documentElement.lang` wird bei jeder Änderung
 * mitgeführt, damit Screenreader/Browser-Übersetzung die aktuelle Sprache kennen.
 */
export function useSettingsLanguage({ profile, updateLanguage, onSaved }: UseSettingsLanguageArgs) {
  const [language, setLanguage] = useState<SettingsLanguage>(() => readPersistedLanguage())

  // Profilsprache übernehmen, sobald sie geladen ist — während des Renderns statt in einem Effekt,
  // vermeidet ein synchrones setState direkt im Effekt-Body (react-hooks/set-state-in-effect).
  const [trackedProfileLanguage, setTrackedProfileLanguage] = useState(profile?.language)
  if (trackedProfileLanguage !== profile?.language) {
    setTrackedProfileLanguage(profile?.language)
    const profileLanguage = profile?.language
    if (
      profileLanguage === 'de' ||
      profileLanguage === 'en' ||
      profileLanguage === 'hr' ||
      profileLanguage === 'it' ||
      profileLanguage === 'sq' ||
      profileLanguage === 'es-PE'
    ) {
      setLanguage(profileLanguage)
    }
  }

  useEffect(() => {
    document.documentElement.lang = language
    window.localStorage.setItem('straton-language', language)
  }, [language])

  async function handleChangeLanguage(nextLanguage: SettingsLanguage) {
    if (nextLanguage === language) {
      return
    }

    const previousLanguage = language
    setLanguage(nextLanguage)

    try {
      await updateLanguage(nextLanguage)
      onSaved()
    } catch {
      setLanguage(previousLanguage)
    }
  }

  return { language, handleChangeLanguage }
}
