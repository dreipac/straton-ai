import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
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
  adminCreateUser,
  adminDeleteUser,
  adminSetMustChangePasswordOnFirstLogin,
  adminSetUserProfileNames,
  createSubscriptionPlan,
  deleteSubscriptionPlan,
  updateSubscriptionPlan,
  deploySubscriptionAssignmentDrafts,
  listAdminAiTokenUsageLog,
  listAdminAiTokenUsageSummary,
  listAdminUserLastAiUsage,
  listAdminUsers,
  listSubscriptionAssignmentDrafts,
  listSubscriptionPlans,
  listSubscriptionPlanShowcaseSlots,
  saveSubscriptionAssignmentDraft,
  saveSubscriptionPlanShowcaseSlots,
  type AdminAiTokenUsageLogRow,
  type AdminAiTokenUsageRow,
  type AdminUserLastAiUsageRow,
  type AdminUser,
  type SubscriptionAssignmentDraftRow,
  type SubscriptionPlanRow,
  type SubscriptionPlanShowcaseSlotRow,
} from '../features/auth/services/admin.service'
import {
  SUBSCRIPTION_IMAGE_GENERATION_MODELS,
  labelForSubscriptionImageGenerationModel,
  parseSubscriptionImageGenerationModelId,
  type SubscriptionImageGenerationModelId,
} from '../features/auth/constants/subscriptionImageGenerationModels'
import { parseChatDailyTierOpenAiModelId } from '../features/chat/constants/chatDailyOpenAiTier'
import {
  CHAT_COMPOSER_MODELS,
  type ChatDailyTierOpenAiModelId,
  getComposerApiModelIdsForAdminFilter,
} from '../features/chat/constants/chatComposerModels'
import {
  adminSetBetaNoticeEnabled,
  adminSetDeployedAppVersion,
  getAppFeatureFlags,
} from '../features/auth/services/appFeatureFlags.service'
import {
  estimateAiTokenCostsUsd,
  formatUsdEstimate,
} from '../features/auth/utils/aiModelPricing'
import {
  deleteUserFeedbackById,
  listUserFeedbackForAdmin,
  type UserFeedbackRow,
} from '../features/feedback/services/feedback.persistence'
import { useAuth } from '../features/auth/context/useAuth'
import { useSystemPrompts } from '../features/systemPrompts/useSystemPrompts'
import { deleteSystemPromptOverride, upsertSystemPrompt } from '../features/systemPrompts/systemPrompts.service'

const OPENAI_CHAT_MODEL_OPTIONS = CHAT_COMPOSER_MODELS.filter((m) => m.provider === 'openai')

function formatSubscriptionPlanDailyTierSummary(plan: SubscriptionPlanRow): string {
  const t1 = parseChatDailyTierOpenAiModelId(plan.chat_daily_tier1_openai_model_id ?? null)
  const t2 = parseChatDailyTierOpenAiModelId(plan.chat_daily_tier2_openai_model_id ?? null)
  const b =
    typeof plan.chat_daily_tier1_token_budget === 'number' && Number.isFinite(plan.chat_daily_tier1_token_budget)
      ? Math.max(0, Math.floor(plan.chat_daily_tier1_token_budget))
      : 50_000
  const l1 = CHAT_COMPOSER_MODELS.find((m) => m.id === t1)?.label ?? t1
  const l2 = CHAT_COMPOSER_MODELS.find((m) => m.id === t2)?.label ?? t2
  return `OpenAI Tages-Staffel: erste ${b.toLocaleString('de-DE')} Nutzungs-Tokens → ${l1}, danach → ${l2}`
}

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
  | 'tokenUsage'
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
  { id: 'overview', label: 'Übersicht', title: 'Administrator Übersicht', icon: generalIcon },
  { id: 'users', label: 'Nutzer', title: 'Nutzerverwaltung', icon: accountIcon },
  { id: 'tokenUsage', label: 'KI-Tokens', title: 'KI Token-Verbrauch', icon: aiIcon },
  { id: 'subscriptions', label: 'Abonnements', title: 'Abonnements verwalten', icon: cardsOutlineIcon },
  { id: 'deployment', label: 'Deployment', title: 'Abo-Entwürfe deployen', icon: sendIcon },
  { id: 'roles', label: 'Rollen', title: 'Rollen und Rechte', icon: accountIcon },
  { id: 'aiProviders', label: 'KI Provider', title: 'KI Provider konfigurieren', icon: aiIcon },
  { id: 'systemPrompts', label: 'KI Anweisungen', title: 'KI Systemanweisungen', icon: aiIcon },
  { id: 'feedback', label: 'Feedback', title: 'Nutzer-Feedback', icon: sendIcon },
]

type AdministratorModalProps = {
  onClose: () => void
}

