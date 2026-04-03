import { useEffect, useMemo, useState } from 'react'
import accountIcon from '../assets/icons/account.svg'
import aiIcon from '../assets/icons/ai.svg'
import cardsOutlineIcon from '../assets/icons/cards-outline.svg'
import generalIcon from '../assets/icons/general.svg'
import sendIcon from '../assets/icons/send.svg'
import { PrimaryButton } from '../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../components/ui/buttons/SecondaryButton'
import { ModalHeader } from '../components/ui/modal/ModalHeader'
import { ModalShell } from '../components/ui/modal/ModalShell'
import {
  DEFAULT_SYSTEM_PROMPTS,
  SYSTEM_PROMPT_KEYS,
  SYSTEM_PROMPT_LABELS,
  type SystemPromptKey,
} from '../config/systemPromptDefaults'
import {
  createSubscriptionPlan,
  deleteSubscriptionPlan,
  deploySubscriptionAssignmentDrafts,
  listAdminUsers,
  listSubscriptionAssignmentDrafts,
  listSubscriptionPlans,
  listSubscriptionPlanShowcaseSlots,
  saveSubscriptionAssignmentDraft,
  saveSubscriptionPlanShowcaseSlots,
  type AdminUser,
  type SubscriptionAssignmentDraftRow,
  type SubscriptionPlanRow,
  type SubscriptionPlanShowcaseSlotRow,
} from '../features/auth/services/admin.service'
import {
  adminSetBetaNoticeEnabled,
  getAppFeatureFlags,
} from '../features/auth/services/appFeatureFlags.service'
import {
  deleteUserFeedbackById,
  listUserFeedbackForAdmin,
  type UserFeedbackRow,
} from '../features/feedback/services/feedback.persistence'
import { useSystemPrompts } from '../features/systemPrompts/useSystemPrompts'
import { deleteSystemPromptOverride, upsertSystemPrompt } from '../features/systemPrompts/systemPrompts.service'

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message
  }
  if (typeof err === 'object' && err !== null) {
    const maybeMessage = Reflect.get(err, 'message')
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
      return maybeMessage
    }
  }
  return fallback
}

type AdminSectionId =
  | 'overview'
  | 'users'
  | 'subscriptions'
  | 'deployment'
  | 'roles'
  | 'aiProviders'
  | 'systemPrompts'
  | 'feedback'

type AdminSection = {
  id: AdminSectionId
  label: string
  title: string
  icon: string
}

const sections: AdminSection[] = [
  { id: 'overview', label: 'Uebersicht', title: 'Administrator Uebersicht', icon: generalIcon },
  { id: 'users', label: 'Nutzer', title: 'Nutzerverwaltung', icon: accountIcon },
  { id: 'subscriptions', label: 'Abonnements', title: 'Abonnements verwalten', icon: cardsOutlineIcon },
  { id: 'deployment', label: 'Deployment', title: 'Abo-Entwuerfe deployen', icon: sendIcon },
  { id: 'roles', label: 'Rollen', title: 'Rollen und Rechte', icon: accountIcon },
  { id: 'aiProviders', label: 'KI Provider', title: 'KI Provider konfigurieren', icon: aiIcon },
  { id: 'systemPrompts', label: 'KI Anweisungen', title: 'KI Systemanweisungen', icon: aiIcon },
  { id: 'feedback', label: 'Feedback', title: 'Nutzer-Feedback', icon: sendIcon },
]

type AdministratorModalProps = {
  onClose: () => void
}

