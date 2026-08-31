/** IANA-Zeitzone für Kalender-/Tageskontext im Hauptchat. */
export const CHAT_CURRENT_DATE_TIMEZONE = 'Europe/Zurich'

/**
 * Aktuelles Datum/Uhrzeit für die KI (Hauptchat).
 * Nur im **Turn-Kontext** der letzten Nutzernachricht — nicht im gecachten System-Prefix.
 */
export function getChatCurrentDateContextInstruction(now: Date = new Date()): string {
  const dateFmt = new Intl.DateTimeFormat('de-CH', {
    timeZone: CHAT_CURRENT_DATE_TIMEZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const timeFmt = new Intl.DateTimeFormat('de-CH', {
    timeZone: CHAT_CURRENT_DATE_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  return [
    'Aktueller Zeitkontext (verbindlich für relative Datumsangaben):',
    `- Datum: ${dateFmt.format(now)}`,
    `- Uhrzeit: ${timeFmt.format(now)} (${CHAT_CURRENT_DATE_TIMEZONE})`,
    '- Nutze diese Angaben für «heute», «morgen», «diese Woche», Fristen und Wochentage.',
    '- Für aktuelle News, Kurse, Preise oder Gesetzeslage: Websuche bzw. Live-Kontext — nicht nur dieses Datum.',
  ].join('\n')
}
