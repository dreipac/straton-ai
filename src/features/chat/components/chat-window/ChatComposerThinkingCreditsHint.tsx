import { DEFAULT_THINKING_CREDIT_MAX } from '../../../auth/constants/thinkingCredits'
import type { ChatThinkingMode } from '../../constants/chatThinkingMode'

type ChatComposerThinkingCreditsHintProps = {
  chatThinkingMode: ChatThinkingMode
  thinkingCreditsRemaining?: number
  thinkingCreditMax?: number
  thinkingDailyGrant?: number | null
  thinkingCreditsBlocked: boolean
  tokenLimitReached: boolean
}

export function ChatComposerThinkingCreditsHint({
  chatThinkingMode,
  thinkingCreditsRemaining,
  thinkingCreditMax,
  thinkingDailyGrant,
  thinkingCreditsBlocked,
  tokenLimitReached,
}: ChatComposerThinkingCreditsHintProps) {
  const thinkingMaxCap =
    typeof thinkingCreditMax === 'number' ? thinkingCreditMax : DEFAULT_THINKING_CREDIT_MAX

  if (chatThinkingMode !== 'thinking' || typeof thinkingCreditsRemaining !== 'number' || tokenLimitReached) {
    return null
  }

  return (
    <p
      className={`chat-websearch-credits-hint${thinkingCreditsBlocked ? ' chat-thinking-credits-hint--empty' : ''}`}
      role="status"
    >
      {thinkingCreditsBlocked
        ? 'Thinking-Guthaben aufgebraucht. Weitere Anfragen nach der täglichen Aufladung (UTC) oder mit neuem Abo-Guthaben.'
        : `Noch ${thinkingCreditsRemaining} Thinking-Anfrage(n) (max. ${thinkingMaxCap} Kontostand).`}
      {!thinkingCreditsBlocked && typeof thinkingDailyGrant === 'number' && thinkingDailyGrant > 0
        ? ` Täglich +${thinkingDailyGrant} (UTC).`
        : ''}
    </p>
  )
}
