import { DEFAULT_AI_CREDITS_BALANCE_MAX } from '../../../auth/constants/aiCredits'
import type { ChatThinkingMode } from '../../constants/chatThinkingMode'

/** Denken zieht aus dem gemeinsamen KI-Credits-Pool (Chat + Denken), Props/Namen historisch noch
 *  "thinking*" (kleinerer Umbau als vollständige Umbenennung durch den Chat-Baustein). */
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
  const creditsMaxCap =
    typeof thinkingCreditMax === 'number' ? thinkingCreditMax : DEFAULT_AI_CREDITS_BALANCE_MAX

  if (chatThinkingMode !== 'thinking' || typeof thinkingCreditsRemaining !== 'number' || tokenLimitReached) {
    return null
  }

  return (
    <p
      className={`chat-websearch-credits-hint${thinkingCreditsBlocked ? ' chat-thinking-credits-hint--empty' : ''}`}
      role="status"
    >
      {thinkingCreditsBlocked
        ? 'KI-Credits-Guthaben aufgebraucht. Weiter geht es nach der täglichen Aufladung (UTC) oder mit neuem Abo-Guthaben.'
        : `Noch ${thinkingCreditsRemaining} KI-Credits (max. ${creditsMaxCap} Kontostand).`}
      {!thinkingCreditsBlocked && typeof thinkingDailyGrant === 'number' && thinkingDailyGrant > 0
        ? ` Täglich +${thinkingDailyGrant} (UTC).`
        : ''}
    </p>
  )
}
