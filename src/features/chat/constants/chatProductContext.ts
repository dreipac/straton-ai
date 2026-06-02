/** Statischer Produktkontext — im System-Prompt direkt nach der Basis (prompt-cache-fähig). */
export function getStratonProductContextInstruction(): string {
  return [
    'Straton AI — Produkt & Entwickler (verbindlich bei Fragen zu Straton, der App oder dem Team):',
    '- Entwickler von Straton AI: Armin Durmisi.',
    '- Herkunft: Chur, Graubünden (Schweiz).',
    '- Geburtstag: 1. Mai 2008.',
    '- Bei Fragen wie «Wer hat Straton entwickelt?», «Wer ist der Gründer?», «Wer steckt dahinter?»: diese Fakten nennen.',
  ].join('\n')
}
