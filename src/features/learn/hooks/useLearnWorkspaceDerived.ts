import type { User } from '@supabase/supabase-js'
import type { UserProfile } from '../../auth/services/auth.service'
import { getAvatarFallbackLetter, getUserDisplayName } from '../../auth/utils/userDisplay'
import type { InteractiveQuizPayload, InteractiveQuizQuestion } from '../../chat/utils/interactiveQuiz'
import type { ChapterBlueprint, ChapterSession, ChapterStep } from '../services/learn.persistence'
import { sanitizeChapterTitleForUi } from '../utils/learnPageHelpers'

export type LearnWorkspaceDerivedArgs = {
  user: User | null
  profile: UserProfile | null
  effectiveChapterBlueprints: ChapterBlueprint[]
  chapterSession: ChapterSession
  learningChapters: string[]
  effectiveTopic: string
  isChapterPreviewVisible: boolean
  proficiencyLevel: '' | 'low' | 'medium' | 'high'
  entryQuiz: InteractiveQuizPayload | null
  entryQuizQuestionIndex: number
  entryQuizAnswers: Record<string, string>
}

export type LearnWorkspaceDerived = {
  entryQuizTotalQuestions: number
  activeEntryQuestion: InteractiveQuizQuestion | null
  hasMultipleChoiceOptions: boolean
  activeEntryAnswer: string
  isLastEntryQuestion: boolean
  entryQuizProgressPercent: number
  safeChapterIndex: number
  activeChapterBlueprint: ChapterBlueprint | null
  safeChapterStepIndex: number
  activeChapterStep: ChapterBlueprint['steps'][number] | null
  chapterProgressPercent: number
  currentChapterAnswer: string
  currentChapterFeedback: string
  currentChapterIsCorrect: boolean | undefined
  hasCurrentChapterEvaluation: boolean
  totalAnsweredChapterQuestions: number
  totalCorrectChapterQuestions: number
  totalWrongChapterQuestions: number
  chapterAccuracyPercent: number
  displayName: string
  avatarFallback: string
  /** Anzeigename des zugewiesenen Abos (Sidebar-Karte) */
  subscriptionPlanName: string | null
  previewChapterTitle: string
  previewStepCount: number
  previewQuestionCount: number
  previewCompleted: boolean
  previewStatusLabel: string
  previewStatusText: string
  previewRecommendation: string
  currentChapterStepProgressPercent: number
  isAllChaptersCompleted: boolean
  previewGreetingText: string
  hasStartedFirstChapter: boolean
  showChapterPreview: boolean
  previewEstimatedMinutes: number
  previewChapterBullets: string[]
  proficiencyLabel: string
}

