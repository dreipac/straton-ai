import type { UserProfile } from '../../auth/services/auth.service'
import {
  buildAccountSubscriptionDisplay,
  formatAccountSubscriptionDisplayForAi,
  type AccountSubscriptionDisplay,
} from '../../settings/utils/accountSubscriptionDisplay'

export type ChatSubscriptionUsageContext = {
  display: AccountSubscriptionDisplay | null
}

/** Aus Auth-Profil — kein Extra-Request pro Chat-Turn. */
export function resolveChatSubscriptionUsageContext(
  profile: Pick<UserProfile, 'subscription_plans' | 'subscription_usages'> | null,
): ChatSubscriptionUsageContext {
  return {
    display: buildAccountSubscriptionDisplay(
      profile?.subscription_plans ?? null,
      profile?.subscription_usages ?? null,
    ),
  }
}

let cachedInstructionKey = ''
let cachedInstruction = ''

/**
 * Abo-Verbrauch für die KI (Hauptchat) — direkt nach Nutzer-Identität, vor Datum.
 */
export function getChatSubscriptionUsageInstruction(
  ctx: ChatSubscriptionUsageContext | null | undefined,
): string {
  const display = ctx?.display ?? null
  const cacheKey = display
    ? `${display.planName}\0${formatAccountSubscriptionDisplayForAi(display)}`
    : 'no-plan'
  if (cacheKey === cachedInstructionKey) {
    return cachedInstruction
  }

  if (!display) {
    cachedInstructionKey = cacheKey
    cachedInstruction = [
      'Abonnement-Verbrauch (Straton-Konto):',
      '- Kein Abo zugewiesen.',
      '- Bei Fragen zu Verbrauch, Limits oder Guthaben: erklären, dass ein Administrator ein Abo zuweisen muss (Einstellungen → Konto).',
      '- Keine erfundenen Zahlen oder Limits nennen.',
    ].join('\n')
    return cachedInstruction
  }

  const data = formatAccountSubscriptionDisplayForAi(display)
  cachedInstructionKey = cacheKey
  cachedInstruction = [
    'Abonnement-Verbrauch (verbindlich — aktueller Stand wie Einstellungen → Konto):',
    data,
    '- Bei Fragen zu Verbrauch, Limits, Guthaben, «was kann ich noch nutzen», «wie viel habe ich verbraucht», Abo-Kontingent, Smart Instant, Bilder, Websuche, Thinking, Dateien: kurze Einleitung (1–2 Sätze), dann genau eine eigene Zeile nur mit [[STRATON_SUBSCRIPTION_USAGE]] — die App zeigt darunter dieselben Karten wie in den Einstellungen.',
    '- Keine Zahlen-Listen oder Tabellen duplizieren, wenn du den Marker setzt — die Karten übernehmen die Darstellung.',
    '- Zahlen ausschliesslich aus diesem Block; nichts erfinden oder schätzen.',
  ].join('\n\n')
  return cachedInstruction
}
