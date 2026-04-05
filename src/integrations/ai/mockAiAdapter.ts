import { readAssistantEmojisEnabled } from '../../features/chat/constants/chatAssistantStyle'
import type { ChatMessage } from '../../features/chat/types'

const cannedResponses = [
  'Klingt gut. Ich habe den Punkt verstanden und kann als Nächstes einen konkreten Schritt vorschlagen.',
  'Für den Prototypen reicht das völlig aus. Wir können später den echten Provider austauschen.',
  'Ich habe deine Nachricht verarbeitet. Soll ich daraus eine kurze To-do-Liste erzeugen?',
  'Notiert. Ich kann dir dafür direkt eine strukturierte Antwort mit nächsten Aktionen geben.',
]

export async function getMockAssistantReply(messages: ChatMessage[]) {
  const latestUserMessage = [...messages].reverse().find((msg) => msg.role === 'user')
  const fallback =
    cannedResponses[Math.floor(Math.random() * cannedResponses.length)] ??
    'Mock-Antwort erzeugt.'

  await new Promise((resolve) => {
    window.setTimeout(resolve, 600)
  })

  if (!latestUserMessage?.content.trim()) {
    return fallback
  }

  const body = `Mock-Antwort: "${latestUserMessage.content.trim()}"\n\n${fallback}`
  return readAssistantEmojisEnabled() ? `${body}\n\n(Demo mit Emoji ✨)` : body
}
