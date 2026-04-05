import { DEFAULT_SYSTEM_PROMPTS } from '../../../config/systemPromptDefaults'
import {
  getAssistantEmojiStyleInstruction,
  getAssistantMarkdownFormattingInstruction,
} from '../constants/chatAssistantStyle'
import { env } from '../../../config/env'
import { getMockAssistantReply } from '../../../integrations/ai/mockAiAdapter'
import { getSupabaseClient } from '../../../integrations/supabase/client'
import type { LearnFlashcard, LearnWorksheetItem } from '../../learn/services/learn.persistence'
import type { ChatMessage } from '../types'
import { evaluateInteractiveAnswer, isMatchQuestion, type InteractiveQuizQuestion } from '../utils/interactiveQuiz'

type SendMessageResult = {
  assistantMessage: ChatMessage
}

type GenerateTitleResult = {
  title: string
}

type GenerateTopicSuggestionsResult = {
  suggestions: string[]
}

export type SendMessageOptions = {
  /** Zweiter System-Block (z. B. Lerntutor); unter den Basis-Quiz-Regeln. */
  systemPrompt?: string
  /** Ersetzt den Standard-Basisblock (Straton / Quiz-JSON-Regeln). */
  interactiveQuizPrompt?: string
}

type EvaluateQuizAnswerInput = {
  question: InteractiveQuizQuestion
  userAnswer: string
}

type EvaluateQuizAnswerResult = {
  isCorrect: boolean
  feedback: string
}

type GatewayMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const MAX_CHAT_TITLE_LENGTH = 42

function createAssistantMessage(content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content,
    createdAt: new Date().toISOString(),
  }
}

/** Liefert die vom Server gesendete Fehlermeldung (z. B. `{ error: "..." }`), sonst Status-Hinweis. */
async function messageFromFunctionsInvokeFailure(
  error: unknown,
  response: Response | undefined,
): Promise<string> {
  if (response) {
    try {
      const text = (await response.text()).trim()
      if (text) {
        try {
          const parsed = JSON.parse(text) as { error?: unknown }
          if (typeof parsed.error === 'string' && parsed.error.trim()) {
            return parsed.error.trim()
          }
        } catch {
          if (text.length < 800) {
            return text
          }
        }
      }
    } catch {
      // Response-Body nicht lesbar
    }
    if (response.status === 401) {
      return 'Nicht angemeldet oder Sitzung abgelaufen. Bitte neu anmelden.'
    }
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'Unbekannter Edge-Function-Fehler.'
}

function buildGatewayMessages(messages: ChatMessage[], options?: SendMessageOptions): GatewayMessage[] {
  const baseQuiz =
    options?.interactiveQuizPrompt?.trim() || DEFAULT_SYSTEM_PROMPTS.interactive_quiz
  const combinedSystemPrompt = [
    baseQuiz,
    options?.systemPrompt?.trim() ?? '',
    getAssistantMarkdownFormattingInstruction(),
    getAssistantEmojiStyleInstruction(),
  ]
    .filter(Boolean)
    .join('\n\n')

  return [
    {
      role: 'system',
      content: combinedSystemPrompt,
    },
    ...messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ]
}

async function getAssistantReply(messages: ChatMessage[], options?: SendMessageOptions) {
  if (env.aiProvider === 'openai') {
    const supabase = getSupabaseClient()
    const { data, error, response } = await supabase.functions.invoke('chat-completion', {
      body: {
        provider: 'openai',
        messages: buildGatewayMessages(messages, options),
      },
    })

    if (error) {
      throw new Error(await messageFromFunctionsInvokeFailure(error, response))
    }

    const content = data?.assistantMessage?.content
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('Der KI-Provider hat keine gueltige Antwort geliefert.')
    }

    return content
  }

  return getMockAssistantReply(messages)
}

export async function sendMessage(
  messages: ChatMessage[],
  options?: SendMessageOptions,
): Promise<SendMessageResult> {
  const content = await getAssistantReply(messages, options)
  return {
    assistantMessage: createAssistantMessage(content),
  }
}

function fallbackChatTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((message) => message.role === 'user')?.content?.trim() ?? ''
  if (!firstUser) {
    return 'Neuer Chat'
  }
  return firstUser.length > MAX_CHAT_TITLE_LENGTH
    ? `${firstUser.slice(0, MAX_CHAT_TITLE_LENGTH)}...`
    : firstUser
}

function sanitizeChatTitle(raw: string): string {
  const compact = raw
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!compact) {
    return ''
  }
  return compact.length > MAX_CHAT_TITLE_LENGTH ? compact.slice(0, MAX_CHAT_TITLE_LENGTH).trim() : compact
}

