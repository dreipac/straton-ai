import type { InstantAnalyzeResult } from './instantAnalyze'
import {
  getAssistantMainChatBrevityFinalReminder,
  getAssistantMainChatBrevityInstruction,
  getAssistantMainChatGuidedDiagnosisInstruction,
  getAssistantMainChatMandatoryFollowUpInstruction,
  getAssistantMainChatSolveDirectlyInstruction,
  getAssistantMainChatStepByStepIntakeInstruction,
} from './chatAssistantStyle'
import {
  shouldSuppressInstantBrevityForAnalyze,
  shouldSuppressInstantMandatoryFollowUpForAnalyze,
  shouldSuppressInstantSolveDirectlyForAnalyze,
} from './chatInstantTaskType'
import {
  getAssistantDirectAnswerInstruction,
  shouldApplyDirectAnswerTurnBriefing,
} from './chatDirectAnswerInstruction'
import { getStratonProductContextInstruction } from './chatProductContext'
import type { ChatProfileIdentity } from './chatProfileIdentityContext'
import { getChatProfileIdentityInstruction } from './chatProfileIdentityContext'
import { getChatCurrentDateContextInstruction } from './chatCurrentDateContext'
import type { ChatSubscriptionUsageContext } from './chatSubscriptionUsageContext'
import { getChatSubscriptionUsageInstruction } from './chatSubscriptionUsageContext'
import {
  getAssistantExerciseSolutionToneInstruction,
  getAssistantTableExerciseInstruction,
} from './chatTableExerciseInstruction'
import type { ChatUserIntroduction } from './chatUserIntroductionContext'
import { getChatUserIntroductionInstruction } from './chatUserIntroductionContext'
import { getAssistantVisionCapabilityInstruction } from './chatVisionCapability'
import { getStratonPlatformGuideInstruction } from './stratonPlatformGuide'
import {
  userMessageAsksAboutPriorSubscriptionUsage,
  userMessageRequestsSubscriptionUsage,
} from './chatSubscriptionUsageMarker'
import { userMessageAsksStratonPlatformNavigation } from './stratonPlatformGuide'
import {
  shouldApplyTableExerciseTurnBriefing,
  userMessageSuggestsTableExercise,
} from './chatTableExerciseInstruction'
import type { ChatMessage } from '../types'
import { stripComposerAttachmentBlocksForRouting } from '../utils/chatRoutingText'
import {
  assistantMessageHasGeneratedImage,
  matchImageAttributionQuestion,
  matchImageReferenceQuestion,
  userMessageHasUploadedImage,
} from '../utils/referencedImageVision'
import { messageHasVisionPayload } from './mainChatContext'

export type MainChatSystemPromptModuleKey =
  | 'platformGuide'
  | 'productContext'
  | 'visionCapability'
  | 'webGrounding'
  | 'guidedDiagnosis'
  | 'stepByStepIntake'
  | 'tableExercise'
  | 'exerciseTone'
  | 'directAnswer'
  | 'fullIntroduction'
  | 'subscriptionUsage'

export type MainChatSystemPromptModules = Record<MainChatSystemPromptModuleKey, boolean>

export type MainChatSystemPromptModuleReasons = Partial<Record<MainChatSystemPromptModuleKey, string>>

const ALL_MODULES_OFF: MainChatSystemPromptModules = {
  platformGuide: false,
  productContext: false,
  visionCapability: false,
  webGrounding: false,
  guidedDiagnosis: false,
  stepByStepIntake: false,
  tableExercise: false,
  exerciseTone: false,
  directAnswer: false,
  fullIntroduction: false,
  subscriptionUsage: false,
}

const PRODUCT_QUESTION_RE =
  /\b(wer\s+hat\s+straton|wer\s+entwickelt\s+straton|gründer|gruender|wer\s+steckt\s+dahinter|wer\s+ist\s+der\s+entwickler|wer\s+hat\s+das\s+gemacht|straton\s+entwickler)\b/i

const PERSONAL_INTRODUCTION_RE =
  /\b(über\s+mich|ueber\s+mich|wer\s+bin\s+ich|was\s+weis(s|ß)t\s+du\s+über\s+mich|kennst\s+du\s+mich|mein\s+profil|meine\s+einführung|meine\s+einfuehrung)\b/i