export function AdministratorModal({ onClose }: AdministratorModalProps) {
  const [activeSection, setActiveSection] = useState<AdminSectionId>('overview')
  const { prompts, refresh, isLoading: promptsContextLoading } = useSystemPrompts()
  const [promptDrafts, setPromptDrafts] = useState<Record<SystemPromptKey, string>>(() => ({
    ...DEFAULT_SYSTEM_PROMPTS,
  }))
  const [promptSaveError, setPromptSaveError] = useState<string | null>(null)
  const [promptActionKey, setPromptActionKey] = useState<SystemPromptKey | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [feedbackItems, setFeedbackItems] = useState<UserFeedbackRow[]>([])
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(false)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [deletingFeedbackId, setDeletingFeedbackId] = useState<string | null>(null)
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlanRow[]>([])
  const [isLoadingSubscriptionPlans, setIsLoadingSubscriptionPlans] = useState(false)
  const [subscriptionPlansError, setSubscriptionPlansError] = useState<string | null>(null)
  const [newPlanName, setNewPlanName] = useState('')
  const [newPlanMaxTokens, setNewPlanMaxTokens] = useState('')
  const [newPlanMaxImages, setNewPlanMaxImages] = useState('')
  const [newPlanMaxFiles, setNewPlanMaxFiles] = useState('')
  const [isCreatePlanModalOpen, setIsCreatePlanModalOpen] = useState(false)
  const [isCreatingPlan, setIsCreatingPlan] = useState(false)
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null)
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null)
  const [subscriptionDrafts, setSubscriptionDrafts] = useState<Record<string, SubscriptionAssignmentDraftRow>>({})
  const [selectedDraftPlanByUser, setSelectedDraftPlanByUser] = useState<Record<string, string | null>>({})
  const [confirmDraftUserId, setConfirmDraftUserId] = useState<string | null>(null)
  const [isDeployingDrafts, setIsDeployingDrafts] = useState(false)
  const [showcaseSlots, setShowcaseSlots] = useState<Record<1 | 2 | 3, string>>({ 1: '', 2: '', 3: '' })
  const [isSavingShowcaseSlots, setIsSavingShowcaseSlots] = useState(false)
  const [betaNoticeEnabled, setBetaNoticeEnabled] = useState(true)
  const [isLoadingBetaNoticeToggle, setIsLoadingBetaNoticeToggle] = useState(false)

  const activeSectionConfig = useMemo(
    () => sections.find((section) => section.id === activeSection) ?? sections[0],
    [activeSection],
  )

  useEffect(() => {
    let isMounted = true
    void (async () => {
      try {
        const flags = await getAppFeatureFlags()
        if (!isMounted) {
          return
        }
        setBetaNoticeEnabled(flags.show_beta_notice_on_first_login)
      } catch {
        if (!isMounted) {
          return
        }
        setBetaNoticeEnabled(true)
      }
    })()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (activeSection !== 'users' && activeSection !== 'deployment') {
      return
    }

    let isMounted = true

    async function loadUsers() {
      try {
        setIsLoadingUsers(true)
        setUsersError(null)
        const nextUsers = await listAdminUsers()
        if (isMounted) {
          setUsers(nextUsers)
        }
      } catch (err) {
        if (isMounted) {
          setUsersError(getErrorMessage(err, 'Nutzer konnten nicht geladen werden.'))
        }
      } finally {
        if (isMounted) {
          setIsLoadingUsers(false)
        }
      }
    }

    void loadUsers()

    return () => {
      isMounted = false
    }
  }, [activeSection])

  useEffect(() => {
    if (activeSection !== 'subscriptions') {
      return
    }

    let isMounted = true

    async function loadShowcaseSlots() {
      try {
        const slots = await listSubscriptionPlanShowcaseSlots()
        if (!isMounted) {
          return
        }
        const nextSlots: Record<1 | 2 | 3, string> = { 1: '', 2: '', 3: '' }
        for (const slot of slots) {
          nextSlots[slot.slot_index] = slot.plan_id ?? ''
        }
        setShowcaseSlots(nextSlots)
      } catch (err) {
        if (!isMounted) {
          return
        }
        setSubscriptionPlansError(getErrorMessage(err, 'Sichtbare Abo-Modelle konnten nicht geladen werden.'))
      }
    }

    void loadShowcaseSlots()
    return () => {
      isMounted = false
    }
  }, [activeSection])

  useEffect(() => {
    if (activeSection !== 'users' && activeSection !== 'subscriptions' && activeSection !== 'deployment') {
      return
    }

    let isMounted = true

    async function loadSubscriptionPlansList() {
      try {
        setIsLoadingSubscriptionPlans(true)
        setSubscriptionPlansError(null)
        const rows = await listSubscriptionPlans()
        if (isMounted) {
          setSubscriptionPlans(rows)
        }
      } catch (err) {
        if (isMounted) {
          setSubscriptionPlansError(getErrorMessage(err, 'Abonnements konnten nicht geladen werden.'))
        }
      } finally {
        if (isMounted) {
          setIsLoadingSubscriptionPlans(false)
        }
      }
    }

    void loadSubscriptionPlansList()

    return () => {
      isMounted = false
    }
  }, [activeSection])

  useEffect(() => {
    if (activeSection !== 'users' && activeSection !== 'deployment') {
      return
    }

    let isMounted = true

    async function loadDrafts() {
      try {
        setSubscriptionPlansError(null)
        const rows = await listSubscriptionAssignmentDrafts()
        if (!isMounted) {
          return
        }
        const byUser: Record<string, SubscriptionAssignmentDraftRow> = {}
        for (const row of rows) {
          byUser[row.user_id] = row
        }
        setSubscriptionDrafts(byUser)
      } catch (err) {
        if (!isMounted) {
          return
        }
        setSubscriptionPlansError(getErrorMessage(err, 'Abo-Entwuerfe konnten nicht geladen werden.'))
      }
    }

    void loadDrafts()

    return () => {
      isMounted = false
    }
  }, [activeSection])

  useEffect(() => {
    if (activeSection !== 'feedback') {
      return
    }

    let isMounted = true

    async function loadFeedback() {
      try {
        setIsLoadingFeedback(true)
        setFeedbackError(null)
        const rows = await listUserFeedbackForAdmin()
        if (isMounted) {
          setFeedbackItems(rows)
        }
      } catch (err) {
        if (isMounted) {
          setFeedbackError(err instanceof Error ? err.message : 'Feedback konnte nicht geladen werden.')
        }
      } finally {
        if (isMounted) {
          setIsLoadingFeedback(false)
        }
      }
    }

    void loadFeedback()

    return () => {
      isMounted = false
    }
  }, [activeSection])

  useEffect(() => {
    if (activeSection !== 'systemPrompts') {
      return
    }
    setPromptDrafts({ ...prompts })
    setPromptSaveError(null)
  }, [activeSection, prompts])

  async function handleSaveSystemPrompt(key: SystemPromptKey) {
    setPromptActionKey(key)
    setPromptSaveError(null)
    try {
      await upsertSystemPrompt(key, promptDrafts[key] ?? '')
      await refresh()
    } catch (err) {
      setPromptSaveError(getErrorMessage(err, 'Speichern fehlgeschlagen.'))
    } finally {
      setPromptActionKey(null)
    }
  }

  async function handleResetSystemPrompt(key: SystemPromptKey) {
    setPromptActionKey(key)
    setPromptSaveError(null)
    try {
      await deleteSystemPromptOverride(key)
      await refresh()
    } catch (err) {
      setPromptSaveError(getErrorMessage(err, 'Zuruecksetzen fehlgeschlagen.'))
    } finally {
      setPromptActionKey(null)
    }
  }

  function parseOptionalNonNegativeInt(raw: string): number | null {
    const t = raw.trim()
    if (!t) {
      return null
    }
    const n = Number(t)
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      return null
    }
    return n
  }

  async function handleCreateSubscriptionPlan() {
    const name = newPlanName.trim()
    if (!name) {
      return
    }

    const maxTokens = parseOptionalNonNegativeInt(newPlanMaxTokens)
    const maxImages = parseOptionalNonNegativeInt(newPlanMaxImages)
    const maxFiles = parseOptionalNonNegativeInt(newPlanMaxFiles)

    if (newPlanMaxTokens.trim() && maxTokens === null) {
      setSubscriptionPlansError('Max Tokens muss eine ganze Zahl >= 0 sein (oder leer = unbegrenzt).')
      return
    }
    if (newPlanMaxImages.trim() && maxImages === null) {
      setSubscriptionPlansError('Max Bilder muss eine ganze Zahl >= 0 sein (oder leer = unbegrenzt).')
      return
    }
    if (newPlanMaxFiles.trim() && maxFiles === null) {
      setSubscriptionPlansError('Max Dateien muss eine ganze Zahl >= 0 sein (oder leer = unbegrenzt).')
      return
    }

    setSubscriptionPlansError(null)
    setIsCreatingPlan(true)
    try {
      const row = await createSubscriptionPlan({
        name,
        maxTokens,
        maxImages,
        maxFiles,
      })
      setSubscriptionPlans((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name, 'de')))

      setIsCreatePlanModalOpen(false)
      setNewPlanName('')
      setNewPlanMaxTokens('')
      setNewPlanMaxImages('')
      setNewPlanMaxFiles('')
    } catch (err) {
      setSubscriptionPlansError(getErrorMessage(err, 'Abo konnte nicht angelegt werden.'))
    } finally {
      setIsCreatingPlan(false)
    }
  }

  async function handleDeleteSubscriptionPlan(planId: string) {
    if (!window.confirm('Dieses Abo wirklich loeschen? Nutzer verlieren die Zuweisung (wird auf kein Abo gesetzt).')) {
      return
    }
    setSubscriptionPlansError(null)
    setDeletingPlanId(planId)
    try {
      await deleteSubscriptionPlan(planId)
      setSubscriptionPlans((prev) => prev.filter((p) => p.id !== planId))
      setUsers((prev) =>
        prev.map((u) =>
          u.subscription_plan_id === planId
            ? { ...u, subscription_plan_id: null, subscription_plan_name: null }
            : u,
        ),
      )
    } catch (err) {
      setSubscriptionPlansError(getErrorMessage(err, 'Abo konnte nicht geloescht werden.'))
    } finally {
      setDeletingPlanId(null)
    }
  }

  async function handleSaveUserSubscriptionDraft(userId: string, rawPlanId: string) {
    const planId = rawPlanId.trim() === '' ? null : rawPlanId
    setUsersError(null)
    setSubscriptionPlansError(null)
    setAssigningUserId(userId)
    try {
      await saveSubscriptionAssignmentDraft(userId, planId)
      const name = planId === null ? null : (subscriptionPlans.find((p) => p.id === planId)?.name ?? null)
      const nowIso = new Date().toISOString()
      setSubscriptionDrafts((prev) => ({
        ...prev,
        [userId]: {
          user_id: userId,
          subscription_plan_id: planId,
          subscription_plan_name: name,
          updated_at: nowIso,
          updated_by: 'current-admin',
        },
      }))
      setSelectedDraftPlanByUser((prev) => ({
        ...prev,
        [userId]: planId,
      }))
    } catch (err) {
      const msg = getErrorMessage(err, 'Entwurf konnte nicht gespeichert werden.')
      if (activeSection === 'users') {
        setUsersError(msg)
      } else {
        setSubscriptionPlansError(msg)
      }
    } finally {
      setAssigningUserId(null)
    }
  }

  async function handleDeploySubscriptionDrafts() {
    setSubscriptionPlansError(null)
    setIsDeployingDrafts(true)
    try {
      const deployedCount = await deploySubscriptionAssignmentDrafts()
      setUsers((prev) =>
        prev.map((u) => {
          const draft = subscriptionDrafts[u.id]
          if (!draft) {
            return u
          }
          return {
            ...u,
            subscription_plan_id: draft.subscription_plan_id,
            subscription_plan_name: draft.subscription_plan_name,
          }
        }),
      )
      setSubscriptionDrafts({})
      setSelectedDraftPlanByUser({})
      if (deployedCount === 0) {
        setSubscriptionPlansError('Keine Entwuerfe zum Deployen vorhanden.')
      }
    } catch (err) {
      setSubscriptionPlansError(getErrorMessage(err, 'Deployment fehlgeschlagen.'))
    } finally {
      setIsDeployingDrafts(false)
    }
  }

  async function handleSaveShowcaseSlots() {
    setSubscriptionPlansError(null)
    setIsSavingShowcaseSlots(true)
    try {
      const payload: SubscriptionPlanShowcaseSlotRow[] = [
        { slot_index: 1, plan_id: showcaseSlots[1] || null },
        { slot_index: 2, plan_id: showcaseSlots[2] || null },
        { slot_index: 3, plan_id: showcaseSlots[3] || null },
      ]
      await saveSubscriptionPlanShowcaseSlots(payload)
    } catch (err) {
      setSubscriptionPlansError(getErrorMessage(err, 'Sichtbare Abo-Modelle konnten nicht gespeichert werden.'))
    } finally {
      setIsSavingShowcaseSlots(false)
    }
  }

  async function handleDeleteFeedback(id: string) {
    if (!window.confirm('Diesen Feedback-Eintrag wirklich löschen?')) {
      return
    }
    setFeedbackError(null)
    setDeletingFeedbackId(id)
    try {
      await deleteUserFeedbackById(id)
      setFeedbackItems((prev) => prev.filter((row) => row.id !== id))
    } catch (err) {
      setFeedbackError(getErrorMessage(err, 'Loeschen fehlgeschlagen.'))
    } finally {
      setDeletingFeedbackId(null)
    }
  }

  async function handleToggleBetaNoticeEnabled(nextEnabled: boolean) {
    setSubscriptionPlansError(null)
    setIsLoadingBetaNoticeToggle(true)
    try {
      await adminSetBetaNoticeEnabled(nextEnabled)
      setBetaNoticeEnabled(nextEnabled)
    } catch (err) {
      setSubscriptionPlansError(getErrorMessage(err, 'Beta-Hinweis konnte nicht aktualisiert werden.'))
    } finally {
      setIsLoadingBetaNoticeToggle(false)
    }
  }

  function formatFeedbackAuthorName(row: UserFeedbackRow): string {
    const first = row.author_first_name?.trim() ?? ''
    const last = row.author_last_name?.trim() ?? ''
    const combined = [first, last].filter(Boolean).join(' ').trim()
    if (combined) {
      return combined
    }
    return '—'
  }

  function formatFeedbackDate(iso: string) {
    try {
      return new Date(iso).toLocaleString('de-CH', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    } catch {
      return iso
    }
  }

  function getUserLabel(user: AdminUser) {
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
    if (fullName) {
      return fullName
    }
    return user.email ?? user.id
  }

  function getUserLabelById(userId: string): string {
    const user = users.find((candidate) => candidate.id === userId)
    if (!user) {
      return userId
    }
    return getUserLabel(user)
  }

  function getSelectedPlanForUser(user: AdminUser): string {
    const localDraftSelection = selectedDraftPlanByUser[user.id]
    if (localDraftSelection !== undefined) {
      return localDraftSelection ?? ''
    }
    const persistedDraft = subscriptionDrafts[user.id]
    if (persistedDraft) {
      return persistedDraft.subscription_plan_id ?? ''
    }
    return user.subscription_plan_id ?? ''
  }

  function getSelectedPlanIdForUser(userId: string): string {
    const user = users.find((candidate) => candidate.id === userId)
    if (!user) {
      return ''
    }
    return getSelectedPlanForUser(user)
  }

  return (
    <section className="settings-modal" role="dialog" aria-modal="true" aria-label="Administrator">
      <aside className="settings-sidebar">
        <h2>Menue</h2>
        <nav className="settings-menu">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`settings-menu-item ${activeSection === section.id ? 'is-active' : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              <img className="ui-icon settings-menu-icon" src={section.icon} alt="" aria-hidden="true" />
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
            closeLabel="Administrator schliessen"
          />
        </header>

        <section className="settings-body">
          {activeSection === 'overview' ? (
            <article className="settings-card">
              <p>Hier kannst du administrative Aktionen und Systemstatus zentral verwalten.</p>
              <div className="chat-setting-row">
                <div className="chat-setting-copy">
                  <h3>Beta-Hinweis beim ersten Login anzeigen</h3>
                  <p>
                    Wenn aktiviert, erscheint nach Abschluss der Einstiegstour einmalig ein Beta-Hinweis für neue
                    Nutzer.
                  </p>
                </div>
                <button
                  type="button"
                  className={`ios-switch ${betaNoticeEnabled ? 'is-on' : ''}`}
                  role="switch"
                  aria-checked={betaNoticeEnabled}
                  aria-label="Beta-Hinweis beim ersten Login anzeigen"
                  disabled={isLoadingBetaNoticeToggle}
                  onClick={() => {
                    void handleToggleBetaNoticeEnabled(!betaNoticeEnabled)
                  }}
                >
                  <span className="ios-switch-track" aria-hidden="true">
                    <span className="ios-switch-thumb" />
                  </span>
                </button>
              </div>
            </article>
          ) : null}
          {activeSection === 'users' ? (
            <div className="admin-users-panel">
              <p className="admin-users-warning">
                Achtung: Aenderungen in diesem Bereich koennen kritische Berechtigungen beeinflussen. Bitte nur mit
                Vorsicht bearbeiten.
              </p>
              {usersError ? <p className="error-text">{usersError}</p> : null}
              {subscriptionPlansError ? <p className="error-text">{subscriptionPlansError}</p> : null}
              {isLoadingUsers ? <p>Lade Nutzer...</p> : null}
              {!isLoadingUsers ? (
                <div className="admin-users-list" role="list" aria-label="Nutzerliste">
                  {users.map((user) => (
                    <div key={user.id} className="admin-user-row" role="listitem">
                      <div className="admin-user-meta">
                        <p className="admin-user-name">{getUserLabel(user)}</p>
                        <p className="admin-user-email">{user.email ?? '-'}</p>
                      </div>
                      <div className="admin-user-actions">
                        <label className="admin-user-subscription-label" htmlFor={`admin-user-sub-${user.id}`}>
                          Abo
                        </label>
                        <select
                          id={`admin-user-sub-${user.id}`}
                          className="admin-user-subscription-select"
                          value={getSelectedPlanForUser(user)}
                          disabled={assigningUserId === user.id || isLoadingSubscriptionPlans || isDeployingDrafts}
                          aria-busy={assigningUserId === user.id}
                          onChange={(event) =>
                            setSelectedDraftPlanByUser((prev) => ({
                              ...prev,
                              [user.id]: event.target.value === '' ? null : event.target.value,
                            }))
                          }
                        >
                          <option value="">Kein Abo</option>
                          {subscriptionPlans.map((plan) => (
                            <option key={plan.id} value={plan.id}>
                              {plan.name}
                            </option>
                          ))}
                        </select>
                        <PrimaryButton
                          type="button"
                          disabled={assigningUserId === user.id || isLoadingSubscriptionPlans || isDeployingDrafts}
                          onClick={() => setConfirmDraftUserId(user.id)}
                        >
                          {assigningUserId === user.id ? 'Speichern…' : 'Speichern'}
                        </PrimaryButton>
                        {subscriptionDrafts[user.id] ? <span className="account-admin-badge">Entwurf</span> : null}
                        {user.is_superadmin ? <span className="account-admin-badge">Admin</span> : null}
                      </div>
                    </div>
                  ))}
                  {!usersError && users.length === 0 ? (
                    <p className="admin-user-empty">Keine Nutzer gefunden.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {activeSection === 'subscriptions' ? (
            <div className="admin-subscriptions-panel">
              <p className="admin-users-warning">
                Lege frei waehlbare Abo-Namen an und weise sie unter &quot;Nutzer&quot; einzelnen Konten zu.
              </p>
              {subscriptionPlansError ? <p className="error-text">{subscriptionPlansError}</p> : null}
              <div className="admin-subscriptions-create">
                <label htmlFor="admin-new-subscription-name" className="admin-subscriptions-field-label">
                  Neues Abo
                </label>
                <PrimaryButton
                  type="button"
                  disabled={isCreatingPlan}
                  onClick={() => {
                    setSubscriptionPlansError(null)
                    setIsCreatePlanModalOpen(true)
                  }}
                >
                  Abo anlegen
                </PrimaryButton>
              </div>
              {isLoadingSubscriptionPlans ? <p>Lade Abonnements…</p> : null}
              {!isLoadingSubscriptionPlans ? (
                <ul className="admin-subscriptions-list" aria-label="Definierte Abonnements">
                  {subscriptionPlans.map((plan) => (
                    <li key={plan.id} className="admin-subscriptions-row">
                      <div className="admin-subscriptions-info">
                        <span className="admin-subscriptions-name">{plan.name}</span>
                        <p className="admin-subscriptions-meta">
                          Tokens: {plan.max_tokens ?? 'unbegrenzt'} · Bilder: {plan.max_images ?? 'unbegrenzt'} · Dateien:{' '}
                          {plan.max_files ?? 'unbegrenzt'}
                        </p>
                      </div>
                      <SecondaryButton
                        type="button"
                        className="admin-subscriptions-delete"
                        disabled={deletingPlanId === plan.id}
                        onClick={() => void handleDeleteSubscriptionPlan(plan.id)}
                      >
                        {deletingPlanId === plan.id ? 'Loeschen…' : 'Loeschen'}
                      </SecondaryButton>
                    </li>
                  ))}
                </ul>
              ) : null}
              {!isLoadingSubscriptionPlans && subscriptionPlans.length === 0 ? (
                <p className="admin-user-empty">Noch keine Abonnements angelegt.</p>
              ) : null}
              <article className="settings-card">
                <h3 className="admin-system-prompt-title">Sichtbare Abo-Modelle fuer Nutzer</h3>
                <p className="admin-system-prompt-hint">
                  Bestimme hier die drei Abo-Modelle, die im Kauf-Modal der Nutzer sichtbar sind.
                </p>
                <div className="admin-subscriptions-create">
                  <label htmlFor="admin-showcase-slot-1" className="admin-subscriptions-field-label">
                    Modell 1
                  </label>
                  <select
                    id="admin-showcase-slot-1"
                    className="admin-user-subscription-select"
                    value={showcaseSlots[1]}
                    disabled={isSavingShowcaseSlots || isLoadingSubscriptionPlans}
                    onChange={(event) => setShowcaseSlots((prev) => ({ ...prev, 1: event.target.value }))}
                  >
                    <option value="">Nicht anzeigen</option>
                    {subscriptionPlans.map((plan) => (
                      <option key={`slot-1-${plan.id}`} value={plan.id}>
                        {plan.name}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="admin-showcase-slot-2" className="admin-subscriptions-field-label">
                    Modell 2
                  </label>
                  <select
                    id="admin-showcase-slot-2"
                    className="admin-user-subscription-select"
                    value={showcaseSlots[2]}
                    disabled={isSavingShowcaseSlots || isLoadingSubscriptionPlans}
                    onChange={(event) => setShowcaseSlots((prev) => ({ ...prev, 2: event.target.value }))}
                  >
                    <option value="">Nicht anzeigen</option>
                    {subscriptionPlans.map((plan) => (
                      <option key={`slot-2-${plan.id}`} value={plan.id}>
                        {plan.name}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="admin-showcase-slot-3" className="admin-subscriptions-field-label">
                    Modell 3
                  </label>
                  <select
                    id="admin-showcase-slot-3"
                    className="admin-user-subscription-select"
                    value={showcaseSlots[3]}
                    disabled={isSavingShowcaseSlots || isLoadingSubscriptionPlans}
                    onChange={(event) => setShowcaseSlots((prev) => ({ ...prev, 3: event.target.value }))}
                  >
                    <option value="">Nicht anzeigen</option>
                    {subscriptionPlans.map((plan) => (
                      <option key={`slot-3-${plan.id}`} value={plan.id}>
                        {plan.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="rename-actions">
                  <PrimaryButton
                    type="button"
                    disabled={isSavingShowcaseSlots || isLoadingSubscriptionPlans}
                    onClick={() => void handleSaveShowcaseSlots()}
                  >
                    {isSavingShowcaseSlots ? 'Speichern…' : 'Sichtbare Modelle speichern'}
                  </PrimaryButton>
                </div>
              </article>

              {isCreatePlanModalOpen ? (
                <ModalShell
                  isOpen={isCreatePlanModalOpen}
                  onRequestClose={() => {
                    setIsCreatePlanModalOpen(false)
                    setSubscriptionPlansError(null)
                  }}
                >
                  <section className="rename-modal" role="dialog" aria-modal="true" aria-label="Abo erstellen">
                    <ModalHeader
                      title="Abo erstellen"
                      headingLevel="h3"
                      className="rename-modal-header"
                      onClose={() => {
                        setIsCreatePlanModalOpen(false)
                        setSubscriptionPlansError(null)
                      }}
                      closeLabel="Abo erstellen schliessen"
                    />

                    <form
                      className="rename-form"
                      onSubmit={(event) => {
                        event.preventDefault()
                        void handleCreateSubscriptionPlan()
                      }}
                    >
                      <label htmlFor="admin-new-subscription-name">Name</label>
                      <input
                        id="admin-new-subscription-name"
                        type="text"
                        placeholder="z. B. Premium"
                        value={newPlanName}
                        maxLength={120}
                        onChange={(event) => setNewPlanName(event.target.value)}
                      />

                      <label htmlFor="admin-new-subscription-max-tokens">Max Tokens</label>
                      <input
                        id="admin-new-subscription-max-tokens"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        placeholder="leer = unbegrenzt"
                        value={newPlanMaxTokens}
                        onChange={(event) => setNewPlanMaxTokens(event.target.value)}
                      />

                      <label htmlFor="admin-new-subscription-max-images">Max Bilder</label>
                      <input
                        id="admin-new-subscription-max-images"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        placeholder="leer = unbegrenzt"
                        value={newPlanMaxImages}
                        onChange={(event) => setNewPlanMaxImages(event.target.value)}
                      />

                      <label htmlFor="admin-new-subscription-max-files">Max Dateien</label>
                      <input
                        id="admin-new-subscription-max-files"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        placeholder="leer = unbegrenzt"
                        value={newPlanMaxFiles}
                        onChange={(event) => setNewPlanMaxFiles(event.target.value)}
                      />

                      <div className="rename-actions">
                        <SecondaryButton
                          type="button"
                          disabled={isCreatingPlan}
                          onClick={() => {
                            setIsCreatePlanModalOpen(false)
                            setSubscriptionPlansError(null)
                          }}
                        >
                          Abbrechen
                        </SecondaryButton>
                        <PrimaryButton type="submit" disabled={isCreatingPlan || !newPlanName.trim()}>
                          {isCreatingPlan ? 'Speichern…' : 'Speichern'}
                        </PrimaryButton>
                      </div>
                    </form>
                  </section>
                </ModalShell>
              ) : null}
            </div>
          ) : null}
          {activeSection === 'deployment' ? (
            <div className="admin-subscriptions-panel">
              <p className="admin-users-warning">
                Erst ein Deployment macht gespeicherte Abo-Entwuerfe fuer Nutzer sichtbar.
              </p>
              {subscriptionPlansError ? <p className="error-text">{subscriptionPlansError}</p> : null}
              <ul className="admin-subscriptions-list" aria-label="Abo-Entwuerfe">
                {Object.values(subscriptionDrafts).map((draft) => {
                  return (
                    <li key={draft.user_id} className="admin-subscriptions-row">
                      <div className="admin-subscriptions-info">
                        <span className="admin-subscriptions-name">{getUserLabelById(draft.user_id)}</span>
                        <p className="admin-subscriptions-meta">
                          Entwurf: {draft.subscription_plan_name ?? 'Kein Abo'}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
              {Object.keys(subscriptionDrafts).length === 0 ? (
                <p className="admin-user-empty">Keine offenen Entwuerfe vorhanden.</p>
              ) : null}
              <PrimaryButton
                type="button"
                disabled={isDeployingDrafts || Object.keys(subscriptionDrafts).length === 0}
                onClick={() => void handleDeploySubscriptionDrafts()}
              >
                {isDeployingDrafts ? 'Deployment laeuft…' : 'Jetzt deployen'}
              </PrimaryButton>
            </div>
          ) : null}
          {activeSection === 'roles' ? (
            <article className="settings-card">
              <p>Hier kannst du Rollen, Zugriffe und Berechtigungskonzepte pflegen.</p>
            </article>
          ) : null}
          {activeSection === 'aiProviders' ? (
            <article className="settings-card">
              <p>
                KI-Provider-Keys werden aus Sicherheitsgruenden nicht mehr in der Datenbank gepflegt.
                Bitte nutze Supabase Secrets fuer die Edge Function.
              </p>
              <div className="admin-ai-form">
                <p>
                  Setze in Supabase unter <strong>Project Settings - Edge Functions - Secrets</strong>:
                </p>
                <ul className="settings-list">
                  <li>
                    <strong>OPENAI_API_KEY</strong>
                  </li>
                  <li>
                    <strong>ANTHROPIC_API_KEY</strong> (optional)
                  </li>
                </ul>
                <p>
                  Danach die Function <strong>chat-completion</strong> neu deployen. Das Frontend braucht keine
                  Provider-Secrets.
                </p>
              </div>
            </article>
          ) : null}
          {activeSection === 'feedback' ? (
            <div className="admin-feedback-panel">
              <p className="admin-users-warning">
                Hier siehst du Feedback, das Nutzer über die Einstellungen gesendet haben.
              </p>
              {feedbackError ? <p className="error-text">{feedbackError}</p> : null}
              {isLoadingFeedback ? <p>Lade Feedback…</p> : null}
              {!isLoadingFeedback && !feedbackError ? (
                <div className="admin-feedback-list" role="list" aria-label="Feedback Einträge">
                  {feedbackItems.map((row) => (
                    <article key={row.id} className="settings-card admin-feedback-card" role="listitem">
                      <div className="admin-feedback-header-row">
                        <div className="admin-feedback-person">
                          <p className="admin-feedback-name">{formatFeedbackAuthorName(row)}</p>
                          <p className="admin-feedback-email-line">{row.author_email ?? '—'}</p>
                        </div>
                        <div className="admin-feedback-header-aside">
                          <time className="admin-feedback-time" dateTime={row.created_at}>
                            {formatFeedbackDate(row.created_at)}
                          </time>
                          <SecondaryButton
                            type="button"
                            className="admin-feedback-delete-button"
                            disabled={deletingFeedbackId === row.id}
                            onClick={() => void handleDeleteFeedback(row.id)}
                          >
                            {deletingFeedbackId === row.id ? 'Löschen…' : 'Löschen'}
                          </SecondaryButton>
                        </div>
                      </div>
                      <p className="admin-feedback-userid">Nutzer-ID: {row.user_id}</p>
                      <p className="admin-feedback-body">{row.body}</p>
                    </article>
                  ))}
                  {feedbackItems.length === 0 ? <p className="admin-user-empty">Noch kein Feedback eingegangen.</p> : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {activeSection === 'systemPrompts' ? (
            <div className="admin-system-prompts-panel">
              <p className="admin-users-warning">
                Aenderungen gelten fuer alle angemeldeten Nutzer. Leere DB-Zeile = App nutzt Code-Standard nach
                &quot;Zuruecksetzen&quot;. Nach Migration bitte Tabelle <code>app_system_prompts</code> anlegen.
              </p>
              {promptSaveError ? <p className="error-text">{promptSaveError}</p> : null}
              {promptsContextLoading ? <p>Lade Anweisungen...</p> : null}
              <div className="admin-system-prompts-list">
                {SYSTEM_PROMPT_KEYS.map((key) => {
                  const meta = SYSTEM_PROMPT_LABELS[key]
                  const busy = promptActionKey === key
                  return (
                    <article key={key} className="settings-card admin-system-prompt-block">
                      <h3 className="admin-system-prompt-title">{meta.title}</h3>
                      <p className="admin-system-prompt-hint">{meta.hint}</p>
                      <textarea
                        className="admin-system-prompt-textarea"
                        rows={14}
                        spellCheck={false}
                        value={promptDrafts[key] ?? ''}
                        onChange={(event) =>
                          setPromptDrafts((prev) => ({
                            ...prev,
                            [key]: event.target.value,
                          }))
                        }
                        aria-label={meta.title}
                      />
                      <div className="admin-system-prompt-actions">
                        <PrimaryButton type="button" disabled={busy} onClick={() => void handleSaveSystemPrompt(key)}>
                          {busy ? 'Speichern…' : 'Speichern'}
                        </PrimaryButton>
                        <SecondaryButton
                          type="button"
                          disabled={busy}
                          onClick={() => void handleResetSystemPrompt(key)}
                        >
                          Standard wiederherstellen
                        </SecondaryButton>
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          ) : null}
        </section>
      </div>
      {confirmDraftUserId ? (
        <ModalShell isOpen={Boolean(confirmDraftUserId)} onRequestClose={() => setConfirmDraftUserId(null)}>
          <section className="rename-modal" role="dialog" aria-modal="true" aria-label="Entwurf speichern bestaetigen">
            <ModalHeader
              title="Abo als Entwurf speichern?"
              headingLevel="h3"
              className="rename-modal-header"
              onClose={() => setConfirmDraftUserId(null)}
              closeLabel="Bestaetigung schliessen"
            />
            <p>
              Diese Aenderung ist noch nicht live. Sie wird erst nach Deployment im Bereich &quot;Deployment&quot;
              sichtbar.
            </p>
            <div className="rename-actions">
              <SecondaryButton type="button" onClick={() => setConfirmDraftUserId(null)}>
                Abbrechen
              </SecondaryButton>
              <PrimaryButton
                type="button"
                onClick={() => {
                  const planId = getSelectedPlanIdForUser(confirmDraftUserId)
                  const userId = confirmDraftUserId
                  setConfirmDraftUserId(null)
                  void handleSaveUserSubscriptionDraft(userId, planId)
                }}
              >
                Als Entwurf speichern
              </PrimaryButton>
            </div>
          </section>
        </ModalShell>
      ) : null}
    </section>
  )
}
