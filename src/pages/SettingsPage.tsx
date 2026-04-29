import { useEffect, useRef, useState } from 'react'
import accountIcon from '../assets/icons/account.svg'
import generalIcon from '../assets/icons/general.svg'
import newMessageIcon from '../assets/icons/newMessage.svg'
import personalizeIcon from '../assets/icons/personalize.svg'
import sendIcon from '../assets/icons/send.svg'
import statusIcon from '../assets/icons/status.svg'
import { SecondaryButton } from '../components/ui/buttons/SecondaryButton'
import { ModalHeader } from '../components/ui/modal/ModalHeader'
import { ModalShell } from '../components/ui/modal/ModalShell'
import { AccountSettingsSection } from '../features/settings/components/AccountSettingsSection'
import { ChatSettingsSection } from '../features/settings/components/ChatSettingsSection'
import { ChatInvitationsSection } from '../features/settings/components/ChatInvitationsSection'
import { ErrorStatusSettingsSection } from '../features/settings/components/ErrorStatusSettingsSection'
import { FeedbackSettingsSection } from '../features/settings/components/FeedbackSettingsSection'
import { GeneralSettingsSection } from '../features/settings/components/GeneralSettingsSection'
import { PersonalizeSettingsSection } from '../features/settings/components/PersonalizeSettingsSection'
import { CHAT_THREADS_REFRESH_EVENT } from '../features/chat/constants/events'
import {
  readAssistantEmojisEnabled,
  writeAssistantEmojisEnabled,
} from '../features/chat/constants/chatAssistantStyle'
import {
  applySidebarPreferenceToDocument,
  persistSidebarPreferenceToStorage,
  themeModeToDatasetVariant,
  type ThemeMode,
  type UiSettingsV1,
} from '../features/settings/uiSettings'
import { syncThemeColorMeta } from '../utils/themeColorMeta'
import { deleteEmptyChatThreadsByUserId } from '../features/chat/services/chat.persistence'
import { useAuth } from '../features/auth/context/useAuth'
import { listVisibleSubscriptionPlans, type VisibleSubscriptionPlan } from '../features/auth/services/subscriptionCatalog.service'
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

export type SettingsSectionId =
  | 'general'
  | 'chat'
  | 'invitations'
  | 'personalize'
  | 'status'
  | 'feedback'
  | 'account'

type SettingsSection = {
  id: SettingsSectionId
  label: string
  title: string
  icon?: string
}

type SettingsModalProps = {
  onClose: () => void
  /** Beim Öffnen (z. B. aus Mobile-Profil-Sheet) direkt diese Sektion anzeigen. */
  initialSection?: SettingsSectionId
  /**
   * `modal`: Desktop-Overlay (settings-modal).
   * `sheet`: Nur Inhalt fürs ProfileFullSheet — gleiche Sheet-Seite wie Profil, kein zweites Overlay.
   */
  variant?: 'modal' | 'sheet'
}

