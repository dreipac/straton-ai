import { stripComposerAttachmentBlocksForRouting } from '../utils/chatRoutingText'

/** Assistent setzt diese Zeile — Client rendert die Abo-Karten wie in Einstellungen → Konto. */
export const SUBSCRIPTION_USAGE_MARKER = '[[STRATON_SUBSCRIPTION_USAGE]]'

const MARKER_RE = /\[\[STRATON_SUBSCRIPTION_USAGE\]\]/g

export function userMessageRequestsSubscriptionUsage(content: string): boolean {
  const t = stripComposerAttachmentBlocksForRouting(content).toLowerCase()
  if (!t) {
    return false
  }
  const patterns = [
    /\bverbrauch\b/,
    /\bguthaben\b/,
    /\blimit(s)?\b/,
    /\babo(nnement)?\b/,
    /\bkontingent(e)?\b/,
    /\bwas kann ich (noch )?(nutzen|verwenden|machen|generieren)\b/,
    /\bwie viel (hab(e|) ich|ist|noch) (noch )?(übrig|verbraucht|frei|left|drauf)\b/,
    /\bmein(e)? (tokens|limits|guthaben|kontingente)\b/,
    /\b(straton|konto).*(verbrauch|limit|guthaben|abo)\b/,
    /\b(verbrauch|limit|guthaben|abo).*(straton|konto)\b/,
    /\b(ki-)?bild(er)?\b.*\b(guthaben|limit|verbrauch|noch)\b/,
    /\bwebsuche\b.*\b(guthaben|limit|verbrauch|noch)\b/,
    /\bthinking\b.*\b(guthaben|limit|verbrauch|noch|anfragen)\b/,
    /\bsmart instant\b.*\b(token|verbrauch|limit|noch)\b/,
    /\btoken(s)?\b.*\b(heute|verbraucht|übrig|limit)\b/,
    /\beinstellungen\b.*\bkonto\b/,
    /\b(?:aktuell\w*|derzeit\w*|momentan\w*).*\b(?:verbrauch|guthaben|limits?|tokens?|abo|kontingent|smart instant|websuche|thinking|bildgenerierung)\b/,
    /\b(?:verbrauch|guthaben|limits?|tokens?|abo|kontingent).*\b(?:aktuell\w*|derzeit\w*|momentan\w*)\b/,
    /\b(?:siehst|sind|ist|zeig\w*|stimm\w*).*\b(?:daten|zahlen|werte|angaben)\b.*\b(?:verbrauch|guthaben|straton|konto|abo|tokens?)\b/,
  ]
  return patterns.some((pattern) => pattern.test(t))
}

/** Folgefrage zur Aktualität der zuvor gezeigten Verbrauchskarten — kein Live-Web. */
export function userMessageAsksAboutPriorSubscriptionUsage(
  content: string,
  priorTurns?: ReadonlyArray<{ role: string; content?: string | null }>,
): boolean {
  if (userMessageRequestsSubscriptionUsage(content)) {
    return true
  }
  const t = stripComposerAttachmentBlocksForRouting(content).toLowerCase()
  if (!t) {
    return false
  }
  const asksFreshness =
    /\b(?:aktuell\w*|derzeit\w*|momentan\w*|up[\s-]?to[\s-]?date|stimmt\s+das|stimmen\s+die|korrekt|richtig)\b/.test(t)
  const refersToShownData =
    /\b(?:daten|zahlen|werte|angaben|karten|diagramm|übersicht|verbrauch|guthaben|tokens?|limits?)\b/.test(t) ||
    /\b(?:das|die|diese)\b/.test(t)
  if (!asksFreshness || !refersToShownData) {
    return false
  }
  const prior = priorTurns ?? []
  for (let i = prior.length - 1; i >= 0; i -= 1) {
    const turn = prior[i]
    if (turn.role === 'assistant' && messageContainsSubscriptionUsageMarker(turn.content ?? '')) {
      return true
    }
    if (turn.role === 'user' && userMessageRequestsSubscriptionUsage(turn.content ?? '')) {
      return true
    }
  }
  return false
}

export function messageContainsSubscriptionUsageMarker(content: string): boolean {
  return content.includes(SUBSCRIPTION_USAGE_MARKER)
}

export function stripSubscriptionUsageMarker(content: string): string {
  return content
    .replace(MARKER_RE, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