export function AdministratorModal({ onClose }: AdministratorModalProps) {
  const { user: currentAuthUser } = useAuth()
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
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserFirstName, setNewUserFirstName] = useState('')
  const [newUserLastName, setNewUserLastName] = useState('')
  const [newUserTemporaryPassword, setNewUserTemporaryPassword] = useState('')
  const [isCreatingUser, setIsCreatingUser] = useState(false)
  const [createUserInfo, setCreateUserInfo] = useState<string | null>(null)
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
  const [newPlanAllowModelChoice, setNewPlanAllowModelChoice] = useState(true)
  const [newPlanImageGenerationModel, setNewPlanImageGenerationModel] =
    useState<SubscriptionImageGenerationModelId>('gpt_image_1')
  const [newPlanTier1OpenAiModelId, setNewPlanTier1OpenAiModelId] =
    useState<ChatDailyTierOpenAiModelId>('gpt-5.4')
  const [newPlanTier1TokenBudget, setNewPlanTier1TokenBudget] = useState('50000')
  const [newPlanTier2OpenAiModelId, setNewPlanTier2OpenAiModelId] =
    useState<ChatDailyTierOpenAiModelId>('gpt-5.4-mini')
  const [isCreatePlanModalOpen, setIsCreatePlanModalOpen] = useState(false)
  const [isCreatingPlan, setIsCreatingPlan] = useState(false)
  const [editPlanDraft, setEditPlanDraft] = useState<{
    id: string
    name: string
    maxTokens: string
    maxImages: string
    maxFiles: string
    imageGenerationModel: SubscriptionImageGenerationModelId
    allowModelChoice: boolean
    tier1OpenAiModelId: ChatDailyTierOpenAiModelId
    tier1TokenBudget: string
    tier2OpenAiModelId: ChatDailyTierOpenAiModelId
  } | null>(null)
  const [isUpdatingPlan, setIsUpdatingPlan] = useState(false)
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null)
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null)
  const [userProfileNameDrafts, setUserProfileNameDrafts] = useState<
    Record<string, { first: string; last: string }>
  >({})
  const [savingProfileNamesUserId, setSavingProfileNamesUserId] = useState<string | null>(null)
  const [savingMustPwUserId, setSavingMustPwUserId] = useState<string | null>(null)
  const [subscriptionDrafts, setSubscriptionDrafts] = useState<Record<string, SubscriptionAssignmentDraftRow>>({})
  const [selectedDraftPlanByUser, setSelectedDraftPlanByUser] = useState<Record<string, string | null>>({})
  const [confirmDraftUserId, setConfirmDraftUserId] = useState<string | null>(null)
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null)
  const [deleteUserEmailConfirm, setDeleteUserEmailConfirm] = useState('')
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  const [isDeployingDrafts, setIsDeployingDrafts] = useState(false)
  const [showcaseSlots, setShowcaseSlots] = useState<Record<1 | 2 | 3, string>>({ 1: '', 2: '', 3: '' })
  const [isSavingShowcaseSlots, setIsSavingShowcaseSlots] = useState(false)
  const [betaNoticeEnabled, setBetaNoticeEnabled] = useState(true)
  const [isLoadingBetaNoticeToggle, setIsLoadingBetaNoticeToggle] = useState(false)
  const [deployedAppVersion, setDeployedAppVersion] = useState('')
  const [deployedAppVersionDraft, setDeployedAppVersionDraft] = useState('')
  const [isSavingDeployedAppVersion, setIsSavingDeployedAppVersion] = useState(false)
  const [deployedAppVersionInfo, setDeployedAppVersionInfo] = useState<string | null>(null)
  const [tokenUsageRows, setTokenUsageRows] = useState<AdminAiTokenUsageRow[]>([])
  const [tokenUsageLogRows, setTokenUsageLogRows] = useState<AdminAiTokenUsageLogRow[]>([])
  const [lastAiUsageRows, setLastAiUsageRows] = useState<AdminUserLastAiUsageRow[]>([])
  const [isLoadingTokenUsage, setIsLoadingTokenUsage] = useState(false)
  const [tokenUsageError, setTokenUsageError] = useState<string | null>(null)
  const [tokenUsageFilterOpen, setTokenUsageFilterOpen] = useState(false)
  const [tokenUsageFilterUserId, setTokenUsageFilterUserId] = useState('')
  const [tokenUsageFilterModel, setTokenUsageFilterModel] = useState('')
  const [tokenUsageFilterEmail, setTokenUsageFilterEmail] = useState('')
  const [tokenUsageFilterCostMin, setTokenUsageFilterCostMin] = useState('')
  const [tokenUsageFilterCostMax, setTokenUsageFilterCostMax] = useState('')

  const activeSectionConfig = useMemo(
    () => sections.find((section) => section.id === activeSection) ?? sections[0],
    [activeSection],
  )

  const deleteTargetUser = useMemo(
    () => (confirmDeleteUserId ? users.find((u) => u.id === confirmDeleteUserId) ?? null : null),
    [confirmDeleteUserId, users],
  )
  const deleteEmailMatches =
    Boolean(deleteTargetUser?.email) &&
    deleteUserEmailConfirm.trim().toLowerCase() === (deleteTargetUser?.email ?? '').trim().toLowerCase()

  const lastAiUsageSorted = useMemo(() => {
    return [...lastAiUsageRows].sort((a, b) => {
      const ta = new Date(a.last_used_at).getTime()
      const tb = new Date(b.last_used_at).getTime()
      return tb - ta
    })
  }, [lastAiUsageRows])

  const tokenUsageLogByUser = useMemo(() => {
    const map = new Map<string, AdminAiTokenUsageLogRow[]>()
    for (const row of tokenUsageLogRows) {
      const list = map.get(row.user_id) ?? []
      list.push(row)
      map.set(row.user_id, list)
    }
    for (const [, list] of map) {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }
    return map
  }, [tokenUsageLogRows])

  const tokenUsageLogUserIdsSorted = useMemo(() => {
    const ids = [...tokenUsageLogByUser.keys()]
    function labelFor(uid: string): string {
      const rows = tokenUsageLogByUser.get(uid)
      const head = rows?.[0]
      if (!head) {
        return uid
      }
      const name = [head.first_name, head.last_name].filter(Boolean).join(' ').trim()
      if (name) {
        return name
      }
      return head.email?.trim() ?? uid
    }
    ids.sort((a, b) => labelFor(a).localeCompare(labelFor(b), 'de'))
    return ids
  }, [tokenUsageLogByUser])

  const tokenUsageUserOptions = useMemo(() => {
    const byId = new Map<string, AdminAiTokenUsageRow>()
    for (const row of tokenUsageRows) {
      if (!byId.has(row.user_id)) {
        byId.set(row.user_id, row)
      }
    }
    return [...byId.values()].sort((a, b) => {
      const na = [a.first_name, a.last_name].filter(Boolean).join(' ').trim() || a.email?.trim() || a.user_id
      const nb = [b.first_name, b.last_name].filter(Boolean).join(' ').trim() || b.email?.trim() || b.user_id
      return na.localeCompare(nb, 'de')
    })
  }, [tokenUsageRows])

  const tokenUsageModelOptions = useMemo(() => {
    const ids = new Set<string>()
    for (const row of tokenUsageRows) {
      if (row.model) {
        ids.add(row.model)
      }
    }
    for (const id of getComposerApiModelIdsForAdminFilter()) {
      ids.add(id)
    }
    return [...ids].sort((a, b) => a.localeCompare(b, 'de'))
  }, [tokenUsageRows])

  const tokenUsageFiltersActive = useMemo(() => {
    return Boolean(
      tokenUsageFilterUserId ||
        tokenUsageFilterModel ||
        tokenUsageFilterEmail.trim() ||
        tokenUsageFilterCostMin.trim() ||
        tokenUsageFilterCostMax.trim(),
    )
  }, [
    tokenUsageFilterUserId,
    tokenUsageFilterModel,
    tokenUsageFilterEmail,
    tokenUsageFilterCostMin,
    tokenUsageFilterCostMax,
  ])

  const tokenUsageFilteredRows = useMemo(() => {
    const emailQ = tokenUsageFilterEmail.trim().toLowerCase()
    const rawMin = tokenUsageFilterCostMin.trim().replace(',', '.')
    const rawMax = tokenUsageFilterCostMax.trim().replace(',', '.')
    const costMin = rawMin === '' ? Number.NaN : Number.parseFloat(rawMin)
    const costMax = rawMax === '' ? Number.NaN : Number.parseFloat(rawMax)
    const hasCostMin = Number.isFinite(costMin)
    const hasCostMax = Number.isFinite(costMax)

    return tokenUsageRows.filter((row) => {
      if (tokenUsageFilterUserId && row.user_id !== tokenUsageFilterUserId) {
        return false
      }
      if (tokenUsageFilterModel && row.model !== tokenUsageFilterModel) {
        return false
      }
      if (emailQ && !(row.email ?? '').toLowerCase().includes(emailQ)) {
        return false
      }
      if (hasCostMin || hasCostMax) {
        const c = estimateAiTokenCostsUsd(row.provider, row.model, row.input_tokens, row.output_tokens)
        if (!c.known) {
          return false
        }
        if (hasCostMin && c.totalUsd < costMin) {
          return false
        }
        if (hasCostMax && c.totalUsd > costMax) {
          return false
        }
      }
      return true
    })
  }, [
    tokenUsageRows,
    tokenUsageFilterUserId,
    tokenUsageFilterModel,
    tokenUsageFilterEmail,
    tokenUsageFilterCostMin,
    tokenUsageFilterCostMax,
  ])

  const tokenUsageTotals = useMemo(() => {
    let input = 0
    let output = 0
    for (const row of tokenUsageFilteredRows) {
      input += row.input_tokens
      output += row.output_tokens
    }
    return { input, output, total: input + output }
  }, [tokenUsageFilteredRows])

  const tokenUsageCostTotals = useMemo(() => {
    let inputUsd = 0
    let outputUsd = 0
    let hasUnknownModel = false
    let hasKnownModel = false
    for (const row of tokenUsageFilteredRows) {
      const c = estimateAiTokenCostsUsd(row.provider, row.model, row.input_tokens, row.output_tokens)
      if (!c.known) {
        hasUnknownModel = true
        continue
      }
      hasKnownModel = true
      inputUsd += c.inputUsd
      outputUsd += c.outputUsd
    }
    return {
      inputUsd,
      outputUsd,
      totalUsd: inputUsd + outputUsd,
      hasUnknownModel,
      hasKnownModel,
    }
  }, [tokenUsageFilteredRows])

  useEffect(() => {
    let isMounted = true
    void (async () => {
      try {
        const flags = await getAppFeatureFlags()
        if (!isMounted) {
          return
        }
        setBetaNoticeEnabled(flags.show_beta_notice_on_first_login)
        const nextVersion = flags.deployed_app_version ?? ''
        setDeployedAppVersion(nextVersion)
        setDeployedAppVersionDraft(nextVersion)
      } catch {
        if (!isMounted) {
          return
        }
        setBetaNoticeEnabled(true)
        setDeployedAppVersion('')
        setDeployedAppVersionDraft('')
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
    const next: Record<string, { first: string; last: string }> = {}
    for (const u of users) {
      next[u.id] = {
        first: u.first_name ?? '',
        last: u.last_name ?? '',
      }
    }
    setUserProfileNameDrafts(next)
  }, [users])

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
        setSubscriptionPlansError(getErrorMessage(err, 'Abo-Entwürfe konnten nicht geladen werden.'))
      }
    }

    void loadDrafts()

    return () => {
      isMounted = false
    }
  }, [activeSection])

  useEffect(() => {
    if (activeSection !== 'tokenUsage') {
      return
    }

    let isMounted = true

    async function loadTokenUsage() {
      try {
        setIsLoadingTokenUsage(true)
        setTokenUsageError(null)
        const [summary, lastByUser, logRows] = await Promise.all([
          listAdminAiTokenUsageSummary(),
          listAdminUserLastAiUsage(),
          listAdminAiTokenUsageLog(),
        ])
        if (isMounted) {
          setTokenUsageRows(summary)
          setLastAiUsageRows(lastByUser)
          setTokenUsageLogRows(logRows)
        }
      } catch (err) {
        if (isMounted) {
          setTokenUsageError(getErrorMessage(err, 'Token-Statistik konnte nicht geladen werden.'))
          setTokenUsageRows([])
          setLastAiUsageRows([])
          setTokenUsageLogRows([])
        }
      } finally {
        if (isMounted) {
          setIsLoadingTokenUsage(false)
        }
      }
    }

    void loadTokenUsage()

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
      setPromptSaveError(getErrorMessage(err, 'Zurücksetzen fehlgeschlagen.'))
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

    let tier1Budget = 50_000
    if (!newPlanAllowModelChoice) {
      if (newPlanTier1TokenBudget.trim()) {
        const tb = parseOptionalNonNegativeInt(newPlanTier1TokenBudget)
        if (tb === null) {
          setSubscriptionPlansError(
            'Tier-1 Token-Budget: ganze Zahl ≥ 0 (Nutzungs-Tokens laut Zähler pro Tag).',
          )
          return
        }
        tier1Budget = tb
      }
    }

    setSubscriptionPlansError(null)
    setIsCreatingPlan(true)
    try {
      const row = await createSubscriptionPlan({
        name,
        maxTokens,
        maxImages,
        maxFiles,
        imageGenerationModel: newPlanImageGenerationModel,
        chatAllowModelChoice: newPlanAllowModelChoice,
        chatDailyTier1OpenAiModelId: newPlanTier1OpenAiModelId,
        chatDailyTier1TokenBudget: tier1Budget,
        chatDailyTier2OpenAiModelId: newPlanTier2OpenAiModelId,
      })
      setSubscriptionPlans((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name, 'de')))

      setIsCreatePlanModalOpen(false)
      setNewPlanName('')
      setNewPlanMaxTokens('')
      setNewPlanMaxImages('')
      setNewPlanMaxFiles('')
      setNewPlanAllowModelChoice(true)
      setNewPlanImageGenerationModel('gpt_image_1')
      setNewPlanTier1OpenAiModelId('gpt-5.4')
      setNewPlanTier1TokenBudget('50000')
      setNewPlanTier2OpenAiModelId('gpt-5.4-mini')
    } catch (err) {
      setSubscriptionPlansError(getErrorMessage(err, 'Abo konnte nicht angelegt werden.'))
    } finally {
      setIsCreatingPlan(false)
    }
  }

  async function handleUpdateSubscriptionPlan() {
    if (!editPlanDraft) {
      return
    }
    const name = editPlanDraft.name.trim()
    if (!name) {
      return
    }

    const maxTokens = parseOptionalNonNegativeInt(editPlanDraft.maxTokens)
    const maxImages = parseOptionalNonNegativeInt(editPlanDraft.maxImages)
    const maxFiles = parseOptionalNonNegativeInt(editPlanDraft.maxFiles)

    if (editPlanDraft.maxTokens.trim() && maxTokens === null) {
      setSubscriptionPlansError('Max Tokens muss eine ganze Zahl >= 0 sein (oder leer = unbegrenzt).')
      return
    }
    if (editPlanDraft.maxImages.trim() && maxImages === null) {
      setSubscriptionPlansError('Max Bilder muss eine ganze Zahl >= 0 sein (oder leer = unbegrenzt).')
      return
    }
    if (editPlanDraft.maxFiles.trim() && maxFiles === null) {
      setSubscriptionPlansError('Max Dateien muss eine ganze Zahl >= 0 sein (oder leer = unbegrenzt).')
      return
    }

    let tier1Budget = 50_000
    if (!editPlanDraft.allowModelChoice) {
      if (editPlanDraft.tier1TokenBudget.trim()) {
        const tb = parseOptionalNonNegativeInt(editPlanDraft.tier1TokenBudget)
        if (tb === null) {
          setSubscriptionPlansError(
            'Tier-1 Token-Budget: ganze Zahl ≥ 0 (Nutzungs-Tokens laut Zähler pro Tag).',
          )
          return
        }
        tier1Budget = tb
      }
    }

    setSubscriptionPlansError(null)
    setIsUpdatingPlan(true)
    try {
      const row = await updateSubscriptionPlan({
        planId: editPlanDraft.id,
        name,
        maxTokens,
        maxImages,
        maxFiles,
        imageGenerationModel: editPlanDraft.imageGenerationModel,
        chatAllowModelChoice: editPlanDraft.allowModelChoice,
        chatDailyTier1OpenAiModelId: editPlanDraft.tier1OpenAiModelId,
        chatDailyTier1TokenBudget: tier1Budget,
        chatDailyTier2OpenAiModelId: editPlanDraft.tier2OpenAiModelId,
      })
      setSubscriptionPlans((prev) =>
        prev.map((p) => (p.id === row.id ? row : p)).sort((a, b) => a.name.localeCompare(b.name, 'de')),
      )
      setEditPlanDraft(null)
    } catch (err) {
      setSubscriptionPlansError(getErrorMessage(err, 'Abo konnte nicht aktualisiert werden.'))
    } finally {
      setIsUpdatingPlan(false)
    }
  }

  async function handleDeleteSubscriptionPlan(planId: string) {
    if (!window.confirm('Dieses Abo wirklich löschen? Nutzer verlieren die Zuweisung (wird auf kein Abo gesetzt).')) {
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
      setSubscriptionPlansError(getErrorMessage(err, 'Abo konnte nicht gelöscht werden.'))
    } finally {
      setDeletingPlanId(null)
    }
  }

  async function handleDeleteUser(userId: string) {
    const target = users.find((u) => u.id === userId)
    const expectedEmail = target?.email?.trim()
    if (
      !expectedEmail ||
      deleteUserEmailConfirm.trim().toLowerCase() !== expectedEmail.toLowerCase()
    ) {
      return
    }
    setUsersError(null)
    setDeletingUserId(userId)
    try {
      await adminDeleteUser(userId)
      setConfirmDeleteUserId(null)
      setDeleteUserEmailConfirm('')
      setUsers((prev) => prev.filter((u) => u.id !== userId))
      setSubscriptionDrafts((prev) => {
        const next = { ...prev }
        delete next[userId]
        return next
      })
      setSelectedDraftPlanByUser((prev) => {
        const next = { ...prev }
        delete next[userId]
        return next
      })
      setUserProfileNameDrafts((prev) => {
        const next = { ...prev }
        delete next[userId]
        return next
      })
    } catch (err) {
      setUsersError(getErrorMessage(err, 'Nutzer konnte nicht gelöscht werden.'))
    } finally {
      setDeletingUserId(null)
    }
  }

  async function handleCreateUser() {
    const email = newUserEmail.trim().toLowerCase()
    const temporaryPassword = newUserTemporaryPassword
    const firstName = newUserFirstName.trim()
    const lastName = newUserLastName.trim()
    if (!email || !temporaryPassword) {
      setUsersError('Bitte E-Mail und temporäres Passwort ausfüllen.')
      return
    }
    setUsersError(null)
    setCreateUserInfo(null)
    setIsCreatingUser(true)
    try {
      const result = await adminCreateUser({
        email,
        temporaryPassword,
        firstName,
        lastName,
      })
      const nextUsers = await listAdminUsers()
      setUsers(nextUsers)
      setCreateUserInfo(`Nutzer ${result.email} wurde erstellt.`)
      setNewUserEmail('')
      setNewUserFirstName('')
      setNewUserLastName('')
      setNewUserTemporaryPassword('')
    } catch (err) {
      setUsersError(getErrorMessage(err, 'Nutzer konnte nicht erstellt werden.'))
    } finally {
      setIsCreatingUser(false)
    }
  }

  async function handleToggleMustChangePassword(userId: string, enabled: boolean) {
    setUsersError(null)
    setSavingMustPwUserId(userId)
    try {
      await adminSetMustChangePasswordOnFirstLogin(userId, enabled)
      const nextUsers = await listAdminUsers()
      setUsers(nextUsers)
    } catch (err) {
      setUsersError(getErrorMessage(err, 'Einstellung konnte nicht gespeichert werden.'))
    } finally {
      setSavingMustPwUserId(null)
    }
  }

  async function handleSaveUserProfileNames(userId: string) {
    const draft = userProfileNameDrafts[userId]
    if (!draft) {
      return
    }
    setUsersError(null)
    setSavingProfileNamesUserId(userId)
    try {
      await adminSetUserProfileNames(userId, draft.first, draft.last)
      const nextUsers = await listAdminUsers()
      setUsers(nextUsers)
    } catch (err) {
      setUsersError(getErrorMessage(err, 'Profil konnte nicht gespeichert werden.'))
    } finally {
      setSavingProfileNamesUserId(null)
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
        setSubscriptionPlansError('Keine Entwürfe zum Deployen vorhanden.')
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
      setFeedbackError(getErrorMessage(err, 'Löschen fehlgeschlagen.'))
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

  async function handlePushDeployedAppVersion() {
    const nextVersion = deployedAppVersionDraft.trim()
    if (!nextVersion) {
      setSubscriptionPlansError('Bitte eine Version eintragen (z. B. 2026.04.30-1).')
      return
    }
    setSubscriptionPlansError(null)
    setDeployedAppVersionInfo(null)
    setIsSavingDeployedAppVersion(true)
    try {
      await adminSetDeployedAppVersion(nextVersion)
      setDeployedAppVersion(nextVersion)
      setDeployedAppVersionDraft(nextVersion)
      setDeployedAppVersionInfo(`Version gepusht: ${nextVersion}`)
    } catch (err) {
      setSubscriptionPlansError(getErrorMessage(err, 'Version konnte nicht gepusht werden.'))
    } finally {
      setIsSavingDeployedAppVersion(false)
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

  function formatTokenUsagePerson(row: AdminAiTokenUsageRow): string {
    const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
    if (name) {
      return name
    }
    return row.email?.trim() || row.user_id
  }

  function formatTokenLogPerson(row: AdminAiTokenUsageLogRow): string {
    const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
    if (name) {
      return name
    }
    return row.email?.trim() || row.user_id
  }

  function formatLastAiPerson(row: AdminUserLastAiUsageRow): string {
    const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
    if (name) {
      return name
    }
    return row.email?.trim() || row.user_id
  }

  function formatTokenInt(n: number): string {
    return n.toLocaleString('de-CH')
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
    <>
    <section className="settings-modal" role="dialog" aria-modal="true" aria-label="Administrator">
      <aside className="settings-sidebar">
        <h2>Menü</h2>
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
            closeLabel="Administrator schließen"
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
              <div className="admin-subscriptions-create">
                <p className="admin-subscriptions-field-label">Neuen Nutzer erstellen</p>
                <div className="admin-subscriptions-create-row">
                  <input
                    type="email"
                    className="admin-user-profile-input"
                    value={newUserEmail}
                    onChange={(event) => setNewUserEmail(event.target.value)}
                    placeholder="E-Mail"
                    autoComplete="off"
                    disabled={isCreatingUser}
                  />
                  <input
                    type="text"
                    className="admin-user-profile-input"
                    value={newUserFirstName}
                    onChange={(event) => setNewUserFirstName(event.target.value)}
                    placeholder="Vorname (optional)"
                    autoComplete="off"
                    disabled={isCreatingUser}
                  />
                  <input
                    type="text"
                    className="admin-user-profile-input"
                    value={newUserLastName}
                    onChange={(event) => setNewUserLastName(event.target.value)}
                    placeholder="Nachname (optional)"
                    autoComplete="off"
                    disabled={isCreatingUser}
                  />
                  <input
                    type="text"
                    className="admin-user-profile-input"
                    value={newUserTemporaryPassword}
                    onChange={(event) => setNewUserTemporaryPassword(event.target.value)}
                    placeholder="Temporäres Passwort"
                    autoComplete="new-password"
                    disabled={isCreatingUser}
                  />
                  <PrimaryButton type="button" disabled={isCreatingUser} onClick={() => void handleCreateUser()}>
                    {isCreatingUser ? 'Erstellen…' : 'Nutzer erstellen'}
                  </PrimaryButton>
                </div>
                <p className="admin-users-hint">
                  Neue Nutzer werden in Supabase Auth erstellt und beim ersten Login automatisch zur Passwortänderung
                  aufgefordert.
                </p>
                {createUserInfo ? <p className="admin-ai-info">{createUserInfo}</p> : null}
              </div>
              <p className="admin-users-warning">
                Achtung: Änderungen in diesem Bereich können kritische Berechtigungen beeinflussen. Bitte nur mit
                Vorsicht bearbeiten.
              </p>
              <p className="admin-users-hint">
                Alle Auth-Konten erscheinen in der Liste. Vor- und Nachname kannst du für die Beta vorbereiten
                (&quot;Profil speichern&quot; — unabhängig vom Abo). Das Häkchen &quot;Passwort bei Erstanmeldung
                ändern&quot; ist nur sichtbar, solange sich der Nutzer noch nie angemeldet hat. Mit &quot;Nutzer
                löschen&quot; entfernst du Konto und zugehörige Daten endgültig (E-Mail-Bestätigung im Dialog).
              </p>
              {usersError ? <p className="error-text">{usersError}</p> : null}
              {subscriptionPlansError ? <p className="error-text">{subscriptionPlansError}</p> : null}
              {isLoadingUsers ? <p>Lade Nutzer...</p> : null}
              {!isLoadingUsers ? (
                <div className="admin-users-list" role="list" aria-label="Nutzerliste">
                  {users.map((user) => (
                    <div key={user.id} className="admin-user-row" role="listitem">
                      <div className="admin-user-left">
                        <div className="admin-user-meta">
                          <p className="admin-user-name-line">
                            <span className="admin-user-name">{getUserLabel(user)}</span>
                            {!user.has_profile ? (
                              <span className="account-admin-badge" title="Noch keine Zeile in public.profiles">
                                Kein Profil
                              </span>
                            ) : null}
                          </p>
                          <p className="admin-user-email">{user.email ?? '-'}</p>
                        </div>
                        <div className="admin-user-profile-fields">
                          <input
                            type="text"
                            className="admin-user-profile-input"
                            aria-label={`Vorname ${getUserLabel(user)}`}
                            autoComplete="off"
                            value={userProfileNameDrafts[user.id]?.first ?? ''}
                            onChange={(event) =>
                              setUserProfileNameDrafts((prev) => ({
                                ...prev,
                                [user.id]: {
                                  first: event.target.value,
                                  last: prev[user.id]?.last ?? '',
                                },
                              }))
                            }
                            disabled={savingProfileNamesUserId === user.id || isDeployingDrafts}
                            placeholder="Vorname"
                          />
                          <input
                            type="text"
                            className="admin-user-profile-input"
                            aria-label={`Nachname ${getUserLabel(user)}`}
                            autoComplete="off"
                            value={userProfileNameDrafts[user.id]?.last ?? ''}
                            onChange={(event) =>
                              setUserProfileNameDrafts((prev) => ({
                                ...prev,
                                [user.id]: {
                                  first: prev[user.id]?.first ?? '',
                                  last: event.target.value,
                                },
                              }))
                            }
                            disabled={savingProfileNamesUserId === user.id || isDeployingDrafts}
                            placeholder="Nachname"
                          />
                          <SecondaryButton
                            type="button"
                            disabled={
                              savingProfileNamesUserId === user.id || isDeployingDrafts || assigningUserId === user.id
                            }
                            onClick={() => void handleSaveUserProfileNames(user.id)}
                          >
                            {savingProfileNamesUserId === user.id ? 'Speichern…' : 'Profil speichern'}
                          </SecondaryButton>
                        </div>
                        {user.last_sign_in_at == null ? (
                          <label className="admin-user-must-pw-label">
                            <input
                              type="checkbox"
                              checked={user.must_change_password_on_first_login}
                              disabled={
                                savingMustPwUserId === user.id ||
                                isDeployingDrafts ||
                                savingProfileNamesUserId === user.id
                              }
                              onChange={(event) => {
                                void handleToggleMustChangePassword(user.id, event.target.checked)
                              }}
                            />
                            <span>Passwort bei Erstanmeldung ändern</span>
                            {savingMustPwUserId === user.id ? <span aria-hidden="true"> …</span> : null}
                          </label>
                        ) : null}
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
                        <SecondaryButton
                          type="button"
                          className="admin-user-delete-button"
                          disabled={
                            currentAuthUser?.id === user.id ||
                            deletingUserId === user.id ||
                            isDeployingDrafts ||
                            !user.email?.trim()
                          }
                          title={!user.email?.trim() ? 'Keine E-Mail — Löschen nicht möglich' : undefined}
                          onClick={() => {
                            setDeleteUserEmailConfirm('')
                            setConfirmDeleteUserId(user.id)
                          }}
                        >
                          Nutzer löschen
                        </SecondaryButton>
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
          {activeSection === 'tokenUsage' ? (
            <div className="admin-users-panel">
              <p className="admin-users-warning">
                Daten stammen aus der Tabelle <code>ai_token_usage</code> (von der Edge Function{' '}
                <strong>chat-completion</strong> geschrieben).                 Oben: jüngste Zeile pro Nutzer <strong>ohne</strong> Modus{' '}
                <code>generate_title</code> (sonst überschreibt die OpenAI-Titel-Zeile den Chat mit Claude/OpenAI).
                Unten: <strong>kumulierte</strong> Token nach Nutzer und
                Modell. Geschätzte Kosten in <strong>USD</strong> (Listenpreise 2026; ohne Gewähr). Voraussetzung:
                Migrationen inkl. <code>ai_token_usage</code> und Secret{' '}
                <code>SUPABASE_SERVICE_ROLE_KEY</code> für die Function.
              </p>
              {tokenUsageError ? <p className="error-text">{tokenUsageError}</p> : null}
              {isLoadingTokenUsage ? <p>Lade Token-Statistik…</p> : null}
              {!isLoadingTokenUsage && !tokenUsageError ? (
                <>
                  {lastAiUsageSorted.length === 0 && tokenUsageRows.length === 0 ? (
                    <p className="admin-user-empty">
                      Noch keine Einträge. Nach Migration und KI-Nutzung erscheinen hier Werte.
                    </p>
                  ) : (
                    <>
                      <h3 className="admin-token-section-heading">Zuletzt protokolliertes Modell (je Nutzer)</h3>
                      <p className="admin-token-section-hint">
                        Jüngste Zeile aus <code>ai_token_usage</code> pro Nutzer außer Chat-Titelgenerierung (
                        <code>generate_title</code>). Spalte «Modell»: API-Rückgabe.
                      </p>
                      {lastAiUsageSorted.length === 0 ? (
                        <p className="admin-user-empty">Keine Zeilen für «zuletzt» (ungewöhnlich).</p>
                      ) : (
                        <table className="admin-token-usage-table" aria-label="Letzter KI-Aufruf pro Nutzer">
                          <thead>
                            <tr>
                              <th scope="col">Nutzer</th>
                              <th scope="col">E-Mail</th>
                              <th scope="col">Zuletzt</th>
                              <th scope="col">Provider</th>
                              <th scope="col">Modell</th>
                              <th scope="col">Modus</th>
                              <th scope="col" className="admin-token-usage-num">
                                Input
                              </th>
                              <th scope="col" className="admin-token-usage-num">
                                Output
                              </th>
                              <th scope="col" className="admin-token-usage-num">
                                Summe
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {lastAiUsageSorted.map((row) => {
                              const sum = row.input_tokens + row.output_tokens
                              const cost = estimateAiTokenCostsUsd(
                                row.provider,
                                row.model,
                                row.input_tokens,
                                row.output_tokens,
                              )
                              return (
                                <tr key={row.user_id}>
                                  <td>{formatLastAiPerson(row)}</td>
                                  <td>{row.email ?? '—'}</td>
                                  <td>
                                    <time dateTime={row.last_used_at}>{formatFeedbackDate(row.last_used_at)}</time>
                                  </td>
                                  <td>{row.provider}</td>
                                  <td>
                                    <code className="admin-token-model">{row.model}</code>
                                  </td>
                                  <td>
                                    <code className="admin-token-model">{row.mode}</code>
                                  </td>
                                  <td className="admin-token-usage-num">
                                    <span className="admin-token-metric-value">{formatTokenInt(row.input_tokens)}</span>
                                    <span className="admin-token-metric-cost">
                                      {formatUsdEstimate(cost.inputUsd, cost.known)}
                                    </span>
                                  </td>
                                  <td className="admin-token-usage-num">
                                    <span className="admin-token-metric-value">{formatTokenInt(row.output_tokens)}</span>
                                    <span className="admin-token-metric-cost">
                                      {formatUsdEstimate(cost.outputUsd, cost.known)}
                                    </span>
                                  </td>
                                  <td className="admin-token-usage-num">
                                    <span className="admin-token-metric-value">{formatTokenInt(sum)}</span>
                                    <span className="admin-token-metric-cost">
                                      {formatUsdEstimate(cost.totalUsd, cost.known)}
                                    </span>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      )}

                      <h3 className="admin-token-section-heading">Anfragen-Protokoll (je Nutzer aufklappbar)</h3>
                      <p className="admin-token-section-hint">
                        Jede Zeile ist ein KI-Aufruf. <strong>Kosten (USD)</strong> aus der Datenbank (
                        <code>estimated_cost_usd</code> beim Aufruf). Es werden global die neuesten Einträge geladen
                        (Standard: 8000 Zeilen, Obergrenze 20 000) — bei sehr viel Verlauf erscheint nicht die komplette
                        Historie.
                      </p>
                      {tokenUsageLogRows.length === 0 ? (
                        <p className="admin-user-empty">Keine Einzelaufrufe im geladenen Ausschnitt.</p>
                      ) : (
                        <div
                          className="admin-token-user-log-list"
                          role="list"
                          aria-label="KI-Anfragen gruppiert nach Nutzer"
                        >
                          {tokenUsageLogUserIdsSorted.map((userId) => {
                            const rows = tokenUsageLogByUser.get(userId) ?? []
                            const head = rows[0]
                            if (!head) {
                              return null
                            }
                            let sumIn = 0
                            let sumOut = 0
                            let sumUsd = 0
                            for (const r of rows) {
                              sumIn += r.input_tokens
                              sumOut += r.output_tokens
                              sumUsd += r.estimated_cost_usd
                            }
                            const sumTok = sumIn + sumOut
                            return (
                              <details key={userId} className="admin-token-user-log" role="listitem">
                                <summary className="admin-token-user-log-summary">
                                  <span className="admin-token-user-log-summary-main">
                                    <strong>{formatTokenLogPerson(head)}</strong>
                                    <span className="admin-token-user-log-summary-email">{head.email ?? '—'}</span>
                                  </span>
                                  <span className="admin-token-user-log-summary-stats">
                                    {rows.length} Anfrage{rows.length === 1 ? '' : 'n'} ·{' '}
                                    {formatTokenInt(sumTok)} Tok. · {formatUsdEstimate(sumUsd, true)}
                                  </span>
                                </summary>
                                <table
                                  className="admin-token-usage-table admin-token-log-detail-table"
                                  aria-label={`Anfragen für ${formatTokenLogPerson(head)}`}
                                >
                                  <thead>
                                    <tr>
                                      <th scope="col">Zeit (UTC)</th>
                                      <th scope="col">Modus</th>
                                      <th scope="col">Provider</th>
                                      <th scope="col">Modell</th>
                                      <th scope="col" className="admin-token-usage-num">
                                        Input
                                      </th>
                                      <th scope="col" className="admin-token-usage-num">
                                        Output
                                      </th>
                                      <th scope="col" className="admin-token-usage-num">
                                        Σ Tokens
                                      </th>
                                      <th scope="col" className="admin-token-usage-num">
                                        Kosten
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((r) => {
                                      const lineSum = r.input_tokens + r.output_tokens
                                      return (
                                        <tr key={r.id}>
                                          <td>
                                            <time dateTime={r.created_at}>{formatFeedbackDate(r.created_at)}</time>
                                          </td>
                                          <td>
                                            <code className="admin-token-model">{r.mode}</code>
                                          </td>
                                          <td>{r.provider}</td>
                                          <td>
                                            <code className="admin-token-model">{r.model}</code>
                                          </td>
                                          <td className="admin-token-usage-num">{formatTokenInt(r.input_tokens)}</td>
                                          <td className="admin-token-usage-num">{formatTokenInt(r.output_tokens)}</td>
                                          <td className="admin-token-usage-num">{formatTokenInt(lineSum)}</td>
                                          <td className="admin-token-usage-num">
                                            {formatUsdEstimate(r.estimated_cost_usd, true)}
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </details>
                            )
                          })}
                        </div>
                      )}

                      <h3 className="admin-token-section-heading">Kumulierte Tokens (nach Nutzer und Modell)</h3>
                      <p className="admin-token-section-hint">
                        Summen aller protokollierten Aufrufe, gruppiert nach Nutzer, Provider und Modell.
                      </p>
                      {tokenUsageRows.length === 0 ? (
                        <p className="admin-user-empty">Keine aggregierten Einträge.</p>
                      ) : (
                    <>
                      <div className="admin-token-toolbar">
                        <SecondaryButton
                          type="button"
                          onClick={() => setTokenUsageFilterOpen((open) => !open)}
                          aria-expanded={tokenUsageFilterOpen}
                          aria-controls="admin-token-filters-panel"
                        >
                          {tokenUsageFilterOpen ? 'Filter ausblenden' : 'Filter'}
                        </SecondaryButton>
                        {tokenUsageFiltersActive ? (
                          <span className="admin-token-filter-active-badge" aria-live="polite">
                            Filter aktiv
                          </span>
                        ) : null}
                      </div>
                      {tokenUsageFilterOpen ? (
                        <div
                          id="admin-token-filters-panel"
                          className="admin-token-filters-panel"
                          role="region"
                          aria-label="Token-Statistik filtern"
                        >
                          <div className="admin-token-filters-grid">
                            <label className="admin-subscriptions-field-label" htmlFor="admin-token-filter-user">
                              Nutzer
                            </label>
                            <select
                              id="admin-token-filter-user"
                              className="admin-subscriptions-name-input admin-token-filter-select"
                              value={tokenUsageFilterUserId}
                              onChange={(e) => setTokenUsageFilterUserId(e.target.value)}
                            >
                              <option value="">Alle Nutzer</option>
                              {tokenUsageUserOptions.map((row) => (
                                <option key={row.user_id} value={row.user_id}>
                                  {formatTokenUsagePerson(row)}
                                </option>
                              ))}
                            </select>
                            <label className="admin-subscriptions-field-label" htmlFor="admin-token-filter-model">
                              Modell
                            </label>
                            <select
                              id="admin-token-filter-model"
                              className="admin-subscriptions-name-input admin-token-filter-select"
                              value={tokenUsageFilterModel}
                              onChange={(e) => setTokenUsageFilterModel(e.target.value)}
                            >
                              <option value="">Alle Modelle</option>
                              {tokenUsageModelOptions.map((id) => (
                                <option key={id} value={id}>
                                  {id}
                                </option>
                              ))}
                            </select>
                            <label className="admin-subscriptions-field-label" htmlFor="admin-token-filter-email">
                              E-Mail (enthält)
                            </label>
                            <input
                              id="admin-token-filter-email"
                              type="search"
                              className="admin-subscriptions-name-input"
                              placeholder="z. B. @firma.ch"
                              value={tokenUsageFilterEmail}
                              onChange={(e) => setTokenUsageFilterEmail(e.target.value)}
                              autoComplete="off"
                            />
                            <label className="admin-subscriptions-field-label" htmlFor="admin-token-filter-cost-min">
                              Kosten gesamt min. (USD)
                            </label>
                            <input
                              id="admin-token-filter-cost-min"
                              type="text"
                              inputMode="decimal"
                              className="admin-subscriptions-name-input"
                              placeholder="z. B. 0.01"
                              value={tokenUsageFilterCostMin}
                              onChange={(e) => setTokenUsageFilterCostMin(e.target.value)}
                              autoComplete="off"
                            />
                            <label className="admin-subscriptions-field-label" htmlFor="admin-token-filter-cost-max">
                              Kosten gesamt max. (USD)
                            </label>
                            <input
                              id="admin-token-filter-cost-max"
                              type="text"
                              inputMode="decimal"
                              className="admin-subscriptions-name-input"
                              placeholder="z. B. 1.50"
                              value={tokenUsageFilterCostMax}
                              onChange={(e) => setTokenUsageFilterCostMax(e.target.value)}
                              autoComplete="off"
                            />
                          </div>
                          <p className="admin-token-filter-hint">
                            Kostenfilter beziehen sich auf die geschätzte Summe pro Zeile (Input+Output). Zeilen ohne
                            bekannten Tarif werden bei gesetztem Min./Max.-Kostenfilter ausgeblendet.
                          </p>
                          <SecondaryButton
                            type="button"
                            className="admin-token-filter-reset"
                            onClick={() => {
                              setTokenUsageFilterUserId('')
                              setTokenUsageFilterModel('')
                              setTokenUsageFilterEmail('')
                              setTokenUsageFilterCostMin('')
                              setTokenUsageFilterCostMax('')
                            }}
                          >
                            Filter zurücksetzen
                          </SecondaryButton>
                        </div>
                      ) : null}
                      {tokenUsageFilteredRows.length === 0 ? (
                        <p className="admin-user-empty">Keine Zeilen für die aktuellen Filter.</p>
                      ) : (
                        <>
                      <table className="admin-token-usage-table" aria-label="KI Token Verbrauch">
                        <thead>
                          <tr>
                            <th scope="col">Nutzer</th>
                            <th scope="col">E-Mail</th>
                            <th scope="col">Provider</th>
                            <th scope="col">Modell</th>
                            <th scope="col" className="admin-token-usage-num">
                              Input
                            </th>
                            <th scope="col" className="admin-token-usage-num">
                              Output
                            </th>
                            <th scope="col" className="admin-token-usage-num">
                              Summe
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {tokenUsageFilteredRows.map((row) => {
                            const sum = row.input_tokens + row.output_tokens
                            const key = `${row.user_id}-${row.provider}-${row.model}`
                            const cost = estimateAiTokenCostsUsd(
                              row.provider,
                              row.model,
                              row.input_tokens,
                              row.output_tokens,
                            )
                            return (
                              <tr key={key}>
                                <td>{formatTokenUsagePerson(row)}</td>
                                <td>{row.email ?? '—'}</td>
                                <td>{row.provider}</td>
                                <td>
                                  <code className="admin-token-model">{row.model}</code>
                                </td>
                                <td className="admin-token-usage-num">
                                  <span className="admin-token-metric-value">{formatTokenInt(row.input_tokens)}</span>
                                  <span className="admin-token-metric-cost">
                                    {formatUsdEstimate(cost.inputUsd, cost.known)}
                                  </span>
                                </td>
                                <td className="admin-token-usage-num">
                                  <span className="admin-token-metric-value">{formatTokenInt(row.output_tokens)}</span>
                                  <span className="admin-token-metric-cost">
                                    {formatUsdEstimate(cost.outputUsd, cost.known)}
                                  </span>
                                </td>
                                <td className="admin-token-usage-num">
                                  <span className="admin-token-metric-value">{formatTokenInt(sum)}</span>
                                  <span className="admin-token-metric-cost">
                                    {formatUsdEstimate(cost.totalUsd, cost.known)}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="admin-token-usage-foot">
                            <td colSpan={4}>
                              <strong>
                                {tokenUsageFiltersActive ? 'Gesamt (gefiltert)' : 'Gesamt (alle Nutzer)'}
                              </strong>
                            </td>
                            <td className="admin-token-usage-num">
                              <span className="admin-token-metric-value">
                                <strong>{formatTokenInt(tokenUsageTotals.input)}</strong>
                              </span>
                              <span className="admin-token-metric-cost">
                                <strong>
                                  {formatUsdEstimate(
                                    tokenUsageCostTotals.inputUsd,
                                    tokenUsageCostTotals.hasKnownModel,
                                  )}
                                </strong>
                              </span>
                            </td>
                            <td className="admin-token-usage-num">
                              <span className="admin-token-metric-value">
                                <strong>{formatTokenInt(tokenUsageTotals.output)}</strong>
                              </span>
                              <span className="admin-token-metric-cost">
                                <strong>
                                  {formatUsdEstimate(
                                    tokenUsageCostTotals.outputUsd,
                                    tokenUsageCostTotals.hasKnownModel,
                                  )}
                                </strong>
                              </span>
                            </td>
                            <td className="admin-token-usage-num">
                              <span className="admin-token-metric-value">
                                <strong>{formatTokenInt(tokenUsageTotals.total)}</strong>
                              </span>
                              <span className="admin-token-metric-cost">
                                <strong>
                                  {formatUsdEstimate(
                                    tokenUsageCostTotals.totalUsd,
                                    tokenUsageCostTotals.hasKnownModel,
                                  )}
                                </strong>
                              </span>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                      {tokenUsageCostTotals.hasUnknownModel ? (
                        <p className="admin-token-cost-footnote">
                          Kosten-Summen in der Fußzeile zählen nur Zeilen mit bekanntem Modelltarif (OpenAI/Anthropic
                          in <code>aiModelPricing.ts</code>).
                        </p>
                      ) : null}
                        </>
                      )}
                    </>
                  )}
                    </>
                  )}
                </>
              ) : null}
            </div>
          ) : null}
          {activeSection === 'subscriptions' ? (
            <div className="admin-subscriptions-panel">
              <p className="admin-users-warning">
                Lege frei wählbare Abo-Namen an und weise sie unter &quot;Nutzer&quot; einzelnen Konten zu.
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
                  {subscriptionPlans.map((plan) => {
                    return (
                    <li key={plan.id} className="admin-subscriptions-row">
                      <div className="admin-subscriptions-info">
                        <span className="admin-subscriptions-name">{plan.name}</span>
                        <p className="admin-subscriptions-meta">
                          Tokens: {plan.max_tokens ?? 'unbegrenzt'} · Bilder:{' '}
                          {plan.max_images != null
                            ? `+${plan.max_images}/Tag Guthaben (max. 60)`
                            : 'unbegrenzt'}{' '}
                          · Dateien:{' '}
                          {plan.max_files ?? 'unbegrenzt'}
                          <br />
                          Bildgenerator:{' '}
                          {labelForSubscriptionImageGenerationModel(
                            parseSubscriptionImageGenerationModelId(plan.image_generation_model),
                          )}
                          <br />
                          Modellwahl: {plan.chat_allow_model_choice !== false ? 'Nutzer wählt' : 'gesperrt (Tages-Staffel)'}
                          {plan.chat_allow_model_choice === false ? (
                            <>
                              <br />
                              {formatSubscriptionPlanDailyTierSummary(plan)}
                            </>
                          ) : null}
                        </p>
                      </div>
                      <div className="admin-subscriptions-row-actions">
                        <SecondaryButton
                          type="button"
                          className="admin-subscriptions-edit"
                          disabled={deletingPlanId === plan.id}
                          onClick={() => {
                            setSubscriptionPlansError(null)
                            setEditPlanDraft({
                              id: plan.id,
                              name: plan.name,
                              maxTokens: plan.max_tokens != null ? String(plan.max_tokens) : '',
                              maxImages: plan.max_images != null ? String(plan.max_images) : '',
                              maxFiles: plan.max_files != null ? String(plan.max_files) : '',
                              imageGenerationModel: parseSubscriptionImageGenerationModelId(plan.image_generation_model),
                              allowModelChoice: plan.chat_allow_model_choice !== false,
                              tier1OpenAiModelId: parseChatDailyTierOpenAiModelId(
                                plan.chat_daily_tier1_openai_model_id ?? null,
                              ),
                              tier1TokenBudget:
                                plan.chat_daily_tier1_token_budget != null
                                  ? String(plan.chat_daily_tier1_token_budget)
                                  : '50000',
                              tier2OpenAiModelId: parseChatDailyTierOpenAiModelId(
                                plan.chat_daily_tier2_openai_model_id ?? null,
                              ),
                            })
                          }}
                        >
                          Bearbeiten
                        </SecondaryButton>
                        <SecondaryButton
                          type="button"
                          className="admin-subscriptions-delete"
                          disabled={deletingPlanId === plan.id}
                          onClick={() => void handleDeleteSubscriptionPlan(plan.id)}
                        >
                          {deletingPlanId === plan.id ? 'Löschen…' : 'Löschen'}
                        </SecondaryButton>
                      </div>
                    </li>
                    )
                  })}
                </ul>
              ) : null}
              {!isLoadingSubscriptionPlans && subscriptionPlans.length === 0 ? (
                <p className="admin-user-empty">Noch keine Abonnements angelegt.</p>
              ) : null}
              <article className="settings-card">
                <h3 className="admin-system-prompt-title">Sichtbare Abo-Modelle für Nutzer</h3>
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

            </div>
          ) : null}
          {activeSection === 'deployment' ? (
            <div className="admin-subscriptions-panel">
              <p className="admin-users-warning">
                Erst ein Deployment macht gespeicherte Abo-Entwürfe für Nutzer sichtbar.
              </p>
              <article className="settings-card">
                <p className="admin-subscriptions-field-label">App-Version für Settings pushen</p>
                <div className="admin-subscriptions-create-row">
                  <input
                    id="admin-deployed-app-version"
                    type="text"
                    className="admin-subscriptions-name-input"
                    placeholder="z. B. 2026.04.30-1"
                    value={deployedAppVersionDraft}
                    onChange={(event) => setDeployedAppVersionDraft(event.target.value)}
                    autoComplete="off"
                    disabled={isSavingDeployedAppVersion}
                  />
                  <PrimaryButton
                    type="button"
                    disabled={isSavingDeployedAppVersion || !deployedAppVersionDraft.trim()}
                    onClick={() => void handlePushDeployedAppVersion()}
                  >
                    {isSavingDeployedAppVersion ? 'Push läuft…' : 'Version pushen'}
                  </PrimaryButton>
                </div>
                <p className="admin-users-hint">
                  Aktive Version: <strong>{deployedAppVersion || 'Nicht gesetzt'}</strong>
                </p>
                {deployedAppVersionInfo ? <p className="admin-ai-info">{deployedAppVersionInfo}</p> : null}
              </article>
              {subscriptionPlansError ? <p className="error-text">{subscriptionPlansError}</p> : null}
              <ul className="admin-subscriptions-list" aria-label="Abo-Entwürfe">
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
                <p className="admin-user-empty">Keine offenen Entwürfe vorhanden.</p>
              ) : null}
              <PrimaryButton
                type="button"
                disabled={isDeployingDrafts || Object.keys(subscriptionDrafts).length === 0}
                onClick={() => void handleDeploySubscriptionDrafts()}
              >
                {isDeployingDrafts ? 'Deployment läuft…' : 'Jetzt deployen'}
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
                KI-Provider-Keys werden aus Sicherheitsgründen nicht mehr in der Datenbank gepflegt.
                Bitte nutze Supabase Secrets für die Edge Function.
              </p>
              <div className="admin-ai-form">
                <p>
                  Setze in Supabase unter <strong>Project Settings - Edge Functions - Secrets</strong>:
                </p>
                <ul className="settings-list">
                  <li>
                    <strong>OPENAI_API_KEY</strong> — Hauptchat (z. B. GPT-5 mini)
                  </li>
                  <li>
                    <strong>ANTHROPIC_API_KEY</strong> — Lernpfad / Learn-Bereich (Claude Sonnet)
                  </li>
                  <li>
                    <strong>SUPABASE_SERVICE_ROLE_KEY</strong> — für <strong>chat-completion</strong>: schreibt
                    Token-Statistik in <code>ai_token_usage</code> (Admin-Menü «KI-Tokens»)
                  </li>
                  <li>
                    Optional: <strong>ANTHROPIC_MODEL</strong> — anderes Claude-Modell (Sonnet-Standard im Code)
                  </li>
                </ul>
                <p>
                  Danach die Function <strong>chat-completion</strong> neu deployen. Das Frontend braucht keine
                  API-Keys; <code>VITE_AI_PROVIDER</code> nur <code>mock</code> vs. Gateway.
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
                Änderungen gelten für alle angemeldeten Nutzer. Leere DB-Zeile = App nutzt Code-Standard nach
                &quot;Zurücksetzen&quot;. Nach Migration bitte Tabelle <code>app_system_prompts</code> anlegen.
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
          <section className="rename-modal" role="dialog" aria-modal="true" aria-label="Entwurf speichern bestätigen">
            <ModalHeader
              title="Abo als Entwurf speichern?"
              headingLevel="h3"
              className="rename-modal-header"
              onClose={() => setConfirmDraftUserId(null)}
              closeLabel="Bestätigung schließen"
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
      {confirmDeleteUserId && deleteTargetUser ? (
        <ModalShell
          isOpen={Boolean(confirmDeleteUserId)}
          onRequestClose={() => {
            if (!deletingUserId) {
              setConfirmDeleteUserId(null)
              setDeleteUserEmailConfirm('')
            }
          }}
        >
          <section className="rename-modal" role="dialog" aria-modal="true" aria-label="Nutzer löschen">
            <ModalHeader
              title="Nutzer endgültig löschen?"
              headingLevel="h3"
              className="rename-modal-header"
              onClose={() => {
                if (!deletingUserId) {
                  setConfirmDeleteUserId(null)
                  setDeleteUserEmailConfirm('')
                }
              }}
              closeLabel="Dialog schließen"
            />
            <p>
              Das Auth-Konto, Profil, Chats, Lernpfade, Feedback und weitere verknüpfte Daten werden unwiderruflich
              entfernt (soweit in der Datenbank mit CASCADE vorgesehen).
            </p>
            <p>
              Gib zur Bestätigung die E-Mail-Adresse ein:{' '}
              <strong>{deleteTargetUser.email ?? '—'}</strong>
            </p>
            <label className="admin-delete-email-label" htmlFor="admin-delete-email-confirm">
              E-Mail bestätigen
            </label>
            <input
              id="admin-delete-email-confirm"
              type="email"
              className="admin-subscriptions-name-input"
              autoComplete="off"
              value={deleteUserEmailConfirm}
              onChange={(event) => setDeleteUserEmailConfirm(event.target.value)}
              disabled={Boolean(deletingUserId)}
              placeholder="E-Mail-Adresse"
            />
            <div className="rename-actions">
              <SecondaryButton
                type="button"
                disabled={Boolean(deletingUserId)}
                onClick={() => {
                  setConfirmDeleteUserId(null)
                  setDeleteUserEmailConfirm('')
                }}
              >
                Abbrechen
              </SecondaryButton>
              <PrimaryButton
                type="button"
                className="admin-delete-confirm-button"
                disabled={!deleteEmailMatches || Boolean(deletingUserId)}
                onClick={() => void handleDeleteUser(confirmDeleteUserId)}
              >
                {deletingUserId ? 'Löschen…' : 'Endgültig löschen'}
              </PrimaryButton>
            </div>
          </section>
        </ModalShell>
      ) : null}
    </section>
    {createPortal(
      <>
        {isCreatePlanModalOpen ? (
          <ModalShell
            className="settings-overlay subscription-plan-editor-overlay"
            isOpen={isCreatePlanModalOpen}
            onRequestClose={() => {
              setIsCreatePlanModalOpen(false)
              setSubscriptionPlansError(null)
            }}
          >
            <section
              className="rename-modal subscription-plan-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Abo erstellen"
            >
              <ModalHeader
                title="Abo erstellen"
                headingLevel="h3"
                className="rename-modal-header"
                onClose={() => {
                  setIsCreatePlanModalOpen(false)
                  setSubscriptionPlansError(null)
                }}
                closeLabel="Abo erstellen schließen"
              />

              <form
                className="rename-form subscription-plan-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  void handleCreateSubscriptionPlan()
                }}
              >
                <div className="subscription-plan-modal-columns">
                  <div className="subscription-plan-modal-col">
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

                    <label htmlFor="admin-new-subscription-max-images">Max. Bilder pro Tag</label>
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

                    <label htmlFor="admin-new-subscription-image-gen-model">Bildgenerator</label>
                    <select
                      id="admin-new-subscription-image-gen-model"
                      className="admin-user-subscription-select"
                      value={newPlanImageGenerationModel}
                      onChange={(event) =>
                        setNewPlanImageGenerationModel(event.target.value as SubscriptionImageGenerationModelId)
                      }
                    >
                      {SUBSCRIPTION_IMAGE_GENERATION_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>

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
                  </div>

                  <div className="subscription-plan-modal-col">
                    <label className="admin-subscriptions-checkbox-label">
                      <input
                        type="checkbox"
                        checked={newPlanAllowModelChoice}
                        onChange={(event) => setNewPlanAllowModelChoice(event.target.checked)}
                      />{' '}
                      Nutzer dürfen das Chat-KI-Modell selbst wählen
                    </label>

                    {newPlanAllowModelChoice ? (
                      <p className="admin-users-hint subscription-plan-tier-intro">
                        OpenAI-Tages-Staffel (Tier 1 / 2) ist ausgeblendet — im Chat gilt die gewählte Modell-Pille
                        (GPT oder Claude).
                      </p>
                    ) : (
                      <>
                        <p className="admin-users-hint subscription-plan-tier-intro">
                          OpenAI-Hauptchat (pro Kalendertag): nach Verbrauch in{' '}
                          <code>subscription_usages.used_tokens</code> — erstes Modell bis zum Budget, danach zweites
                          Modell. Keine freie Modellwahl im Chat.
                        </p>
                        <label htmlFor="admin-new-tier1-openai-model">Erstes OpenAI-Modell (bis Token-Budget)</label>
                        <select
                          id="admin-new-tier1-openai-model"
                          className="admin-user-subscription-select"
                          value={newPlanTier1OpenAiModelId}
                          onChange={(event) =>
                            setNewPlanTier1OpenAiModelId(event.target.value as ChatDailyTierOpenAiModelId)
                          }
                        >
                          {OPENAI_CHAT_MODEL_OPTIONS.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </select>

                        <label htmlFor="admin-new-tier1-token-budget">Token-Budget Tier 1 (pro Tag)</label>
                        <input
                          id="admin-new-tier1-token-budget"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          value={newPlanTier1TokenBudget}
                          onChange={(event) => setNewPlanTier1TokenBudget(event.target.value)}
                        />

                        <label htmlFor="admin-new-tier2-openai-model">Zweites OpenAI-Modell (ab Budget)</label>
                        <select
                          id="admin-new-tier2-openai-model"
                          className="admin-user-subscription-select"
                          value={newPlanTier2OpenAiModelId}
                          onChange={(event) =>
                            setNewPlanTier2OpenAiModelId(event.target.value as ChatDailyTierOpenAiModelId)
                          }
                        >
                          {OPENAI_CHAT_MODEL_OPTIONS.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                </div>

                <div className="rename-actions subscription-plan-modal-actions">
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
        {editPlanDraft ? (
          <ModalShell
            className="settings-overlay subscription-plan-editor-overlay"
            isOpen={Boolean(editPlanDraft)}
            onRequestClose={() => {
              setEditPlanDraft(null)
              setSubscriptionPlansError(null)
            }}
          >
            <section
              className="rename-modal subscription-plan-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Abo bearbeiten"
            >
              <ModalHeader
                title="Abo bearbeiten"
                headingLevel="h3"
                className="rename-modal-header"
                onClose={() => {
                  setEditPlanDraft(null)
                  setSubscriptionPlansError(null)
                }}
                closeLabel="Abo bearbeiten schließen"
              />

              <form
                className="rename-form subscription-plan-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  void handleUpdateSubscriptionPlan()
                }}
              >
                <div className="subscription-plan-modal-columns">
                  <div className="subscription-plan-modal-col">
                    <label htmlFor="admin-edit-subscription-name">Name</label>
                    <input
                      id="admin-edit-subscription-name"
                      type="text"
                      value={editPlanDraft.name}
                      maxLength={120}
                      onChange={(event) =>
                        setEditPlanDraft((prev) => (prev ? { ...prev, name: event.target.value } : null))
                      }
                    />

                    <label htmlFor="admin-edit-subscription-max-tokens">Max Tokens</label>
                    <input
                      id="admin-edit-subscription-max-tokens"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      placeholder="leer = unbegrenzt"
                      value={editPlanDraft.maxTokens}
                      onChange={(event) =>
                        setEditPlanDraft((prev) => (prev ? { ...prev, maxTokens: event.target.value } : null))
                      }
                    />

                    <label htmlFor="admin-edit-subscription-max-images">Max. Bilder pro Tag</label>
                    <input
                      id="admin-edit-subscription-max-images"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      placeholder="leer = unbegrenzt"
                      value={editPlanDraft.maxImages}
                      onChange={(event) =>
                        setEditPlanDraft((prev) => (prev ? { ...prev, maxImages: event.target.value } : null))
                      }
                    />

                    <label htmlFor="admin-edit-subscription-image-gen-model">Bildgenerator</label>
                    <select
                      id="admin-edit-subscription-image-gen-model"
                      className="admin-user-subscription-select"
                      value={editPlanDraft.imageGenerationModel}
                      onChange={(event) =>
                        setEditPlanDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                imageGenerationModel: event.target.value as SubscriptionImageGenerationModelId,
                              }
                            : null,
                        )
                      }
                    >
                      {SUBSCRIPTION_IMAGE_GENERATION_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>

                    <label htmlFor="admin-edit-subscription-max-files">Max Dateien</label>
                    <input
                      id="admin-edit-subscription-max-files"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      placeholder="leer = unbegrenzt"
                      value={editPlanDraft.maxFiles}
                      onChange={(event) =>
                        setEditPlanDraft((prev) => (prev ? { ...prev, maxFiles: event.target.value } : null))
                      }
                    />
                  </div>

                  <div className="subscription-plan-modal-col">
                    <label className="admin-subscriptions-checkbox-label">
                      <input
                        type="checkbox"
                        checked={editPlanDraft.allowModelChoice}
                        onChange={(event) =>
                          setEditPlanDraft((prev) =>
                            prev ? { ...prev, allowModelChoice: event.target.checked } : null,
                          )
                        }
                      />{' '}
                      Nutzer dürfen das Chat-KI-Modell selbst wählen
                    </label>

                    {editPlanDraft.allowModelChoice ? (
                      <p className="admin-users-hint subscription-plan-tier-intro">
                        OpenAI-Tages-Staffel (Tier 1 / 2) ist ausgeblendet — im Chat gilt die gewählte Modell-Pille
                        (GPT oder Claude).
                      </p>
                    ) : (
                      <>
                        <p className="admin-users-hint subscription-plan-tier-intro">
                          OpenAI-Hauptchat (pro Kalendertag): nach Verbrauch in{' '}
                          <code>subscription_usages.used_tokens</code> — erstes Modell bis zum Budget, danach zweites
                          Modell. Keine freie Modellwahl im Chat.
                        </p>
                        <label htmlFor="admin-edit-tier1-openai-model">Erstes OpenAI-Modell (bis Token-Budget)</label>
                        <select
                          id="admin-edit-tier1-openai-model"
                          className="admin-user-subscription-select"
                          value={editPlanDraft.tier1OpenAiModelId}
                          onChange={(event) =>
                            setEditPlanDraft((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    tier1OpenAiModelId: event.target.value as ChatDailyTierOpenAiModelId,
                                  }
                                : null,
                            )
                          }
                        >
                          {OPENAI_CHAT_MODEL_OPTIONS.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </select>

                        <label htmlFor="admin-edit-tier1-token-budget">Token-Budget Tier 1 (pro Tag)</label>
                        <input
                          id="admin-edit-tier1-token-budget"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          value={editPlanDraft.tier1TokenBudget}
                          onChange={(event) =>
                            setEditPlanDraft((prev) =>
                              prev ? { ...prev, tier1TokenBudget: event.target.value } : null,
                            )
                          }
                        />

                        <label htmlFor="admin-edit-tier2-openai-model">Zweites OpenAI-Modell (ab Budget)</label>
                        <select
                          id="admin-edit-tier2-openai-model"
                          className="admin-user-subscription-select"
                          value={editPlanDraft.tier2OpenAiModelId}
                          onChange={(event) =>
                            setEditPlanDraft((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    tier2OpenAiModelId: event.target.value as ChatDailyTierOpenAiModelId,
                                  }
                                : null,
                            )
                          }
                        >
                          {OPENAI_CHAT_MODEL_OPTIONS.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                </div>

                <div className="rename-actions subscription-plan-modal-actions">
                  <SecondaryButton
                    type="button"
                    disabled={isUpdatingPlan}
                    onClick={() => {
                      setEditPlanDraft(null)
                      setSubscriptionPlansError(null)
                    }}
                  >
                    Abbrechen
                  </SecondaryButton>
                  <PrimaryButton type="submit" disabled={isUpdatingPlan || !editPlanDraft.name.trim()}>
                    {isUpdatingPlan ? 'Speichern…' : 'Speichern'}
                  </PrimaryButton>
                </div>
              </form>
            </section>
          </ModalShell>
        ) : null}
      </>,
      document.body,
    )}
    </>
  )
}
