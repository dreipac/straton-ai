import { env } from '../../../config/env'
import { getMockAssistantReply } from '../../../integrations/ai/mockAiAdapter'
import { getSupabaseClient } from '../../../integrations/supabase/client'
import type { ChatMessage } from '../types'
import { evaluateInteractiveAnswer, type InteractiveQuizQuestion } from '../utils/interactiveQuiz'

type SendMessageResult = {
  assistantMessage: ChatMessage
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

const INTERACTIVE_QUIZ_PROMPT = [
  'Du bist Straton AI.',
  'Wenn der Nutzer nach einer Pruefung, einem Quiz, Test oder Lernaufgaben fragt, liefere immer direkt ein interaktives Quiz mit strukturiertem Quiz-Block.',
  'Stelle in diesem Fall keine Rueckfrage, ob es interaktiv sein soll.',
  'Erstelle die interaktiven Fragen sofort in derselben Antwort.',
  'Format des Blocks (ohne Code-Fences, exakt die Marker verwenden):',
  '<<<STRATON_QUIZ_JSON>>>',
  '{"title":"...","questions":[{"id":"q1","prompt":"...","expectedAnswer":"...","acceptableAnswers":["..."],"evaluation":"exact","hint":"...","explanation":"..."}]}',
  '<<<END_STRATON_QUIZ_JSON>>>',
  'Regeln:',
  '- Bei Pruefungs/Quiz/Test-Anfragen: zuerst kurzer Einleitungstext, danach genau ein Quiz-JSON-Block in derselben Antwort.',
  '- Frage den Nutzer nicht nach dem Modus, sondern liefere direkt interaktiv.',
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
