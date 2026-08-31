import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { SecondaryButton } from '../components/ui/buttons/SecondaryButton'
import { ModalHeader } from '../components/ui/modal/ModalHeader'
import { ModalShell } from '../components/ui/modal/ModalShell'
import { AccountSettingsSection } from '../features/settings/components/AccountSettingsSection'
import { BillingSettingsSection } from '../features/settings/components/BillingSettingsSection'
import { FeedbackSettingsSection } from '../features/settings/components/FeedbackSettingsSection'
import { GeneralSettingsSection } from '../features/settings/components/GeneralSettingsSection'
import { IntroductionSettingsSection } from '../features/settings/components/IntroductionSettingsSection'
import type { IntroductionEditorValue } from '../features/settings/components/IntroductionEditor'
import { PersonalizeSettingsSection } from '../features/settings/components/PersonalizeSettingsSection'
import { SecuritySettingsSection } from '../features/settings/components/SecuritySettingsSection'
import { StratonSettingsSection } from '../features/settings/components/StratonSettingsSection'
import { useAuth } from '../features/auth/context/useAuth'
import {
  normalizeIntroductionText,
  parseUserIntroductionAnswers,
} from '../features/auth/constants/userIntroduction'
import { labelForSubscriptionImageGenerationModel } from '../features/auth/constants/subscriptionImageGenerationModels'
import { listVisibleSubscriptionPlans, type VisibleSubscriptionPlan } from '../features/auth/services/subscriptionCatalog.service'
import { SETTINGS_SECTION_IDS, type SettingsSectionId } from '../features/settings/constants/settingsSections'
import { buildSettingsPageI18n } from '../features/settings/utils/settingsPageI18n'
import { useAccountProfileSettings } from '../features/settings/hooks/useAccountProfileSettings'
import { useGeneralSettingsPrefs } from '../features/settings/hooks/useGeneralSettingsPrefs'
import { useSettingsLanguage } from '../features/settings/hooks/useSettingsLanguage'
import { useSettingsUiPreferences } from '../features/settings/hooks/useSettingsUiPreferences'
import { cssUrl } from '../utils/assetUrl'

export { SETTINGS_SECTION_IDS, type SettingsSectionId }

type SettingsModalProps = {
  onClose: () => void
  /** Beim Öffnen (z. B. aus Mobile-Profil-Sheet) direkt diese Sektion anzeigen. */
  initialSection?: SettingsSectionId
  /**
   * `modal`: Desktop-Overlay (settings-modal), aktuell ungenutzt (siehe `embedded`).
   * `sheet`: Nur Inhalt fürs ProfileFullSheet — gleiche Sheet-Seite wie Profil, kein zweites Overlay.
   * `embedded`: Im rechten Chat-Hauptbereich integriert statt als Modal (siehe `.chat-main.is-settings-active`,
   * chat-settings-workspace.css) — gleiche Sidebar+Content-Struktur wie `modal`, nur ohne Karten-Chrome
   * (kein Rahmen/Schatten/Backdrop), da die Fläche bereits vom umgebenden Chat-Layout kommt.
   */
  variant?: 'modal' | 'sheet' | 'embedded'
  /**
   * Nur `variant="embedded"`: steuert die Fade-Animation von aussen (siehe `ChatPage.tsx`, das die
   * Komponente noch kurz weiter mountet, um die Ausblend-Animation abspielen zu lassen). Andere
   * Varianten laufen über ihre eigene Sheet-/Modal-Animation und ignorieren die Prop.
   */
  isVisible?: boolean
}

