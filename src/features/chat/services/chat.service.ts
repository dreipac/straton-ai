import { env } from '../../../config/env'
import { getMockAssistantReply } from '../../../integrations/ai/mockAiAdapter'
import { getSupabaseClient } from '../../../integrations/supabase/client'
import type { ChatMessage } from '../types'
import { evaluateInteractiveAnswer, type InteractiveQuizQuestion } from '../utils/interactiveQuiz'

type SendMessageResult = {
  assistantMessage: ChatMessage
}

type GenerateTitleResult = {
  title: string
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

const INTERACTIVE_QUIZ_PROMPT = [
  'Du bist Straton AI.',
  'Erzeuge ein interaktives Quiz nur dann, wenn der Nutzer es explizit verlangt.',
  'Als explizite Signale gelten z.B.: "mach ein Quiz", "interaktives Quiz", "Einstiegstest", "Teste mich", "Quiz starten".',
  'Wenn der Nutzer nicht explizit ein Quiz verlangt, antworte normal ohne Quiz-JSON-Block.',
  'Format des Blocks (ohne Code-Fences, exakt die Marker verwenden):',
  '<<<STRATON_QUIZ_JSON>>>',
  '{"title":"...","questions":[{"id":"q1","prompt":"...","expectedAnswer":"...","acceptableAnswers":["..."],"evaluation":"exact","hint":"...","explanation":"..."}]}',
  '<<<END_STRATON_QUIZ_JSON>>>',
  'Regeln:',
  '- Nur bei expliziter Quiz-Anfrage: zuerst kurzer Einleitungstext, danach genau ein Quiz-JSON-Block in derselben Antwort.',
  '- Ohne explizite Quiz-Anfrage niemals Quiz-JSON ausgeben.',
  '- Gib mindestens 3 Fragen zur Uebung aus.',
  '- expectedAnswer kurz und klar halten.',
  '- acceptableAnswers optional als Liste moeglicher Alternativen.',
  '- evaluation nur "exact" oder "contains".',
].join('\n')

function createAssistantMessage(content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content,
    createdAt: new Date().toISOString(),
  }
}

function buildGatewayMessages(messages: ChatMessage[]): GatewayMessage[] {
  return [
    {
      role: 'system',
      content: INTERACTIVE_QUIZ_PROMPT,
    },
    ...messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ]
}

async function getAssistantReply(messages: ChatMessage[]) {
  if (env.aiProvider === 'openai') {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.functions.invoke('chat-completion', {
      body: {
        provider: 'openai',
        messages: buildGatewayMessages(messages),
      },
    })

    if (error) {
      throw new Error(error.message)
    }

    const content = data?.assistantMessage?.content
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('Der KI-Provider hat keine gueltige Antwort geliefert.')
    }

    return content
  }

  return getMockAssistantReply(messages)
}

export async function sendMessage(messages: ChatMessage[]): Promise<SendMessageResult> {
  const content = await getAssistantReply(messages)
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
  const { data, error } = await supabase.functions.invoke('chat-completion', {
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
    throw new Error(error.message)
  }

  const title = sanitizeChatTitle(String(data?.title ?? ''))
  if (!title) {
    return { title: fallbackChatTitle(messages) }
  }

  return { title }
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

  if (env.aiProvider !== 'openai') {
    return evaluateInteractiveAnswer(trimmedAnswer, input.question)
  }

  const supabase = getSupabaseClient()
  const { data, error } = await supabase.functions.invoke('chat-completion', {
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
    throw new Error(error.message)
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
