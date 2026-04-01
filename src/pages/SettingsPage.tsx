import { useEffect, useRef, useState } from 'react'
import accountIcon from '../assets/icons/account.svg'
import aiIcon from '../assets/icons/ai.svg'
import generalIcon from '../assets/icons/general.svg'
import newMessageIcon from '../assets/icons/newMessage.svg'
import personalizeIcon from '../assets/icons/personalize.svg'
import statusIcon from '../assets/icons/status.svg'
import { ModalHeader } from '../components/ui/modal/ModalHeader'
import { AccountSettingsSection } from '../features/settings/components/AccountSettingsSection'
import { AiSettingsSection } from '../features/settings/components/AiSettingsSection'
import { ChatSettingsSection } from '../features/settings/components/ChatSettingsSection'
import { ErrorStatusSettingsSection } from '../features/settings/components/ErrorStatusSettingsSection'
import { GeneralSettingsSection } from '../features/settings/components/GeneralSettingsSection'
import { PersonalizeSettingsSection } from '../features/settings/components/PersonalizeSettingsSection'
import { CHAT_THREADS_REFRESH_EVENT } from '../features/chat/constants/events'
import { deleteEmptyChatThreadsByUserId } from '../features/chat/services/chat.persistence'
import { useAuth } from '../features/auth/context/useAuth'
import {
  ACCENT_STORAGE_KEY,
  applyAccentPalette,
  DEFAULT_ACCENT_PALETTE_ID,
} from '../features/settings/constants/accentPalettes'
import {
  applyHoverPalette,
  DEFAULT_HOVER_PALETTE_ID,
  HOVER_STORAGE_KEY,
} from '../features/settings/constants/hoverPalettes'
import {
  applyLearnPathTitleColorMode,
  readPersistedLearnPathTitleColorMode,
  type LearnPathTitleColorMode,
} from '../features/settings/constants/learnPathTitleColor'
import {
  applyMessageBoxPalette,
  DEFAULT_MESSAGE_BOX_PALETTE_ID,
  MESSAGE_BOX_STORAGE_KEY,
} from '../features/settings/constants/messageBoxPalettes'

type SettingsSectionId = 'general' | 'chat' | 'personalize' | 'ai' | 'status' | 'account'

type SettingsSection = {
  id: SettingsSectionId
  label: string
  title: string
  icon?: string
}