export function SettingsModal({
  onClose,
  initialSection = 'general',
  variant = 'modal',
  isVisible = true,
}: SettingsModalProps) {
  const stratonMenuIcon = `${import.meta.env.BASE_URL}assets/logo/Straton.png`
  const {
    user,
    profile,
    isConfigured,
    updateAutoRemoveEmptyChats,
    updateAutoRemoveEmptyLearningPaths,
    updateProfileNames,
    uploadProfileAvatar,
    removeProfileAvatar,
    updateLanguage,
    updateEmail,
    updateUiSettings,
    updateUserIntroduction,
    logout,
  } = useAuth()
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(initialSection)
  /* Liegt hier statt in `SecuritySettingsSection`, damit ein Klick auf den (dann nicht mehr als
     aktiv markierten) "Sicherheit & Login"-Tab die Passwort-ändern-Ansicht wieder schliessen kann. */
  const [isSecurityPasswordEditing, setIsSecurityPasswordEditing] = useState(false)
  const [menuSearchQuery, setMenuSearchQuery] = useState('')
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
  const [savedIndicatorVisible, setSavedIndicatorVisible] = useState(false)
  const savedIndicatorHideTimerRef = useRef<number | null>(null)
  const [visibleSubscriptionPlans, setVisibleSubscriptionPlans] = useState<VisibleSubscriptionPlan[]>([])
  const [isLoadingVisibleSubscriptionPlans, setIsLoadingVisibleSubscriptionPlans] = useState(false)
  const [isPlansModalOpen, setIsPlansModalOpen] = useState(false)

  /** Blendet den dezenten "Gespeichert"-Hinweis im Header kurz ein — für jede Einstellung nutzbar,
      die im Hintergrund automatisch gespeichert wird (UI-Settings, Sprache, Profilname, Toggles). */
  function triggerSavedIndicator() {
    if (savedIndicatorHideTimerRef.current !== null) {
      window.clearTimeout(savedIndicatorHideTimerRef.current)
    }
    setSavedIndicatorVisible(true)
    savedIndicatorHideTimerRef.current = window.setTimeout(() => {
      setSavedIndicatorVisible(false)
      savedIndicatorHideTimerRef.current = null
    }, 1800)
  }

  useEffect(() => {
    return () => {
      if (savedIndicatorHideTimerRef.current !== null) {
        window.clearTimeout(savedIndicatorHideTimerRef.current)
      }
    }
  }, [])

  const accountProfile = useAccountProfileSettings({
    user,
    profile,
    isConfigured,
    activeSection,
    updateProfileNames,
    uploadProfileAvatar,
    removeProfileAvatar,
    updateEmail,
    onSaved: triggerSavedIndicator,
  })

  const generalPrefs = useGeneralSettingsPrefs({
    user,
    profile,
    updateAutoRemoveEmptyChats,
    updateAutoRemoveEmptyLearningPaths,
    onSaved: triggerSavedIndicator,
  })

  const { language, handleChangeLanguage } = useSettingsLanguage({
    profile,
    updateLanguage,
    onSaved: triggerSavedIndicator,
  })

  const uiPreferences = useSettingsUiPreferences({
    user,
    profile,
    isNarrowSettings,
    updateUiSettings,
    onSaved: triggerSavedIndicator,
  })

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

  const { i18n, sections } = buildSettingsPageI18n(language, stratonMenuIcon)

  const activeSectionConfig = sections.find((section) => section.id === activeSection) ?? sections[0]
  const normalizedMenuSearchQuery = menuSearchQuery.trim().toLocaleLowerCase()
  const filteredSections = normalizedMenuSearchQuery
    ? sections.filter((section) => section.label.toLocaleLowerCase().includes(normalizedMenuSearchQuery))
    : sections
  async function handleSaveIntroduction(value: IntroductionEditorValue) {
    await updateUserIntroduction({
      introduction_completed: true,
      introduction_mode: value.mode,
      introduction_text: normalizeIntroductionText(value.text) || null,
      introduction_answers: parseUserIntroductionAnswers(value.answers),
    })
  }

  useEffect(() => {
    if (activeSection !== 'billing') {
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

  function handleMobileSettingsBack() {
    setMobileStack('menu')
  }

  async function handleLogoutFromMenu() {
    await logout()
    onClose()
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
        <div className="settings-menu-search-shell">
          <input
            type="search"
            className="settings-menu-search squircle"
            placeholder={i18n.searchPlaceholder}
            aria-label={i18n.searchAriaLabel}
            value={menuSearchQuery}
            onChange={(event) => setMenuSearchQuery(event.target.value)}
          />
          <svg
            className="settings-menu-search-icon"
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      )}
      <nav className="settings-menu">
        {!layoutNarrow && filteredSections.length === 0 ? (
          <p className="settings-menu-empty">{i18n.searchNoResults}</p>
        ) : null}
        {(layoutNarrow ? sections : filteredSections).map((section, index) => (
          <button
            key={section.id}
            type="button"
            className={`settings-menu-item ${
              activeSection === section.id && !(section.id === 'security' && isSecurityPasswordEditing)
                ? 'is-active'
                : ''
            }`}
            style={{ '--settings-menu-item-index': index } as CSSProperties}
            onClick={() => {
              if (section.id === 'security') {
                setIsSecurityPasswordEditing(false)
              }
              setActiveSection(section.id)
              if (layoutNarrow) {
                setMobileStack('detail')
              }
            }}
          >
            {section.icon ? (
              <span
                className="settings-menu-icon"
                style={
                  {
                    '--settings-menu-icon-src': cssUrl(section.icon),
                    ...(section.iconActive
                      ? { '--settings-menu-icon-src-active': cssUrl(section.iconActive) }
                      : null),
                  } as CSSProperties
                }
                aria-hidden="true"
              />
            ) : null}
            {section.label}
          </button>
        ))}
        {user ? (
          <button
            type="button"
            className="settings-menu-item settings-menu-item--logout"
            style={{ '--settings-menu-item-index': sections.length } as CSSProperties}
            onClick={() => void handleLogoutFromMenu()}
          >
            <svg
              className="settings-menu-logout-icon"
              width={20}
              height={20}
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M8.90002 7.55999C9.21002 3.95999 11.06 2.48999 15.11 2.48999H15.24C19.71 2.48999 21.5 4.27999 21.5 8.74999V15.27C21.5 19.74 19.71 21.53 15.24 21.53H15.11C11.09 21.53 9.24002 20.08 8.91002 16.54"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M15 12H3.62" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path
                d="M5.85 8.6499L2.5 11.9999L5.85 15.3499"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {i18n.logoutMenuLabel}
          </button>
        ) : null}
      </nav>
    </aside>
  )

  /* Desktop-Kopfzeile: läuft als eigene Grid-Zeile über Schiene und Inhaltsfläche hinweg, deshalb
     direktes Kind von `.settings-modal` und nicht Teil von `.settings-content`. Im schmalen Layout
     übernimmt weiterhin der `ModalHeader` in `.settings-titlebar`. */
  const settingsBreadcrumb = (
    <header className="settings-breadcrumb-bar">
      <h1 className="settings-breadcrumb-title">{i18n.settingsScreenTitle}</h1>
      <span className="settings-breadcrumb-chevron" aria-hidden="true" />
      <span className="settings-breadcrumb-current">{activeSectionConfig.label}</span>
      {savedIndicatorVisible ? (
        <div className="settings-save-indicator settings-save-indicator--breadcrumb" role="status" aria-live="polite">
          <span>Gespeichert</span>
          <span className="settings-save-indicator-spinner" aria-hidden="true" />
        </div>
      ) : null}
      <button
        type="button"
        className="settings-close-button settings-close-button--breadcrumb"
        onClick={onClose}
        aria-label={i18n.closeLabel}
      >
        <span className="ui-icon settings-close-icon" aria-hidden="true" />
      </button>
    </header>
  )

  const settingsMain = (
    <div className={`settings-content${layoutNarrow ? '' : ' settings-content--no-header'}`}>
      {layoutNarrow ? (
        <header className="settings-titlebar">
          <ModalHeader
            title={activeSectionConfig.title}
            headingLevel="h1"
            onClose={onClose}
            closeLabel={i18n.closeLabel}
            onBack={mobileStack === 'detail' ? handleMobileSettingsBack : undefined}
            backLabel={i18n.backLabel}
            showCloseButton={variant !== 'sheet'}
          />
          {savedIndicatorVisible ? (
            <div className="settings-save-indicator" role="status" aria-live="polite">
              <span>Gespeichert</span>
              <span className="settings-save-indicator-spinner" aria-hidden="true" />
            </div>
          ) : null}
        </header>
      ) : null}

      <section className="settings-body">
        {activeSection === 'general' ? (
          <GeneralSettingsSection
            language={language}
            onChangeLanguage={handleChangeLanguage}
            chatFoldersFeatureEnabled={generalPrefs.chatFoldersFeatureEnabled}
            desktopFoldersInSidebar={uiPreferences.desktopFoldersInSidebar}
            onToggleDesktopFoldersInSidebar={uiPreferences.handleToggleDesktopFoldersInSidebar}
            autoRemoveEmptyChats={generalPrefs.autoRemoveEmptyChats}
            isUpdatingChatSetting={generalPrefs.isUpdatingChatSetting}
            autoRemoveEmptyLearningPaths={generalPrefs.autoRemoveEmptyLearningPaths}
            isUpdatingLearningPathSetting={generalPrefs.isUpdatingLearningPathSetting}
            isCleaningEmptyChats={generalPrefs.isCleaningEmptyChats}
            chatCleanupInfo={generalPrefs.chatCleanupInfo}
            disableCleanup={!user}
            onToggleAutoRemoveEmptyChats={generalPrefs.handleToggleAutoRemoveEmptyChats}
            onToggleAutoRemoveEmptyLearningPaths={generalPrefs.handleToggleAutoRemoveEmptyLearningPaths}
            onCleanupEmptyChats={generalPrefs.handleCleanupEmptyChats}
          />
        ) : null}
        {activeSection === 'straton' ? <StratonSettingsSection /> : null}
        {activeSection === 'personalize' ? (
          <PersonalizeSettingsSection
            themeMode={uiPreferences.themeMode}
            sidebarScale={uiPreferences.sidebarScale}
            chatBackground={uiPreferences.chatBackground}
            accentPaletteId={uiPreferences.accentPaletteId}
            mobileComposerCompact={uiPreferences.mobileComposerCompact}
            onChangeThemeMode={uiPreferences.handleChangeThemeMode}
            onChangeSidebarScale={uiPreferences.handleChangeSidebarScale}
            onChangeChatBackground={uiPreferences.handleChangeChatBackground}
            onChangeAccentPalette={uiPreferences.handleChangeAccentPalette}
            onChangeMobileComposerCompact={uiPreferences.handleChangeMobileComposerCompact}
            showSidebarScaleOption={!isNarrowSettings}
          />
        ) : null}
        {activeSection === 'introduction' ? (
          <IntroductionSettingsSection
            profile={profile}
            disableActions={!isConfigured || !user}
            onSaveIntroduction={handleSaveIntroduction}
          />
        ) : null}
        {activeSection === 'feedback' ? (
          <FeedbackSettingsSection
            language={language}
            userId={user?.id ?? null}
            userEmail={user?.email ?? null}
            authorFirstName={profile?.first_name ?? null}
            authorLastName={profile?.last_name ?? null}
            hasUser={Boolean(user)}
          />
        ) : null}
        {activeSection === 'security' ? (
          <SecuritySettingsSection
            isEditingPassword={isSecurityPasswordEditing}
            onEditingPasswordChange={setIsSecurityPasswordEditing}
          />
        ) : null}
        {activeSection === 'account' ? (
          <AccountSettingsSection
            firstNameDraft={accountProfile.firstNameDraft}
            lastNameDraft={accountProfile.lastNameDraft}
            emailDraft={accountProfile.emailDraft}
            currentEmail={user?.email ?? ''}
            pendingNewEmail={user?.new_email ?? null}
            avatarUrl={profile?.avatar_url ?? null}
            isSavingAccount={accountProfile.isSavingAccount}
            isSavingEmail={accountProfile.isSavingEmail}
            isAvatarBusy={accountProfile.isAvatarBusy}
            avatarError={accountProfile.avatarError}
            disableAvatarActions={!isConfigured || !user}
            emailSaveDisabled={!isConfigured || !user}
            emailMessage={accountProfile.emailMessage}
            emailError={accountProfile.emailError}
            onFirstNameChange={accountProfile.setFirstNameDraft}
            onLastNameChange={accountProfile.setLastNameDraft}
            onEmailChange={accountProfile.handleEmailDraftChange}
            onSaveEmail={accountProfile.handleSaveEmail}
            onAvatarFileSelected={accountProfile.handleAvatarFileSelected}
            onRemoveAvatar={accountProfile.handleRemoveAvatar}
          />
        ) : null}
        {activeSection === 'billing' ? (
          <BillingSettingsSection
            subscriptionPlan={profile?.subscription_plans ?? null}
            subscriptionUsage={profile?.subscription_usages ?? null}
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
      ) : variant === 'embedded' ? (
        <section
          className={`settings-modal settings-modal--embedded${
            layoutNarrow ? ' settings-modal--mobile-nav' : ' settings-modal--with-breadcrumb'
          }${isVisible ? ' is-panel-visible' : ''}`}
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
              {settingsBreadcrumb}
              {settingsSidebar}
              {settingsMain}
            </>
          )}
        </section>
      ) : (
        <section
          className={`settings-modal${
            layoutNarrow ? ' settings-modal--mobile-nav' : ' squircle-clip settings-modal--with-breadcrumb'
          }`}
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
              {settingsBreadcrumb}
              {settingsSidebar}
              {settingsMain}
              <span className="settings-modal-squircle-border squircle" aria-hidden="true" />
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
                        Tokens: {plan.max_tokens ?? 'unbegrenzt'} · Bilder:{' '}
                        {plan.max_images != null
                          ? `+${plan.max_images}/Tag auf Guthaben (max. 60)`
                          : 'unbegrenzt'}{' '}
                        · Dateien:{' '}
                        {plan.max_files ?? 'unbegrenzt'}
                        <br />
                        Bildgenerator: {labelForSubscriptionImageGenerationModel(plan.image_generation_model)}
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