export function SettingsModal({ onClose, initialSection = 'general', variant = 'modal' }: SettingsModalProps) {
  const {
    user,
    profile,
    isLoading,
    error,
    isConfigured,
    updateAutoRemoveEmptyChats,
    updateProfileNames,
    uploadProfileAvatar,
    removeProfileAvatar,
    updateLanguage,
    updateEmail,
    updateUiSettings,
    updateAiChatMemory,
  } = useAuth()
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(initialSection)
  const [isNarrowSettings, setIsNarrowSettings] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 860px)').matches : false,
  )
  const [mobileStack, setMobileStack] = useState<'menu' | 'detail'>(() => {
    if (typeof window === 'undefined') {
      return 'menu'
    }
    const narrow = window.matchMedia('(max-width: 860px)').matches
    return narrow && initialSection !== 'general' ? 'detail' : 'menu'
  })
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const persistedTheme = window.localStorage.getItem('straton-theme')
    return persistedTheme === 'light' ||
      persistedTheme === 'dark' ||
      persistedTheme === 'pink-glass' ||
      persistedTheme === 'black'
      ? (persistedTheme as ThemeMode)
      : 'dark'
  })
  const [sidebarScale, setSidebarScale] = useState<'100' | '75'>(() => {
    const persistedScale = window.localStorage.getItem('straton-sidebar-scale')
    return persistedScale === '100' ? '100' : '75'
  })
  const [chatBackground, setChatBackground] = useState<'space-dark' | 'space-stars'>(() => {
    const persisted = window.localStorage.getItem('straton-chat-background')
    return persisted === 'space-stars' ? 'space-stars' : 'space-dark'
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
  const [assistantEmojisEnabled, setAssistantEmojisEnabled] = useState(() => readAssistantEmojisEnabled())
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
  const [isAvatarBusy, setIsAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [visibleSubscriptionPlans, setVisibleSubscriptionPlans] = useState<VisibleSubscriptionPlan[]>([])
  const [isLoadingVisibleSubscriptionPlans, setIsLoadingVisibleSubscriptionPlans] = useState(false)
  const [isPlansModalOpen, setIsPlansModalOpen] = useState(false)
  const lastSavedNamesRef = useRef({ firstName: '', lastName: '' })
  const [uiSettingsHydrated, setUiSettingsHydrated] = useState(false)
  const uiHydratedForUserIdRef = useRef<string | null>(null)
  const skipNextUiPersistRef = useRef(false)

  useEffect(() => {
    setActiveSection(initialSection)
  }, [initialSection])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)')
    const apply = () => {
      setIsNarrowSettings(mq.matches)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => {
      mq.removeEventListener('change', apply)
    }
  }, [])

  useEffect(() => {
    if (!isNarrowSettings && variant !== 'sheet') {
      return
    }
    setMobileStack(initialSection !== 'general' ? 'detail' : 'menu')
  }, [initialSection, isNarrowSettings, variant])

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
          : 'Einstellungen schließen',
    settingsScreenTitle:
      language === 'en'
        ? 'Settings'
        : language === 'hr'
          ? 'Postavke'
          : language === 'it'
            ? 'Impostazioni'
            : language === 'sq'
              ? 'Cilësimet'
              : language === 'es-PE'
                ? 'Ajustes'
                : 'Einstellungen',
    backLabel:
      language === 'en'
        ? 'Back'
        : language === 'hr'
          ? 'Natrag'
          : language === 'it'
            ? 'Indietro'
            : language === 'sq'
              ? 'Mbrapa'
              : language === 'es-PE'
                ? 'Atrás'
                : 'Zurück',
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
      id: 'invitations',
      label:
        language === 'en'
          ? 'Invitations'
          : language === 'hr'
            ? 'Pozivnice'
            : language === 'it'
              ? 'Inviti'
              : language === 'sq'
                ? 'Ftesat'
                : language === 'es-PE'
                  ? 'Invitaciones'
                  : 'Einladungen',
      title:
        language === 'en'
          ? 'Chat invitations'
          : language === 'hr'
            ? 'Pozivnice za chat'
            : language === 'it'
              ? 'Inviti alla chat'
              : language === 'sq'
                ? 'Ftesat për chat'
                : language === 'es-PE'
                  ? 'Invitaciones al chat'
                  : 'Einladungen zu Chats',
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
      id: 'feedback',
      label:
        language === 'en'
          ? 'Feedback'
          : language === 'hr'
            ? 'Povratne informacije'
            : language === 'it'
              ? 'Feedback'
              : language === 'sq'
                ? 'Feedback'
                : language === 'es-PE'
                  ? 'Comentarios'
                  : 'Feedback',
      title:
        language === 'en'
          ? 'Feedback'
          : language === 'hr'
            ? 'Povratne informacije'
            : language === 'it'
              ? 'Feedback'
              : language === 'sq'
                ? 'Feedback'
                : language === 'es-PE'
                  ? 'Comentarios'
                  : 'Feedback',
      icon: sendIcon,
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
    if (!user || !profile) {
      setUiSettingsHydrated(false)
      uiHydratedForUserIdRef.current = null
      return
    }
    if (uiHydratedForUserIdRef.current === user.id) {
      return
    }
    uiHydratedForUserIdRef.current = user.id
    const s = profile.ui_settings
    skipNextUiPersistRef.current = true
    setThemeMode(s.theme)
    setSidebarScale(s.sidebarScale)
    setChatBackground(s.chatBackground)
    setAccentPaletteId(applyAccentPalette(s.accentPaletteId))
    setHoverPaletteId(applyHoverPalette(s.hoverPaletteId))
    setMessageBoxPaletteId(applyMessageBoxPalette(s.messageBoxPaletteId))
    setLearnPathTitleColorMode(s.learnPathTitleColorMode)
    setAssistantEmojisEnabled(s.assistantEmojis)
    setUiSettingsHydrated(true)
  }, [user, profile])

  useEffect(() => {
    if (!user || !uiSettingsHydrated) {
      return
    }
    if (skipNextUiPersistRef.current) {
      skipNextUiPersistRef.current = false
      return
    }
    const snapshot: UiSettingsV1 = {
      theme: themeMode,
      sidebarScale,
      chatBackground,
      accentPaletteId,
      hoverPaletteId,
      messageBoxPaletteId,
      learnPathTitleColorMode,
      assistantEmojis: assistantEmojisEnabled,
    }
    const timerId = window.setTimeout(() => {
      void updateUiSettings(snapshot)
    }, 450)
    return () => {
      window.clearTimeout(timerId)
    }
  }, [
    user,
    uiSettingsHydrated,
    themeMode,
    sidebarScale,
    chatBackground,
    accentPaletteId,
    hoverPaletteId,
    messageBoxPaletteId,
    learnPathTitleColorMode,
    assistantEmojisEnabled,
    updateUiSettings,
  ])

  useEffect(() => {
    writeAssistantEmojisEnabled(assistantEmojisEnabled)
  }, [assistantEmojisEnabled])

  useEffect(() => {
    const baseTheme = themeMode === 'light' ? 'light' : 'dark'
    document.documentElement.dataset.theme = baseTheme
    document.documentElement.dataset.themeVariant = themeModeToDatasetVariant(themeMode)
    window.localStorage.setItem('straton-theme', themeMode)
    syncThemeColorMeta()
  }, [themeMode])

  useEffect(() => {
    applySidebarPreferenceToDocument(sidebarScale)
    if (!isNarrowSettings) {
      persistSidebarPreferenceToStorage(sidebarScale)
    }
  }, [sidebarScale, isNarrowSettings])

  useEffect(() => {
    document.documentElement.dataset.chatBackground = chatBackground
    window.localStorage.setItem('straton-chat-background', chatBackground)
  }, [chatBackground])

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

  useEffect(() => {
    if (activeSection !== 'account') {
      return
    }
    let isMounted = true
    async function loadVisiblePlans() {
      try {
        setIsLoadingVisibleSubscriptionPlans(true)
        const plans = await listVisibleSubscriptionPlans()
        if (isMounted) {
          setVisibleSubscriptionPlans(plans)
        }
      } catch {
        if (isMounted) {
          setVisibleSubscriptionPlans([])
        }
      } finally {
        if (isMounted) {
          setIsLoadingVisibleSubscriptionPlans(false)
        }
      }
    }
    void loadVisiblePlans()
    return () => {
      isMounted = false
    }
  }, [activeSection])

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

  function handleToggleAssistantEmojis() {
    setAssistantEmojisEnabled((v) => !v)
  }

  async function handleToggleAutoRemoveEmptyChats() {
    try {
      setIsUpdatingChatSetting(true)
      await updateAutoRemoveEmptyChats(!autoRemoveEmptyChats)
    } finally {
      setIsUpdatingChatSetting(false)
    }
  }

  async function handleToggleAiChatMemory() {
    if (!user) {
      return
    }
    const enabled = profile?.ai_chat_memory_enabled !== false
    try {
      setIsUpdatingChatSetting(true)
      await updateAiChatMemory({ ai_chat_memory_enabled: !enabled })
    } finally {
      setIsUpdatingChatSetting(false)
    }
  }

  async function handleClearAiChatMemory() {
    if (!user) {
      return
    }
    try {
      setIsUpdatingChatSetting(true)
      await updateAiChatMemory({ ai_chat_memory: null })
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

  function handleMobileSettingsBack() {
    setMobileStack('menu')
  }

  const layoutNarrow = variant === 'sheet' || isNarrowSettings

  const settingsSidebar = (
    <aside
      className="settings-sidebar"
      aria-hidden={layoutNarrow && mobileStack === 'detail' ? true : undefined}
    >
      {layoutNarrow ? (
        <div className="settings-sidebar-mobile-header">
          <h2 className="settings-sidebar-mobile-heading">{i18n.settingsScreenTitle}</h2>
          {mobileStack === 'menu' && variant !== 'sheet' ? (
            <button type="button" className="settings-close-button" onClick={onClose} aria-label={i18n.closeLabel}>
              <span className="ui-icon settings-close-icon" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : (
        <h2>{i18n.menuTitle}</h2>
      )}
      <nav className="settings-menu">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`settings-menu-item ${activeSection === section.id ? 'is-active' : ''}`}
            onClick={() => {
              setActiveSection(section.id)
              if (layoutNarrow) {
                setMobileStack('detail')
              }
            }}
          >
            {section.icon ? (
              <img className="ui-icon settings-menu-icon" src={section.icon} alt="" aria-hidden="true" />
            ) : null}
            {section.label}
          </button>
        ))}
      </nav>
    </aside>
  )

  const settingsMain = (
    <div className="settings-content">
      <header className="settings-titlebar">
        <ModalHeader
          title={activeSectionConfig.title}
          headingLevel="h1"
          onClose={onClose}
          closeLabel={i18n.closeLabel}
          onBack={layoutNarrow && mobileStack === 'detail' ? handleMobileSettingsBack : undefined}
          backLabel={i18n.backLabel}
          showCloseButton={variant !== 'sheet'}
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
        {activeSection === 'personalize' ? (
          <PersonalizeSettingsSection
            themeMode={themeMode}
            sidebarScale={sidebarScale}
            chatBackground={chatBackground}
            accentPaletteId={accentPaletteId}
            hoverPaletteId={hoverPaletteId}
            messageBoxPaletteId={messageBoxPaletteId}
            learnPathTitleColorMode={learnPathTitleColorMode}
            onChangeThemeMode={setThemeMode}
            onChangeSidebarScale={setSidebarScale}
            onChangeChatBackground={setChatBackground}
            onChangeAccentPalette={setAccentPaletteId}
            onChangeHoverPalette={setHoverPaletteId}
            onChangeMessageBoxPalette={setMessageBoxPaletteId}
            onChangeLearnPathTitleColorMode={setLearnPathTitleColorMode}
            showSidebarScaleOption={!isNarrowSettings}
          />
        ) : null}
        {activeSection === 'chat' ? (
          <ChatSettingsSection
            language={language}
            assistantEmojisEnabled={assistantEmojisEnabled}
            onToggleAssistantEmojis={handleToggleAssistantEmojis}
            autoRemoveEmptyChats={autoRemoveEmptyChats}
            isUpdatingChatSetting={isUpdatingChatSetting}
            isCleaningEmptyChats={isCleaningEmptyChats}
            chatCleanupInfo={chatCleanupInfo}
            disableCleanup={!user}
            onToggleAutoRemoveEmptyChats={handleToggleAutoRemoveEmptyChats}
            onCleanupEmptyChats={handleCleanupEmptyChats}
            aiChatMemoryEnabled={profile?.ai_chat_memory_enabled !== false}
            hasAiChatMemoryNotes={Boolean((profile?.ai_chat_memory ?? '').trim())}
            disableAiChatMemoryActions={!user || isUpdatingChatSetting}
            onToggleAiChatMemory={handleToggleAiChatMemory}
            onClearAiChatMemory={handleClearAiChatMemory}
          />
        ) : null}
        {activeSection === 'invitations' ? <ChatInvitationsSection userId={user?.id} /> : null}
        {activeSection === 'status' ? (
          <ErrorStatusSettingsSection
            language={language}
            isConfigured={isConfigured}
            isAuthLoading={isLoading}
            appError={error}
            hasUser={Boolean(user)}
          />
        ) : null}
        {activeSection === 'feedback' ? (
          <FeedbackSettingsSection
            language={language}
            userEmail={user?.email ?? null}
            authorFirstName={profile?.first_name ?? null}
            authorLastName={profile?.last_name ?? null}
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
            subscriptionPlan={profile?.subscription_plans ?? null}
            subscriptionUsage={profile?.subscription_usages ?? null}
            isSavingAccount={isSavingAccount}
            isSavingEmail={isSavingEmail}
            isAvatarBusy={isAvatarBusy}
            avatarError={avatarError}
            disableAvatarActions={!isConfigured || !user}
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
            onOpenPlansModal={() => setIsPlansModalOpen(true)}
            onAvatarFileSelected={handleAvatarFileSelected}
            onRemoveAvatar={handleRemoveAvatar}
          />
        ) : null}
      </section>
    </div>
  )

  return (
    <>
      {variant === 'sheet' ? (
        <div className="settings-sheet-embed settings-modal settings-modal--mobile-nav settings-modal--sheet-embed">
          <div
            className={`settings-mobile-slide-track ${mobileStack === 'detail' ? 'is-showing-detail' : ''}`}
          >
            {settingsSidebar}
            {settingsMain}
          </div>
        </div>
      ) : (
        <section
          className={`settings-modal${layoutNarrow ? ' settings-modal--mobile-nav' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label="Einstellungen"
        >
          {layoutNarrow ? (
            <div
              className={`settings-mobile-slide-track ${mobileStack === 'detail' ? 'is-showing-detail' : ''}`}
            >
              {settingsSidebar}
              {settingsMain}
            </div>
          ) : (
            <>
              {settingsSidebar}
              {settingsMain}
            </>
          )}
        </section>
      )}
      <ModalShell
        isOpen={isPlansModalOpen}
        className="account-subscription-overlay"
        onRequestClose={() => setIsPlansModalOpen(false)}
      >
        <section className="settings-modal account-subscription-modal" role="dialog" aria-modal="true" aria-label="Abo Modelle">
          <div className="settings-content">
            <header className="settings-titlebar">
              <ModalHeader
                title="Abo-Modelle"
                headingLevel="h3"
                onClose={() => setIsPlansModalOpen(false)}
                closeLabel="Abo-Modelle schließen"
              />
            </header>
            <section className="settings-body">
              {isLoadingVisibleSubscriptionPlans ? <p>Lade Abo-Modelle...</p> : null}
              {!isLoadingVisibleSubscriptionPlans && visibleSubscriptionPlans.length === 0 ? (
                <p className="account-settings-subscription-hint">Aktuell sind keine Abo-Modelle sichtbar geschaltet.</p>
              ) : null}
              {!isLoadingVisibleSubscriptionPlans ? (
                <div className="account-subscription-plans-grid">
                  {visibleSubscriptionPlans.map((plan) => (
                    <article key={plan.id} className="settings-card account-subscription-plan-card">
                      <h3 className="admin-system-prompt-title">{plan.name}</h3>
                      <p className="admin-subscriptions-meta">
                        Tokens: {plan.max_tokens ?? 'unbegrenzt'} · Bilder: {plan.max_images ?? 'unbegrenzt'} · Dateien:{' '}
                        {plan.max_files ?? 'unbegrenzt'}
                      </p>
                      <div className="account-subscription-plan-actions">
                        <SecondaryButton type="button">Kaufen</SecondaryButton>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          </div>
        </section>
      </ModalShell>
    </>
  )
}
