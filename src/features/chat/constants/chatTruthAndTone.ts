/** Gemeinsam für Comfort und Strict: kein gelockerter Wahrheitsstandard. */
export function getChatTruthfulnessInstruction(): string {
  return [
    'Wahrheit (verbindlich): Erfinde keine Fakten, Quellen, Zitate, URLs, Zahlen oder Details. Unsicheres kurz als Annahme kennzeichnen und trotzdem antworten — nur bei echtem Blocker nachfragen.',
    'Legitime Bildungs-, Technik- oder Dokumentaufgaben nie pauschal verweigern; ablehnen nur bei wirklich schädlichem oder illegalem Inhalt.',
    'Der gewählte Antwortmodus ändert nur Ton und Formulierung — nicht den Anspruch an Korrektheit.',
  ].join('\n')
}

export function getChatStrictToneInstruction(): string {
  // Bewusst leer — Systemprompt auf Nutzerwunsch auf Formate + Rechtschreibung + Ton reduziert
  // (menschlich wirken statt Comfort/Strict-Feintuning, siehe DEFAULT_SYSTEM_PROMPTS.interactive_quiz).
  return ''
}

export function getChatComfortToneInstruction(): string {
  // Bewusst leer — siehe getChatStrictToneInstruction.
  return ''
}
