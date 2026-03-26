import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { evaluateQuizAnswerWithAi, sendMessage } from '../../chat/services/chat.service'
import type { ChatMessage } from '../../chat/types'
import { parseInteractiveContentWithFallback, type InteractiveQuizPayload } from '../../chat/utils/interactiveQuiz'
import type { ChapterBlueprint, ChapterSession, EntryQuizResult, TutorChatEntry, UploadedMaterial } from '../services/learn.persistence'
import {
  CHAPTER_GENERATION_MAX_ATTEMPTS,
  CHAPTER_GENERATION_TIMEOUT_MS,
  DEFAULT_CHAPTER_SESSION,
  LEARN_TUTOR_SYSTEM_PROMPT,
  buildRichFallbackChapterSteps,
  ensureMinimumChapterDepth,
  getDisplayPathTitle,
  parseChapterBlueprintsFromText,
  parseLearningChaptersFromText,
} from '../utils/learnPageHelpers'
import { formatRelevantMaterialContext } from '../utils/ragLite'

type UseEntryQuizSubmissionFlowArgs = {
  entryQuiz: InteractiveQuizPayload | null
  isSubmittingEntryQuiz: boolean
  entryQuizAnswers: Record<string, string>
  entryQuizResult: EntryQuizResult | null
  effectiveTopic: string
  activePathTitle: string
  selectedTopic: string
  materials: UploadedMaterial[]
  closeEntryQuizModal: () => void
  setError: Dispatch<SetStateAction<string | null>>
  setIsSubmittingEntryQuiz: Dispatch<SetStateAction<boolean>>
  setEntryQuizResult: Dispatch<SetStateAction<EntryQuizResult | null>>
  setTutorMessages: Dispatch<SetStateAction<TutorChatEntry[]>>
  setIsChapterPreviewVisible: Dispatch<SetStateAction<boolean>>
  setIsPostEntryPrepLoading: Dispatch<SetStateAction<boolean>>
  setPostEntryPrepStepIndex: Dispatch<SetStateAction<number>>
  setPostEntryPrepPercents: Dispatch<SetStateAction<number[]>>
  setLearningChapters: Dispatch<SetStateAction<string[]>>
  setChapterBlueprints: Dispatch<SetStateAction<ChapterBlueprint[]>>
  setChapterSession: Dispatch<SetStateAction<ChapterSession>>
}