export function useLearnWorkspaceDerived(args: LearnWorkspaceDerivedArgs): LearnWorkspaceDerived {
  const {
    user,
    profile,
    effectiveChapterBlueprints,
    chapterSession,
    learningChapters,
    effectiveTopic,
    isChapterPreviewVisible,
    proficiencyLevel,
    entryQuiz,
    entryQuizQuestionIndex,
    entryQuizAnswers,
  } = args

  const entryQuizTotalQuestions = entryQuiz?.questions.length ?? 0
  const activeEntryQuestion =
    entryQuiz && entryQuizTotalQuestions > 0
      ? entryQuiz.questions[Math.min(entryQuizQuestionIndex, entryQuizTotalQuestions - 1)]
      : null
  const hasMultipleChoiceOptions =
    activeEntryQuestion?.questionType === 'mcq' && (activeEntryQuestion.options?.length ?? 0) >= 2
  const activeEntryAnswer = activeEntryQuestion ? (entryQuizAnswers[activeEntryQuestion.id] ?? '') : ''
  const isLastEntryQuestion = entryQuizTotalQuestions > 0 && entryQuizQuestionIndex >= entryQuizTotalQuestions - 1
  const entryQuizProgressPercent =
    entryQuizTotalQuestions > 0
      ? (Math.min(entryQuizQuestionIndex + 1, entryQuizTotalQuestions) / entryQuizTotalQuestions) * 100
      : 0

  const safeChapterIndex = Math.max(
    0,
    Math.min(chapterSession.chapterIndex, Math.max(0, effectiveChapterBlueprints.length - 1)),
  )
  const activeChapterBlueprint = effectiveChapterBlueprints[safeChapterIndex] ?? null
  const safeChapterStepIndex = Math.max(
    0,
    Math.min(chapterSession.stepIndex, Math.max(0, (activeChapterBlueprint?.steps.length ?? 1) - 1)),
  )
  const activeChapterStep = activeChapterBlueprint?.steps[safeChapterStepIndex] ?? null
  const chapterProgressPercent =
    activeChapterBlueprint && activeChapterBlueprint.steps.length > 0
      ? ((safeChapterStepIndex + 1) / activeChapterBlueprint.steps.length) * 100
      : 0
  const currentChapterAnswer =
    activeChapterStep?.type === 'question' ? (chapterSession.answersByStepId[activeChapterStep.id] ?? '') : ''
  const currentChapterFeedback =
    activeChapterStep?.type === 'question' ? (chapterSession.feedbackByStepId[activeChapterStep.id] ?? '') : ''
  const currentChapterIsCorrect =
    activeChapterStep?.type === 'question' ? chapterSession.correctnessByStepId[activeChapterStep.id] : undefined
  const hasCurrentChapterEvaluation = typeof currentChapterIsCorrect === 'boolean'
  const totalAnsweredChapterQuestions = Object.keys(chapterSession.correctnessByStepId).length
  const totalCorrectChapterQuestions = Object.values(chapterSession.correctnessByStepId).filter(Boolean).length
  const totalWrongChapterQuestions = Math.max(0, totalAnsweredChapterQuestions - totalCorrectChapterQuestions)
  const chapterAccuracyPercent =
    totalAnsweredChapterQuestions > 0
      ? Math.round((totalCorrectChapterQuestions / totalAnsweredChapterQuestions) * 100)
      : 0

  const displayName = getUserDisplayName(user, profile)
  const avatarFallback = getAvatarFallbackLetter(user, profile)
  const subscriptionPlanName = profile?.subscription_plans?.name ?? null

  const previewBlueprint = effectiveChapterBlueprints[0]
  const rawPreviewChapterTitle =
    previewBlueprint?.title ?? learningChapters[0] ?? `Grundlagen zu ${effectiveTopic || 'deinem Thema'}`
  const previewChapterTitle = sanitizeChapterTitleForUi(rawPreviewChapterTitle, 0, effectiveTopic)
  const previewExplanationStep =
    previewBlueprint?.steps.find(
      (step): step is Extract<ChapterStep, { type: 'explanation' }> => step.type === 'explanation',
    ) ?? null
  const previewStepCount = previewBlueprint?.steps.length ?? 0
  const previewQuestionCount = previewBlueprint?.steps.filter((step) => step.type === 'question').length ?? 0
  const previewCompleted = chapterSession.completedChapterIndexes.includes(safeChapterIndex)
  const previewStatusLabel = previewCompleted
    ? 'Abgeschlossen'
    : chapterSession.chapterIndex === safeChapterIndex && chapterSession.stepIndex > 0
      ? 'In Bearbeitung'
      : 'Bereit'
  const previewStatusText = previewCompleted
    ? 'Du hast dieses Kapitel bereits abgeschlossen.'
    : chapterSession.chapterIndex === safeChapterIndex && chapterSession.stepIndex > 0
      ? `Du bist gerade in Schritt ${safeChapterStepIndex + 1}.`
      : 'Dieses Kapitel ist bereit zum Start.'
  const previewRecommendation =
    totalWrongChapterQuestions > 0
      ? `Fokus: ${totalWrongChapterQuestions} offene Schwachpunkte zuerst stabilisieren.`
      : totalAnsweredChapterQuestions > 0
        ? 'Stark! Weiter so, du kannst das Tempo leicht erhoehen.'
        : 'Startklar: Beginne mit den Kernkonzepten und teste direkt dein Verstaendnis.'
  const currentChapterStepProgressPercent =
    previewStepCount > 0 ? ((safeChapterStepIndex + 1) / previewStepCount) * 100 : 0
  const isAllChaptersCompleted =
    effectiveChapterBlueprints.length > 0 &&
    chapterSession.completedChapterIndexes.length >= effectiveChapterBlueprints.length
  const previewGreetingText = isAllChaptersCompleted
    ? 'Stark gemacht. Alle Lernbloecke abgeschlossen - bis bald und weiter so.'
    : previewCompleted
      ? 'Sehr gut, dieser Lernblock ist abgeschlossen. Du kannst direkt den naechsten starten.'
      : chapterSession.chapterIndex === safeChapterIndex && chapterSession.stepIndex > 0
        ? `Willkommen zurueck. Du bist bei Schritt ${safeChapterStepIndex + 1} und machst guten Fortschritt.`
        : 'Willkommen. Dein Lernblock ist bereit - starte mit dem ersten Schritt.'
  const hasStartedFirstChapter =
    chapterSession.chapterIndex > 0 ||
    chapterSession.stepIndex > 0 ||
    chapterSession.completedChapterIndexes.length > 0 ||
    totalAnsweredChapterQuestions > 0
  const showChapterPreview = learningChapters.length > 0 || isChapterPreviewVisible
  const previewEstimatedMinutes = Math.max(5, Math.round(previewStepCount * 1.2))
  const previewChapterBullets =
    previewExplanationStep?.bullets && previewExplanationStep.bullets.length > 0
      ? previewExplanationStep.bullets
      : [
          `${previewChapterTitle} sicher verstehen`,
          'Wichtige Kernkonzepte strukturiert aufbauen',
          'Typische Fehlerquellen in der Praxis vermeiden',
        ]
  const proficiencyLabel =
    proficiencyLevel === 'low'
      ? 'Schlecht'
      : proficiencyLevel === 'medium'
        ? 'Mittel'
        : proficiencyLevel === 'high'
          ? 'Gut'
          : '-'

  return {
    entryQuizTotalQuestions,
    activeEntryQuestion,
    hasMultipleChoiceOptions,
    activeEntryAnswer,
    isLastEntryQuestion,
    entryQuizProgressPercent,
    safeChapterIndex,
    activeChapterBlueprint,
    safeChapterStepIndex,
    activeChapterStep,
    chapterProgressPercent,
    currentChapterAnswer,
    currentChapterFeedback,
    currentChapterIsCorrect,
    hasCurrentChapterEvaluation,
    totalAnsweredChapterQuestions,
    totalCorrectChapterQuestions,
    totalWrongChapterQuestions,
    chapterAccuracyPercent,
    displayName,
    avatarFallback,
    subscriptionPlanName,
    previewChapterTitle,
    previewStepCount,
    previewQuestionCount,
    previewCompleted,
    previewStatusLabel,
    previewStatusText,
    previewRecommendation,
    currentChapterStepProgressPercent,
    isAllChaptersCompleted,
    previewGreetingText,
    hasStartedFirstChapter,
    showChapterPreview,
    previewEstimatedMinutes,
    previewChapterBullets,
    proficiencyLabel,
  }
}