export async function generateChatTitleWithAi(messages: ChatMessage[]): Promise<GenerateTitleResult> {
  if (env.aiProvider !== 'openai') {
    return { title: fallbackChatTitle(messages) }
  }

  const supabase = getSupabaseClient()
  const { data, error, response } = await supabase.functions.invoke('chat-completion', {
    body: {
      mode: 'generate_title',
      provider: 'openai',
      payload: {
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      },
    },
  })

  if (error) {
    throw new Error(await messageFromFunctionsInvokeFailure(error, response))
  }

  const title = sanitizeChatTitle(String(data?.title ?? ''))
  if (!title) {
    return { title: fallbackChatTitle(messages) }
  }

  return { title }
}

export async function generateTopicSuggestionsWithAi(topic: string): Promise<GenerateTopicSuggestionsResult> {
  const normalizedTopic = topic.trim()
  if (!normalizedTopic) {
    return { suggestions: [] }
  }

  if (env.aiProvider !== 'openai') {
    return {
      suggestions: [
        `${normalizedTopic} Grundlagen`,
        `${normalizedTopic} Praxis`,
        `${normalizedTopic} Vertiefung`,
      ].slice(0, 5),
    }
  }

  const supabase = getSupabaseClient()
  const { data, error, response } = await supabase.functions.invoke('chat-completion', {
    body: {
      mode: 'generate_topic_suggestions',
      provider: 'openai',
      payload: {
        topic: normalizedTopic,
      },
    },
  })

  if (error) {
    throw new Error(await messageFromFunctionsInvokeFailure(error, response))
  }

  const rawSuggestions = Array.isArray(data?.suggestions) ? data.suggestions : []
  const suggestions = rawSuggestions
    .filter((entry: unknown): entry is string => typeof entry === 'string')
    .map((entry: string) => entry.trim())
    .filter(Boolean)
    .slice(0, 5)

  if (suggestions.length === 0) {
    return { suggestions: [`${normalizedTopic} Grundlagen`] }
  }

  return { suggestions }
}

export type { LearnFlashcard, LearnWorksheetItem } from '../../learn/services/learn.persistence'

