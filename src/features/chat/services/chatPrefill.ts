/**
 * Eine vorbereitete Frage an den Chat uebergeben.
 *
 * Gebraucht von „Im Chat dazu fragen" am Knoten (UI-Spezifikation 3.6): der Lernpfad kennt die
 * Frage, der Chat besitzt das Eingabefeld. Ohne diese Uebergabe landet die Person im leeren Chat
 * und muss die Frage noch einmal selbst formulieren — womit der Knopf zwar funktioniert, aber
 * nichts erspart.
 *
 * Warum `sessionStorage` und nicht ein Routenzustand: der Weg fuehrt ueber einen Seitenwechsel,
 * und das Eingabefeld sitzt drei Ebenen tief in einer Komponente, die von der Route nichts weiss.
 * Ein durchgereichter Zustand haette drei unbeteiligte Bauteile um ein Feld erweitert, das sie
 * nur weitergeben.
 *
 * Der Entwurf gilt fuer genau einen Chatbesuch: gelesen wird beim Aufbau des Eingabefelds,
 * geloescht unmittelbar danach. Ein liegengebliebener Entwurf, der Tage spaeter wieder auftaucht,
 * waere unerklaerlich.
 */

const KEY = 'straton.chat.prefill'

export function stageChatPrefill(text: string): void {
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return
  }
  try {
    window.sessionStorage.setItem(KEY, trimmed)
  } catch {
    // Privater Modus: dann oeffnet der Chat eben leer. Kein Grund, den Wechsel abzubrechen.
  }
}

/** Lesen ohne Nebenwirkung — damit der Aufruf in einem Zustandsinitialisierer unbedenklich ist. */
export function readChatPrefill(): string {
  try {
    return window.sessionStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function clearChatPrefill(): void {
  try {
    window.sessionStorage.removeItem(KEY)
  } catch {
    // siehe oben
  }
}