export function useEntryQuizSubmissionFlow(args: UseEntryQuizSubmissionFlowArgs) {
  const {
    entryQuiz,
    isSubmittingEntryQuiz,
    entryQuizAnswers,
    entryQuizResult,
    effectiveTopic,
    activePathTitle,
    selectedTopic,
    materials,
    closeEntryQuizModal,
    setError,
    setIsSubmittingEntryQuiz,
    setEntryQuizResult,
    setTutorMessages,
    setIsChapterPreviewVisible,
    setIsPostEntryPrepLoading,
    setPostEntryPrepStepIndex,
    setPostEntryPrepPercents,
    setLearningChapters,
    setChapterBlueprints,
    setChapterSession,
  } = args

  const handleSubmitEntryQuiz = useCallback(async () => {
    if (!entryQuiz || isSubmittingEntryQuiz) {
      return
    }

    setError(null)
    setIsSubmittingEntryQuiz(true)

    try {
      const cachedFeedback = entryQuizResult?.feedbackByQuestionId ?? {}
      const cachedCorrectness = entryQuizResult?.correctnessByQuestionId ?? {}
      const cachedAnswers = entryQuizResult?.evaluatedAnswersByQuestionId ?? {}

      const evaluations = await Promise.all(
        entryQuiz.questions.map(async (question) => {
          const answer = (entryQuizAnswers[question.id] ?? '').trim()
          const canReuseCachedEvaluation =
            cachedAnswers[question.id] === answer &&
            typeof cachedFeedback[question.id] === 'string' &&
            typeof cachedCorrectness[question.id] === 'boolean'

          if (canReuseCachedEvaluation) {
            return {
              questionId: question.id,
              answer,
              isCorrect: cachedCorrectness[question.id],
              feedback: cachedFeedback[question.id],
            }
          }

          const result = await evaluateQuizAnswerWithAi({
            question,
            userAnswer: answer,
          })
          return {
            questionId: question.id,
            answer,
            isCorrect: result.isCorrect,
            feedback: result.feedback,
          }
        }),
      )

      const score = evaluations.filter((entry) => entry.isCorrect).length
      const feedbackByQuestionId = evaluations.reduce<Record<string, string>>((acc, entry) => {
        acc[entry.questionId] = entry.feedback
        return acc
      }, {})
      const correctnessByQuestionId = evaluations.reduce<Record<string, boolean>>((acc, entry) => {
        acc[entry.questionId] = entry.isCorrect
        return acc
      }, {})
      const evaluatedAnswersByQuestionId = evaluations.reduce<Record<string, string>>((acc, entry) => {
        acc[entry.questionId] = entry.answer
        return acc
      }, {})

      setEntryQuizResult({
        score,
        total: entryQuiz.questions.length,
        feedbackByQuestionId,
        correctnessByQuestionId,
        evaluatedAnswersByQuestionId,
      })

      closeEntryQuizModal()
      setTutorMessages([])
      setIsChapterPreviewVisible(false)
      setIsPostEntryPrepLoading(true)
      setPostEntryPrepStepIndex(0)
      setPostEntryPrepPercents([0, 0])

      await new Promise<void>((resolve) => {
        let percent = 0
        const timerId = window.setInterval(() => {
          percent = Math.min(100, percent + (Math.floor(Math.random() * 8) + 5))
          setPostEntryPrepPercents((prev) => [percent, prev[1] ?? 0])
          if (percent >= 100) {
            window.clearInterval(timerId)
            resolve()
          }
        }, 55)
      })

      setPostEntryPrepStepIndex(1)

      let stageTwoPercent = 0
      const stageTwoTimerId = window.setInterval(() => {
        stageTwoPercent = Math.min(92, stageTwoPercent + (Math.floor(Math.random() * 5) + 3))
        setPostEntryPrepPercents((prev) => [prev[0] ?? 100, stageTwoPercent])
      }, 85)

      try {
        const evaluationSummary = entryQuiz.questions
          .map((question) => ({
            prompt: question.prompt,
            isCorrect: correctnessByQuestionId[question.id] === true,
            feedback: feedbackByQuestionId[question.id] ?? '',
          }))
          .map(
            (item, index) =>
              `${index + 1}. ${item.prompt}\nStatus: ${item.isCorrect ? 'sicher' : 'Lernpotenzial'}\nHinweis: ${
                item.feedback || '-'
              }`,
          )
          .join('\n\n')

        const chapterMaterialContext = formatRelevantMaterialContext(
          ((effectiveTopic || getDisplayPathTitle(activePathTitle)) + ' ' + selectedTopic + ' ' + evaluationSummary).trim(),
          materials,
          { maxChunks: 8, maxChars: 4200 },
        )

        const chapterRequest: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: [
            `Thema: ${effectiveTopic || getDisplayPathTitle(activePathTitle)}`,
            selectedTopic.trim() ? `Schwerpunkt: ${selectedTopic.trim()}` : 'Schwerpunkt: keiner',
            `Testergebnis: ${score}/${entryQuiz.questions.length}`,
            'Aufgabe: Erstelle max. 6 kapitelbasierte Lernkapitel anhand der Testergebnisse.',
            'Gewichte Kapitel mit Lernpotenzial detaillierter und starke Bereiche nur kurz.',
            'Erzeuge pro Kapitel eine gemischte Step-Struktur mit Erklaerungen und interaktiven Fragen.',
            'Erklaerungs-Steps sollen etwas ausfuehrlicher sein (ca. 2-4 Saetze), aber kompakt bleiben.',
            'In JEDEM Kapitel muss mindestens ein Praxisfall als Aufgabe vorkommen (realistisches IT-Szenario mit kurzer Loesungsidee).',
            'WICHTIG: Jedes Kapitel muss zwischen 8 und 14 Steps haben (kein kurzes Kapitel).',
            'Empfohlene Sequenz: warmup -> erklaerung -> frage -> erklaerung -> frage -> erklaerung -> frage -> recap.',
            'Fragetypen mischen: text und mcq.',
            'Ausgabeformat: Nur JSON-Array ohne Erklaerung.',
            'Schema pro Kapitel: {"id":"chapter-1","title":"...","description":"...","steps":[{"id":"...","type":"explanation","title":"...","content":"...","bullets":["..."]},{"id":"...","type":"question","questionType":"mcq","prompt":"...","options":["..."],"expectedAnswer":"...","acceptableAnswers":["..."],"evaluation":"exact","hint":"...","explanation":"..."},{"id":"...","type":"question","questionType":"text","prompt":"...","expectedAnswer":"...","acceptableAnswers":["..."],"evaluation":"contains","hint":"...","explanation":"..."},{"id":"...","type":"recap","title":"...","content":"...","bullets":["..."]}]}',
            `Auswertungsgrundlage:\n${evaluationSummary}`,
            chapterMaterialContext ? 'Materialauszuege:\n' + chapterMaterialContext : 'Materialauszuege: keine',
          ].join('\n\n'),
          createdAt: new Date().toISOString(),
        }

        let chapterResponse: Awaited<ReturnType<typeof sendMessage>> | null = null
        let chapterError: Error | null = null

        for (let attempt = 1; attempt <= CHAPTER_GENERATION_MAX_ATTEMPTS; attempt += 1) {
          try {
            chapterResponse = await Promise.race([
              sendMessage([chapterRequest], {
                systemPrompt: LEARN_TUTOR_SYSTEM_PROMPT,
              }),
              new Promise<never>((_, reject) => {
                window.setTimeout(() => reject(new Error('Kapitelgenerierung dauert zu lange. Bitte erneut versuchen.')), CHAPTER_GENERATION_TIMEOUT_MS)
              }),
            ])
            break
          } catch (err) {
            chapterError = err instanceof Error ? err : new Error('Kapitel konnten nicht generiert werden.')
            if (attempt >= CHAPTER_GENERATION_MAX_ATTEMPTS) {
              throw chapterError
            }
          }
        }

        if (!chapterResponse) {
          throw chapterError ?? new Error('Kapitel konnten nicht generiert werden.')
        }
        const parsed = parseInteractiveContentWithFallback(chapterResponse.assistantMessage.content)
        const parsedContent = parsed.cleanText || chapterResponse.assistantMessage.content
        const parsedBlueprints = ensureMinimumChapterDepth(parseChapterBlueprintsFromText(parsedContent))
        const generated = parseLearningChaptersFromText(parsedContent)
        const nextLearningChapters =
          generated.length > 0
            ? generated.slice(0, 6)
            : [
                `Grundlagen von ${effectiveTopic || 'deinem Thema'} festigen`,
                'Schwaechere Bereiche aus dem Einstiegstest vertiefen',
                'Kurzer Praxis-Transfer fuer sichere Themen',
              ]
        const nextBlueprints: ChapterBlueprint[] =
          parsedBlueprints.length > 0
            ? parsedBlueprints
            : (nextLearningChapters.map((title, index) => ({
                id: `chapter-${index + 1}`,
                title,
                steps: buildRichFallbackChapterSteps(title, index),
              })) as ChapterBlueprint[])

        window.clearInterval(stageTwoTimerId)
        setPostEntryPrepPercents((prev) => [prev[0] ?? 100, 100])

        setLearningChapters(nextLearningChapters)
        setChapterBlueprints(nextBlueprints)
        setChapterSession(DEFAULT_CHAPTER_SESSION)
        setTutorMessages([
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'Anhand deiner Testergebnisse wurden Lernkapitel generiert.',
            action: 'open-entry-test',
          },
        ])
      } finally {
        window.clearInterval(stageTwoTimerId)
      }
    } catch (err) {
      console.error('Lernbereich: Kapitelgenerierung fehlgeschlagen', err)
      setError(err instanceof Error ? err.message : 'Einstiegstest konnte nicht abgegeben werden.')
    } finally {
      setIsPostEntryPrepLoading(false)
      setIsSubmittingEntryQuiz(false)
    }
  }, [
    activePathTitle,
    closeEntryQuizModal,
    effectiveTopic,
    entryQuiz,
    entryQuizAnswers,
    entryQuizResult,
    isSubmittingEntryQuiz,
    materials,
    selectedTopic,
    setChapterBlueprints,
    setChapterSession,
    setEntryQuizResult,
    setError,
    setIsChapterPreviewVisible,
    setIsPostEntryPrepLoading,
    setIsSubmittingEntryQuiz,
    setLearningChapters,
    setPostEntryPrepPercents,
    setPostEntryPrepStepIndex,
    setTutorMessages,
  ])

  return {
    handleSubmitEntryQuiz,
  }
}