function mockFlashcardsFromOutline(outline: string): LearnFlashcard[] {
  const topic = outline.split('\n').find((l) => l.startsWith('### '))?.replace(/^###\s+/, '').slice(0, 48) || 'Thema'
  return [
    {
      id: 'm1',
      question: `Was ist ein Kernpunkt in «${topic}»?`,
      answer: 'Im Mock-Modus gibt es keine KI. Bitte OpenAI in .env aktivieren fuer echte Lernkarten.',
    },
    {
      id: 'm2',
      question: 'Wie übst du am besten?',
      answer: 'Nutze die Kapitel-Schritte und den Einstiegstest; Lernkarten ergänzen das Wiederholen.',
    },
  ]
}

export async function generateLearnFlashcards(chapterOutline: string): Promise<LearnFlashcard[]> {
  const trimmed = chapterOutline.trim()
  if (!trimmed) {
    throw new Error('Keine Kapiteldaten fuer Lernkarten vorhanden.')
  }

  if (env.aiProvider !== 'openai') {
    return mockFlashcardsFromOutline(trimmed)
  }

  const supabase = getSupabaseClient()
  const { data, error, response } = await supabase.functions.invoke('chat-completion', {
    body: {
      mode: 'generate_flashcards',
      provider: 'openai',
      payload: {
        chapterOutline: trimmed,
      },
    },
  })

  if (error) {
    throw new Error(await messageFromFunctionsInvokeFailure(error, response))
  }

  const raw = Array.isArray(data?.flashcards) ? data.flashcards : []
  const cards: LearnFlashcard[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const o = entry as { question?: unknown; answer?: unknown }
    const question = typeof o.question === 'string' ? o.question.trim() : ''
    const answer = typeof o.answer === 'string' ? o.answer.trim() : ''
    if (question && answer) {
      cards.push({
        id: crypto.randomUUID(),
        question,
        answer,
      })
    }
  }

  if (cards.length === 0) {
    throw new Error('Keine Lernkarten von der KI erhalten.')
  }

  return cards.slice(0, 20)
}

/** Extrahiert Aufgaben aus der Edge-Response (toleriert alte Deploys und abweichende JSON-Keys). */
function parseWorksheetItemsFromInvokeData(data: unknown): LearnWorksheetItem[] {
  if (!data || typeof data !== 'object') {
    return []
  }
  const root = data as Record<string, unknown>

  const promptFromObject = (o: Record<string, unknown>): string => {
    const keys = ['prompt', 'question', 'task', 'text', 'aufgabe', 'content', 'title'] as const
    for (const key of keys) {
      const v = o[key]
      if (typeof v === 'string' && v.trim()) {
        return v.trim()
      }
    }
    return ''
  }

  const fromArray = (arr: unknown): LearnWorksheetItem[] => {
    if (!Array.isArray(arr)) {
      return []
    }
    const out: LearnWorksheetItem[] = []
    for (const entry of arr) {
      if (!entry || typeof entry !== 'object') {
        continue
      }
      const prompt = promptFromObject(entry as Record<string, unknown>)
      if (prompt) {
        out.push({ id: crypto.randomUUID(), prompt })
      }
    }
    return out
  }

  let items = fromArray(root.worksheetItems)
  if (items.length === 0) {
    items = fromArray(root.items)
  }
  if (items.length === 0) {
    items = fromArray(root.tasks)
  }
  /** Ältere/kaputte Edge-Route: Request mit Kapiteltext landet im Lernkarten-Zweig und liefert nur «flashcards». */
  if (items.length === 0 && Array.isArray(root.flashcards)) {
    const fromCards: LearnWorksheetItem[] = []
    for (const entry of root.flashcards) {
      if (!entry || typeof entry !== 'object') {
        continue
      }
      const o = entry as Record<string, unknown>
      const q = typeof o.question === 'string' ? o.question.trim() : ''
      if (q) {
        fromCards.push({ id: crypto.randomUUID(), prompt: q })
      }
    }
    items = fromCards
  }

  return items.slice(0, 20)
}

function mockWorksheetFromOutline(outline: string): LearnWorksheetItem[] {
  const topic = outline.split('\n').find((l) => l.startsWith('### '))?.replace(/^###\s+/, '').slice(0, 48) || 'Thema'
  return [
    {
      id: 'w1',
      prompt: `Erkläre in eigenen Worten einen zentralen Begriff aus «${topic}».`,
    },
    {
      id: 'w2',
      prompt: 'Im Mock-Modus gibt es keine KI. Bitte OpenAI in .env aktivieren für echte Arbeitsblatt-Aufgaben.',
    },
  ]
}

export async function generateLearnWorksheet(chapterOutline: string): Promise<LearnWorksheetItem[]> {
  const trimmed = chapterOutline.trim()
  if (!trimmed) {
    throw new Error('Keine Kapiteldaten fuer Arbeitsblatt vorhanden.')
  }

  if (env.aiProvider !== 'openai') {
    return mockWorksheetFromOutline(trimmed)
  }

  const supabase = getSupabaseClient()
  const { data, error, response } = await supabase.functions.invoke('chat-completion', {
    body: {
      mode: 'generate_worksheet',
      provider: 'openai',
      payload: {
        chapterOutline: trimmed,
      },
    },
  })

  if (error) {
    throw new Error(await messageFromFunctionsInvokeFailure(error, response))
  }

  const items = parseWorksheetItemsFromInvokeData(data)

  if (items.length === 0) {
    throw new Error(
      'Keine Aufgaben von der KI erhalten. Häufig: Edge-Function «chat-completion» ist nicht mit dem Modus «generate_worksheet» deployt — bitte deployen oder erneut versuchen.',
    )
  }

  return items
}

export async function evaluateQuizAnswerWithAi(
  input: EvaluateQuizAnswerInput,
): Promise<EvaluateQuizAnswerResult> {
  const trimmedAnswer = input.userAnswer.trim()
  if (!trimmedAnswer) {
    return {
      isCorrect: false,
      feedback: 'Bitte gib zuerst eine Antwort ein.',
    }
  }

  if (isMatchQuestion(input.question)) {
    return evaluateInteractiveAnswer(trimmedAnswer, input.question)
  }

  if (env.aiProvider !== 'openai') {
    return evaluateInteractiveAnswer(trimmedAnswer, input.question)
  }

  const supabase = getSupabaseClient()
  const { data, error, response } = await supabase.functions.invoke('chat-completion', {
    body: {
      mode: 'evaluate_quiz',
      provider: 'openai',
      payload: {
        question: input.question.prompt,
        expectedAnswer: input.question.expectedAnswer,
        acceptableAnswers: input.question.acceptableAnswers,
        userAnswer: trimmedAnswer,
      },
    },
  })

  if (error) {
    throw new Error(await messageFromFunctionsInvokeFailure(error, response))
  }

  const evaluation = data?.evaluation as { isCorrect?: unknown; feedback?: unknown } | undefined
  if (!evaluation) {
    throw new Error('Keine Bewertungsdaten von der KI erhalten.')
  }

  return {
    isCorrect: evaluation.isCorrect === true,
    feedback:
      typeof evaluation.feedback === 'string' && evaluation.feedback.trim()
        ? evaluation.feedback.trim()
        : evaluation.isCorrect === true
          ? 'Richtig.'
          : 'Nicht ganz korrekt.',
  }
}