type SettingsModalProps = {
  onClose: () => void
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const {
    user,
    profile,
    isLoading,
    error,
    isConfigured,
    updateAutoRemoveEmptyChats,
    updateProfileNames,
    updateLanguage,
    updateEmail,
  } = useAuth()
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('general')
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'pink-glass'>(() => {
    const persistedTheme = window.localStorage.getItem('straton-theme')
    return persistedTheme === 'light' || persistedTheme === 'dark' || persistedTheme === 'pink-glass'
      ? persistedTheme
      : 'dark'
  })
  const [sidebarScale, setSidebarScale] = useState<'100' | '75'>(() => {
    const persistedScale = window.localStorage.getItem('straton-sidebar-scale')
    return persistedScale === '75' ? '75' : '100'
  })
  const [language, setLanguage] = useState<'de' | 'en' | 'hr' | 'it' | 'sq' | 'es-PE'>(() => {
    const persistedLanguage = window.localStorage.getItem('straton-language')
    return persistedLanguage === 'en' ||
      persistedLanguage === 'hr' ||
      persistedLanguage === 'it' ||
      persistedLanguage === 'sq' ||
      persistedLanguage === 'es-PE'
      ? persistedLanguage
      : 'de'
  })
  const [accentPaletteId, setAccentPaletteId] = useState(() => {
    const persistedAccent = window.localStorage.getItem(ACCENT_STORAGE_KEY)
    return applyAccentPalette(persistedAccent ?? DEFAULT_ACCENT_PALETTE_ID)
  })
  const [hoverPaletteId, setHoverPaletteId] = useState(() => {
    const persistedHoverPalette = window.localStorage.getItem(HOVER_STORAGE_KEY)
    return applyHoverPalette(persistedHoverPalette ?? DEFAULT_HOVER_PALETTE_ID)
  })
  const [messageBoxPaletteId, setMessageBoxPaletteId] = useState(() => {
    const persistedMessageBoxPalette = window.localStorage.getItem(MESSAGE_BOX_STORAGE_KEY)
    return applyMessageBoxPalette(persistedMessageBoxPalette ?? DEFAULT_MESSAGE_BOX_PALETTE_ID)
  })
  const [learnPathTitleColorMode, setLearnPathTitleColorMode] = useState<LearnPathTitleColorMode>(() =>
    readPersistedLearnPathTitleColorMode(),
  )
  const [isUpdatingChatSetting, setIsUpdatingChatSetting] = useState(false)
  const [isCleaningEmptyChats, setIsCleaningEmptyChats] = useState(false)
  const [chatCleanupInfo, setChatCleanupInfo] = useState<string | null>(null)
  const [languageFeedback, setLanguageFeedback] = useState<string | null>(null)
  const [isSavingAccount, setIsSavingAccount] = useState(false)
  const [firstNameDraft, setFirstNameDraft] = useState('')
  const [lastNameDraft, setLastNameDraft] = useState('')
  const [emailDraft, setEmailDraft] = useState('')
  const [isSavingEmail, setIsSavingEmail] = useState(false)
  const [emailMessage, setEmailMessage] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const lastSavedNamesRef = useRef({ firstName: '', lastName: '' })

  const i18n = {
    menuTitle:
      language === 'en'
        ? 'Menu'
        : language === 'hr'
          ? 'Izbornik'
          : language === 'it'
            ? 'Menu'
            : language === 'sq'
              ? 'Meny'
              : language === 'es-PE'
                ? 'Menú'
                : 'Menü',
    closeLabel:
      language === 'en'
        ? 'Close settings'
        : language === 'hr'
          ? 'Zatvori postavke'
          : language === 'it'
            ? 'Chiudi impostazioni'
            : language === 'sq'
              ? 'Mbyll cilësimet'
              : language === 'es-PE'
                ? 'Cerrar ajustes'
          : 'Einstellungen schliessen',
  }

  const sections: SettingsSection[] = [
    {
      id: 'general',
      label:
        language === 'en'
          ? 'General'
          : language === 'hr'
            ? 'Opce'
            : language === 'it'
              ? 'Generale'
              : language === 'sq'
                ? 'Të përgjithshme'
                : language === 'es-PE'
                  ? 'General'
                  : 'Allgemein',
      title:
        language === 'en'
          ? 'General Settings'
          : language === 'hr'
            ? 'Opce postavke'
            : language === 'it'
              ? 'Impostazioni generali'
              : language === 'sq'
                ? 'Cilësime të përgjithshme'
                : language === 'es-PE'
                  ? 'Ajustes generales'
            : 'Allgemeine Einstellungen',
      icon: generalIcon,
    },
    {
      id: 'chat',
      label: 'Chat',
      title:
        language === 'en'
          ? 'Chat Settings'
          : language === 'hr'
            ? 'Chat postavke'
            : language === 'it'
              ? 'Impostazioni chat'
              : language === 'sq'
                ? 'Cilësimet e chat-it'
                : language === 'es-PE'
                  ? 'Ajustes de chat'
                  : 'Chat Einstellungen',
      icon: newMessageIcon,
    },
    {
      id: 'personalize',
      label:
        language === 'en'
          ? 'Personalize'
          : language === 'hr'
            ? 'Prilagodba'
            : language === 'it'
              ? 'Personalizza'
              : language === 'sq'
                ? 'Personalizo'
                : language === 'es-PE'
                  ? 'Personalizar'
                  : 'Personalisieren',
      title:
        language === 'en'
          ? 'Personalization'
          : language === 'hr'
            ? 'Prilagodba'
            : language === 'it'
              ? 'Personalizzazione'
              : language === 'sq'
                ? 'Personalizimi'
                : language === 'es-PE'
                  ? 'Personalización'
                  : 'Personalisierung',
      icon: personalizeIcon,
    },
    {
      id: 'ai',
      label:
        language === 'en'
          ? 'AI Provider'
          : language === 'hr'
            ? 'AI pruzatelj'
            : language === 'it'
              ? 'Provider AI'
              : language === 'sq'
                ? 'Ofruesi AI'
                : language === 'es-PE'
                  ? 'Proveedor de IA'
                  : 'KI Provider',
      title:
        language === 'en'
          ? 'AI Integrations'
          : language === 'hr'
            ? 'AI integracije'
            : language === 'it'
              ? 'Integrazioni AI'
              : language === 'sq'
                ? 'Integrimet AI'
                : language === 'es-PE'
                  ? 'Integraciones de IA'
                  : 'KI Integrationen',
      icon: aiIcon,
    },
    {
      id: 'status',
      label:
        language === 'en'
          ? 'Status'
          : language === 'hr'
            ? 'Status'
            : language === 'it'
              ? 'Stato'
              : language === 'sq'
                ? 'Statusi'
                : language === 'es-PE'
                  ? 'Estado'
                  : 'Status',
      title:
        language === 'en'
          ? 'Errors and Status'
          : language === 'hr'
            ? 'Pogreške i status'
            : language === 'it'
              ? 'Errori e stato'
              : language === 'sq'
                ? 'Gabimet dhe statusi'
                : language === 'es-PE'
                  ? 'Errores y estado'
                  : 'Fehler und Status',
      icon: statusIcon,
    },
    {
      id: 'account',
      label:
        language === 'en'
          ? 'Account'
          : language === 'hr'
            ? 'Racun'
            : language === 'it'
              ? 'Account'
              : language === 'sq'
                ? 'Llogaria'
                : language === 'es-PE'
                  ? 'Cuenta'
                  : 'Konto',
      title:
        language === 'en'
          ? 'Account and Security'
          : language === 'hr'
            ? 'Racun i sigurnost'
            : language === 'it'
              ? 'Account e sicurezza'
              : language === 'sq'
                ? 'Llogaria dhe siguria'
                : language === 'es-PE'
                  ? 'Cuenta y seguridad'
            : 'Account und Sicherheit',
      icon: accountIcon,
    },
  ]

  useEffect(() => {
    const baseTheme = themeMode === 'light' ? 'light' : 'dark'
    document.documentElement.dataset.theme = baseTheme
    document.documentElement.dataset.themeVariant = themeMode === 'pink-glass' ? 'pink-glass' : ''
    window.localStorage.setItem('straton-theme', themeMode)
  }, [themeMode])

  useEffect(() => {
    document.documentElement.dataset.sidebarScale = sidebarScale
    window.localStorage.setItem('straton-sidebar-scale', sidebarScale)
  }, [sidebarScale])

  useEffect(() => {
    document.documentElement.lang = language
    window.localStorage.setItem('straton-language', language)
  }, [language])

  useEffect(() => {
    const appliedAccentId = applyAccentPalette(accentPaletteId)
    if (appliedAccentId !== accentPaletteId) {
      setAccentPaletteId(appliedAccentId)
      return
    }
    window.localStorage.setItem(ACCENT_STORAGE_KEY, appliedAccentId)
  }, [accentPaletteId])

  useEffect(() => {
    const appliedHoverPaletteId = applyHoverPalette(hoverPaletteId)
    if (appliedHoverPaletteId !== hoverPaletteId) {
      setHoverPaletteId(appliedHoverPaletteId)
      return
    }
    window.localStorage.setItem(HOVER_STORAGE_KEY, appliedHoverPaletteId)
  }, [hoverPaletteId])

  useEffect(() => {
    const appliedMessageBoxPaletteId = applyMessageBoxPalette(messageBoxPaletteId)
    if (appliedMessageBoxPaletteId !== messageBoxPaletteId) {
      setMessageBoxPaletteId(appliedMessageBoxPaletteId)
      return
    }
    window.localStorage.setItem(MESSAGE_BOX_STORAGE_KEY, appliedMessageBoxPaletteId)
  }, [messageBoxPaletteId])

  useEffect(() => {
    applyLearnPathTitleColorMode(learnPathTitleColorMode)
  }, [learnPathTitleColorMode])

  const activeSectionConfig = sections.find((section) => section.id === activeSection) ?? sections[0]
  const autoRemoveEmptyChats = profile?.auto_remove_empty_chats ?? true

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
  }, [profile?.language])

  useEffect(() => {
    if (!languageFeedback) {
      return
    }

    const timerId = window.setTimeout(() => {
      setLanguageFeedback(null)
    }, 1800)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [languageFeedback])

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
      } finally {
        setIsSavingAccount(false)
      }
    }, 450)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [activeSection, firstNameDraft, lastNameDraft, updateProfileNames])

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

  async function handleToggleAutoRemoveEmptyChats() {
    try {
      setIsUpdatingChatSetting(true)
      await updateAutoRemoveEmptyChats(!autoRemoveEmptyChats)
    } finally {
      setIsUpdatingChatSetting(false)
    }
  }

  async function handleCleanupEmptyChats() {
    if (!user) {
      return
    }

    try {
      setIsCleaningEmptyChats(true)
      const deletedCount = await deleteEmptyChatThreadsByUserId(user.id)
      setChatCleanupInfo(
        deletedCount > 0 ? `${deletedCount} leere Chats gelöscht.` : 'Keine leeren Chats gefunden.',
      )
      window.dispatchEvent(new Event(CHAT_THREADS_REFRESH_EVENT))
    } finally {
      setIsCleaningEmptyChats(false)
    }
  }

  async function handleChangeLanguage(nextLanguage: 'de' | 'en' | 'hr' | 'it' | 'sq' | 'es-PE') {
    if (nextLanguage === language) {
      return
    }

    const previousLanguage = language
    setLanguage(nextLanguage)
    setLanguageFeedback(null)

    try {
      await updateLanguage(nextLanguage)
      setLanguageFeedback(
        nextLanguage === 'en'
          ? 'Language was saved to Supabase.'
          : nextLanguage === 'hr'
            ? 'Jezik je spremljen u Supabase.'
            : nextLanguage === 'it'
              ? 'La lingua è stata salvata su Supabase.'
              : nextLanguage === 'sq'
                ? 'Gjuha u ruajt në Supabase.'
                : nextLanguage === 'es-PE'
                  ? 'El idioma se guardó en Supabase.'
            : 'Sprache wurde in Supabase gespeichert.',
      )
    } catch {
      setLanguage(previousLanguage)
    }
  }

  return (
    <section className="settings-modal" role="dialog" aria-modal="true" aria-label="Einstellungen">
      <aside className="settings-sidebar">
        <h2>{i18n.menuTitle}</h2>
        <nav className="settings-menu">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`settings-menu-item ${activeSection === section.id ? 'is-active' : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              {section.icon ? (
                <img className="ui-icon settings-menu-icon" src={section.icon} alt="" aria-hidden="true" />
              ) : null}
              {section.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="settings-content">
        <header className="settings-titlebar">
          <ModalHeader
            title={activeSectionConfig.title}
            headingLevel="h1"
            onClose={onClose}
            closeLabel={i18n.closeLabel}
          />
          {languageFeedback ? (
            <div className="settings-save-indicator" role="status" aria-live="polite">
              <span className="settings-save-indicator-spinner" aria-hidden="true" />
              <span>Sprache gespeichert</span>
            </div>
          ) : null}
        </header>

        <section className="settings-body">
          {activeSection === 'general' ? (
            <GeneralSettingsSection language={language} onChangeLanguage={handleChangeLanguage} />
          ) : null}
          {activeSection === 'ai' ? (
            <AiSettingsSection />
          ) : null}
          {activeSection === 'personalize' ? (
            <PersonalizeSettingsSection
              themeMode={themeMode}
              sidebarScale={sidebarScale}
              accentPaletteId={accentPaletteId}
              hoverPaletteId={hoverPaletteId}
              messageBoxPaletteId={messageBoxPaletteId}
              learnPathTitleColorMode={learnPathTitleColorMode}
              onChangeThemeMode={setThemeMode}
              onChangeSidebarScale={setSidebarScale}
              onChangeAccentPalette={setAccentPaletteId}
              onChangeHoverPalette={setHoverPaletteId}
              onChangeMessageBoxPalette={setMessageBoxPaletteId}
              onChangeLearnPathTitleColorMode={setLearnPathTitleColorMode}
            />
          ) : null}
          {activeSection === 'chat' ? (
            <ChatSettingsSection
              autoRemoveEmptyChats={autoRemoveEmptyChats}
              isUpdatingChatSetting={isUpdatingChatSetting}
              isCleaningEmptyChats={isCleaningEmptyChats}
              chatCleanupInfo={chatCleanupInfo}
              disableCleanup={!user}
              onToggleAutoRemoveEmptyChats={handleToggleAutoRemoveEmptyChats}
              onCleanupEmptyChats={handleCleanupEmptyChats}
            />
          ) : null}
          {activeSection === 'status' ? (
            <ErrorStatusSettingsSection
              language={language}
              isConfigured={isConfigured}
              isAuthLoading={isLoading}
              appError={error}
              hasUser={Boolean(user)}
            />
          ) : null}
          {activeSection === 'account' ? (
            <AccountSettingsSection
              firstNameDraft={firstNameDraft}
              lastNameDraft={lastNameDraft}
              emailDraft={emailDraft}
              currentEmail={user?.email ?? ''}
              pendingNewEmail={user?.new_email ?? null}
              avatarUrl={profile?.avatar_url ?? null}
              isSavingAccount={isSavingAccount}
              isSavingEmail={isSavingEmail}
              emailSaveDisabled={!isConfigured || !user}
              emailMessage={emailMessage}
              emailError={emailError}
              onFirstNameChange={setFirstNameDraft}
              onLastNameChange={setLastNameDraft}
              onEmailChange={(value) => {
                setEmailDraft(value)
                setEmailMessage(null)
                setEmailError(null)
              }}
              onSaveEmail={handleSaveEmail}
            />
          ) : null}
        </section>
      </div>
    </section>
  )
}