const GUIDED_DIAGNOSIS_PROBLEM_RE =
  /\b(geht\s+nicht|funktioniert\s+nicht|fehler|fehlermeldung|ausfall|langsam|keine\s+verbindung|verbindung\s+fehl|warum\s+(geht|funktioniert)|nicht\s+erreichbar|timeout|absturz|crash|kaputt|defekt|problem\s+mit|troubleshoot|debugg)\b/i

const HOW_TO_INTAKE_RE =
  /\b(wie\s+(installier|richte\s+ich\s+ein|konfigurier|einricht|setup)|schritt\s+für\s+schritt|schritt\s+fuer\s+schritt|anleitung\s+(für|zum|wie)|how\s+to\s+(install|setup|configure))\b/i

const PRIOR_DIAGNOSIS_ASSISTANT_RE =
  /\b(nächster\s+test|naechster\s+test|eingrenzung|ausgeschlossen|geführt|gefuehrt|diagnose|prüfschritt|pruefschritt)\b/i

function routingText(params: {
  routingText?: string
  lastUserContent?: string
}): string {
  const raw = params.routingText?.trim() || params.lastUserContent?.trim() || ''
  return stripComposerAttachmentBlocksForRouting(raw)
}

export function userMessageAsksStratonProductQuestion(text: string): boolean {
  const t = routingText({ routingText: text })
  if (!t) {
    return false
  }
  return PRODUCT_QUESTION_RE.test(t)
}

export function userMessageNeedsPersonalIntroductionContext(
  text: string,
  analyze?: Pick<InstantAnalyzeResult, 'task_type' | 'intent'> | null,
): boolean {
  const t = routingText({ routingText: text })
  if (!t) {
    return false
  }
  if (PERSONAL_INTRODUCTION_RE.test(t)) {
    return true
  }
  if (analyze?.task_type === 'quiz_generate' && /\b(über\s+mich|ueber\s+mich|mich\b)/i.test(t)) {
    return true
  }
  if (analyze?.task_type === 'quiz_generate' && /über\s+(dich|dir)|about\s+me/i.test(analyze.intent)) {
    return true
  }
  return false
}

function userMessageSuggestsGuidedDiagnosis(
  text: string,
  priorTurns: ReadonlyArray<{ role: string; content?: string | null }>,
  analyze?: Pick<InstantAnalyzeResult, 'reply_mode' | 'intent' | 'task_type'> | null,
): boolean {
  const t = routingText({ routingText: text })
  if (!t) {
    return false
  }
  if (analyze?.task_type === 'quiz_generate' || analyze?.task_type === 'mc_solve' || analyze?.task_type === 'summary') {
    return false
  }
  if (userMessageSuggestsTableExercise(t)) {
    return false
  }
  if (GUIDED_DIAGNOSIS_PROBLEM_RE.test(t)) {
    return true
  }
  if (analyze?.reply_mode === 'one_step' && /fehler|problem|netzwerk|server|config|geht\s+nicht/i.test(analyze.intent)) {
    return true
  }
  const lastAssistant = [...priorTurns].reverse().find((m) => m.role === 'assistant')
  const lastUser = [...priorTurns].reverse().find((m) => m.role === 'user')
  if (
    lastAssistant?.content &&
    PRIOR_DIAGNOSIS_ASSISTANT_RE.test(lastAssistant.content) &&
    lastUser &&
    t.length <= 2400
  ) {
    return true
  }
  return false
}

function userMessageSuggestsStepByStepIntake(
  text: string,
  analyze?: Pick<InstantAnalyzeResult, 'task_type'> | null,
): boolean {
  const t = routingText({ routingText: text })
  if (!t) {
    return false
  }
  if (analyze?.task_type === 'quiz_generate' || analyze?.task_type === 'mc_solve') {
    return false
  }
  if (userMessageSuggestsTableExercise(t)) {
    return false
  }
  return HOW_TO_INTAKE_RE.test(t)
}

function threadHasVisionContext(
  priorTurns: ReadonlyArray<Pick<ChatMessage, 'role' | 'content' | 'metadata'>>,
  lastUserContent?: string,
  visionInlineDataUrl?: string | null,
): boolean {
  if (typeof visionInlineDataUrl === 'string' && visionInlineDataUrl.startsWith('data:image/')) {
    return true
  }
  if (lastUserContent && messageHasVisionPayload(lastUserContent)) {
    return true
  }
  return priorTurns.some(
    (m) =>
      (m.role === 'user' && messageHasVisionPayload(typeof m.content === 'string' ? m.content : '')) ||
      userMessageHasUploadedImage(m) ||
      assistantMessageHasGeneratedImage(m),
  )
}

function analyzeNeedsVisionCapability(
  analyze: Pick<InstantAnalyzeResult, 'category' | 'action'> | undefined,
  routing: string,
): boolean {
  if (!analyze) {
    return false
  }
  if (analyze.category === 'image') {
    return true
  }
  if (matchImageAttributionQuestion(routing) || matchImageReferenceQuestion(routing)) {
    return true
  }
  return false
}

export function resolveMainChatSystemPromptModules(params: {
  isMainChat: boolean
  thinking: boolean
  mainChatInstantPrompts: boolean
  instantAnalyze?: InstantAnalyzeResult
  routingText?: string
  lastUserContent?: string
  priorTurns?: ReadonlyArray<Pick<ChatMessage, 'role' | 'content' | 'metadata'>>
  visionInlineDataUrl?: string | null
  webSearchContext?: string
  webSearchRequestedButMissing?: boolean
}): { modules: MainChatSystemPromptModules; reasons: MainChatSystemPromptModuleReasons } {
  if (!params.isMainChat) {
    return { modules: { ...ALL_MODULES_OFF }, reasons: {} }
  }

  const reasons: MainChatSystemPromptModuleReasons = {}
  const text = routingText(params)
  const priorTurns = params.priorTurns ?? []
  const analyze = params.instantAnalyze

  const platformGuide =
    userMessageAsksStratonPlatformNavigation(text) ||
    /\b(einstellung|navigier|wo\s+finde|sidebar|menü|menu)\b/i.test(analyze?.intent ?? '')
  if (platformGuide) {
    reasons.platformGuide = userMessageAsksStratonPlatformNavigation(text)
      ? 'Navigationsfrage'
      : 'Analyze-Intent'
  }

  const productContext = userMessageAsksStratonProductQuestion(text)
  if (productContext) {
    reasons.productContext = 'Straton/Entwickler-Frage'
  }

  const hasVision =
    threadHasVisionContext(priorTurns, params.lastUserContent, params.visionInlineDataUrl) ||
    analyzeNeedsVisionCapability(analyze, text)
  if (hasVision) {
    reasons.visionCapability = 'Bild im Turn/Verlauf oder image-Intent'
  }

  const webGrounding = Boolean(
    analyze?.needs_live_web ||
      params.webSearchContext?.trim() ||
      params.webSearchRequestedButMissing,
  )
  if (webGrounding) {
    reasons.webGrounding = analyze?.needs_live_web ? 'needs_live_web' : 'Websuche-Kontext'
  }

  let guidedDiagnosis = false
  let stepByStepIntake = false
  let tableExercise = false
  let exerciseTone = false
  let directAnswer = false

  if (params.mainChatInstantPrompts && !params.thinking) {
    guidedDiagnosis = userMessageSuggestsGuidedDiagnosis(text, priorTurns, analyze)
    if (guidedDiagnosis) {
      reasons.guidedDiagnosis = 'Problem/Fehlersuche oder Diagnose-Follow-up'
    }

    stepByStepIntake = userMessageSuggestsStepByStepIntake(text, analyze)
    if (stepByStepIntake) {
      reasons.stepByStepIntake = 'How-to/Install-Anfrage'
    }

    tableExercise = shouldApplyTableExerciseTurnBriefing(
      text,
      params.lastUserContent,
      params.visionInlineDataUrl,
    )
    if (tableExercise) {
      reasons.tableExercise = 'Tabellen-/Übungsaufgabe'
    }

    exerciseTone = tableExercise
    if (exerciseTone) {
      reasons.exerciseTone = 'wie tableExercise'
    }

    directAnswer =
      analyze?.task_type === 'mc_solve' ||
      shouldApplyDirectAnswerTurnBriefing(text, priorTurns)
    if (directAnswer) {
      reasons.directAnswer = analyze?.task_type === 'mc_solve' ? 'task_type mc_solve' : 'MC/Direktantwort'
    }
  }

  const fullIntroduction = userMessageNeedsPersonalIntroductionContext(text, analyze)
  if (fullIntroduction) {
    reasons.fullIntroduction = 'Persönlicher Kontext / Quiz über Nutzer'
  }

  const subscriptionUsage =
    userMessageRequestsSubscriptionUsage(text) ||
    userMessageAsksAboutPriorSubscriptionUsage(text, priorTurns)
  if (subscriptionUsage) {
    reasons.subscriptionUsage = 'Verbrauch/Limits/Abo'
  }

  return {
    modules: {
      platformGuide,
      productContext,
      visionCapability: hasVision,
      webGrounding,
      guidedDiagnosis,
      stepByStepIntake,
      tableExercise,
      exerciseTone,
      directAnswer,
      fullIntroduction,
      subscriptionUsage,
    },
    reasons,
  }
}

/**
 * Dynamische Prompt-Blöcke für den letzten User-Turn — nicht im gecachten System-Prefix.
 * Profil, Datum/Uhrzeit und bedingte Module ändern sich pro Anfrage.
 */
export function buildPromptCacheDynamicTurnBlocks(params: {
  isMainChat: boolean
  mainChatInstantPrompts: boolean
  modules: MainChatSystemPromptModules
  profileIdentity?: ChatProfileIdentity | null
  userIntroduction?: ChatUserIntroduction | null
  subscriptionUsage?: ChatSubscriptionUsageContext | null
  webGroundingInstruction?: string
}): string[] {
  if (!params.isMainChat) {
    return []
  }

  const blocks: string[] = []

  const profile = getChatProfileIdentityInstruction(params.profileIdentity)
  if (profile) {
    blocks.push(profile)
  }

  blocks.push(getChatCurrentDateContextInstruction())

  if (params.modules.visionCapability) {
    blocks.push(getAssistantVisionCapabilityInstruction())
  }
  if (params.modules.productContext) {
    blocks.push(getStratonProductContextInstruction())
  }
  if (params.modules.platformGuide) {
    blocks.push(getStratonPlatformGuideInstruction())
  }
  if (params.webGroundingInstruction?.trim()) {
    blocks.push(params.webGroundingInstruction.trim())
  }
  if (params.mainChatInstantPrompts && params.modules.guidedDiagnosis) {
    blocks.push(getAssistantMainChatGuidedDiagnosisInstruction())
  }
  if (params.mainChatInstantPrompts && params.modules.stepByStepIntake) {
    blocks.push(getAssistantMainChatStepByStepIntakeInstruction())
  }
  if (params.mainChatInstantPrompts && params.modules.tableExercise) {
    blocks.push(getAssistantTableExerciseInstruction())
  }
  if (params.mainChatInstantPrompts && params.modules.exerciseTone) {
    blocks.push(getAssistantExerciseSolutionToneInstruction())
  }
  if (params.mainChatInstantPrompts && params.modules.directAnswer) {
    blocks.push(getAssistantDirectAnswerInstruction())
  }
  if (params.modules.fullIntroduction) {
    const intro = getChatUserIntroductionInstruction(params.userIntroduction)
    if (intro) {
      blocks.push(intro)
    }
  }
  if (params.modules.subscriptionUsage) {
    const sub = getChatSubscriptionUsageInstruction(params.subscriptionUsage)
    if (sub) {
      blocks.push(sub)
    }
  }

  return blocks
}

/**
 * task_type-abhängige Instant-Regeln (Brevity, Solve, Follow-up) — Turn-Kontext, nicht System-Cache.
 */
export function buildPromptCacheSuppressTurnBlocks(params: {
  mainChatInstantPrompts: boolean
  instantAnalyze?: Pick<InstantAnalyzeResult, 'task_type' | 'explanation_depth'> | null
}): string[] {
  if (!params.mainChatInstantPrompts) {
    return []
  }

  const analyze = params.instantAnalyze ?? undefined
  const suppressBrevity = shouldSuppressInstantBrevityForAnalyze(analyze)
  const suppressFollowUp = shouldSuppressInstantMandatoryFollowUpForAnalyze(analyze)
  const suppressSolveDirectly = shouldSuppressInstantSolveDirectlyForAnalyze(analyze)

  const blocks: string[] = []

  if (!suppressSolveDirectly) {
    blocks.push(getAssistantMainChatSolveDirectlyInstruction())
  } else if (analyze?.task_type === 'summary') {
    blocks.push(
      'Arbeitsmodus Zusammenfassung (verbindlich): Alle Themen **inhaltlich ausarbeiten** in ```cards``` — **kein** «Aufgabe:/Lösung:»-Format; thematische Kapitel, wenig Fliesstext, viele Kacheln und `---`.',
    )
  }
  if (!suppressBrevity) {
    blocks.push(getAssistantMainChatBrevityInstruction())
  }
  if (!suppressFollowUp) {
    blocks.push(getAssistantMainChatMandatoryFollowUpInstruction())
  }
  if (!suppressBrevity) {
    blocks.push(getAssistantMainChatBrevityFinalReminder())
  }

  return blocks
}
