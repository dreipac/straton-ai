import { userMessageRequestsDirectAnswer } from './chatDirectAnswerInstruction'
import { isGeminiInstantEnabled } from '../services/geminiInstantFlag'
import type { ThinkingAnalyzeResult, ThinkingTaskType } from './thinkingAnalyze'
import type { ThinkingOutputTier } from './thinkingOutputTier'
import { resolveThinkingOutputTier } from './thinkingOutputTier'

/** Rich-Tier: nur gpt-5-mini (kein Fallback auf gpt-4o-mini). */
export const THINKING_RICH_OPENAI_MODELS = ['gpt-5-mini'] as const
/** Legacy-Final (MC, direkte Antwort ohne Rich): gpt-5-mini mit Fallback. */
export const THINKING_FINAL_OPENAI_MODELS = ['gpt-5-mini', 'gpt-4o-mini'] as const

export function shouldRouteThinkingRichToOpenAi(tier: ThinkingOutputTier): boolean {
  return tier === 'rich'
}

export function resolveThinkingOutputTierForRouting(
  analyze?: Pick<ThinkingAnalyzeResult, 'task_type' | 'output_tier'> | Pick<ThinkingAnalyzeResult, 'task_type'> | null,
  userMessage?: string,
): ThinkingOutputTier {
  if (!analyze) {
    return 'standard'
  }
  if (analyze.task_type === 'document_summary') {
    return 'rich'
  }
  return resolveThinkingOutputTier(analyze as ThinkingAnalyzeResult, userMessage)
}

export function shouldRouteThinkingFinalToOpenAi(
  analyze?:
    | Pick<ThinkingAnalyzeResult, 'task_type' | 'output_tier'>
    | Pick<ThinkingAnalyzeResult, 'task_type'>
    | null,
  userMessage?: string,
): boolean {
  const tier = resolveThinkingOutputTierForRouting(analyze, userMessage)
  if (shouldRouteThinkingRichToOpenAi(tier)) {
    return true
  }
  if (isGeminiInstantEnabled()) {
    return false
  }
  const trimmed = (userMessage ?? '').trim()
  if (analyze?.task_type === 'document_summary') {
    return true
  }
  if (trimmed && userMessageRequestsDirectAnswer(trimmed)) {
    return true
  }
  return false
}

export function shouldSuppressThinkingMandatoryFollowUp(
  analyze?: Pick<ThinkingAnalyzeResult, 'task_type'> | null,
  userMessage?: string,
): boolean {
  if (shouldRouteThinkingFinalToOpenAi(analyze, userMessage)) {
    return true
  }
  if (analyze?.task_type === 'troubleshooting' || analyze?.task_type === 'decision_planning') {
    return false
  }
  return false
}

/** Intent-Regeln für Thinking-Analyse (Client + Edge spiegeln). */
export function buildThinkingAnalyzeIntentPromptSection(): string {
  return [
    'Intent & task_type (verbindlich):',
    '- MC/Auswahlfrage mit Optionen (A/B/C …) → task_type general_howto, needs_clarification false (finale Antwort: kurz, OpenAI).',
    '- [Datei:…] oder Bild + zusammenfassen/fassen/überblick → document_summary, output_tier rich, layout_hint cards, needs_clarification false.',
    '- Server/Linux/VPS/SSL → server_setup; Software installieren → software_setup; Fehler/debug → troubleshooting.',
    '- Vergleich/Entscheidung → decision_planning; How-to/Ablauf → process_howto; offene Erklärung → general_howto.',
    '- «Quiz/Fragen erzeugen» → general_howto (kein MC lösen).',
    '',
    'Medien:',
    '- Bild-Anhang + beschreiben/lesen/OCR → document_summary, needs_clarification false.',
    '- Word/PDF/Excel-Export → clientseitig separat; hier nur inhaltliche Aufgabe.',
  ].join('\n')
}

export function buildThinkingTaskTypeTurnBriefing(
  analyze: Pick<ThinkingAnalyzeResult, 'task_type' | 'complexity' | 'layout_hint'>,
  userMessage?: string,
): string {
  const trimmed = (userMessage ?? '').trim()
  if (trimmed && userMessageRequestsDirectAnswer(trimmed)) {
    return [
      'Thinking — MC/Auswahl (verbindlich, gpt-5-mini):',
      '- **Antwort zuerst:** `**Antwort: X**` oder kleine Tabelle mit ✓ — kein langer Essay.',
      '- Höchstens 1–2 Sätze Begründung danach.',
      '- Kein `### Verbesserungen`, keine Schluss-Anpassungsfrage.',
    ].join('\n')
  }

  switch (analyze.task_type) {
    case 'document_summary':
      return [
        'Thinking — Zusammenfassung (verbindlich, Rich gpt-5-mini — Playbook im Layout-Profil):',
        '- Alle Pflicht-Themen aus der Analyze-Checkliste abdecken.',
        '- Schulblatt/Übungs-PDF: **integriertes Lernskript** — Fragen beantworten, Aufgaben inhaltlich ausarbeiten, Lücken füllen — **ohne** «Aufgabe:/Lösung:»-Format.',
        '- Nicht beschreiben, was das Dokument «deckt/thematisiert» — **Inhalt** aus dem [Datei]-Block liefern.',
        '- Jedes Hauptthema als ```cards``` mit tone/badges — kein Meta-Text, keine Bullet-Listen bei parallelen Kategorien.',
        '- Kein `### Verbesserungen`, keine Pflicht-Anpassungsfrage am Schluss.',
      ].join('\n')
    case 'server_setup':
    case 'software_setup':
      return [
        'Thinking — Setup (Gemini Flash Lite, ausführlich):',
        '- Voraussetzungen → Überblick → Schritt für Schritt (Aktion, Ergebnis, typischer Fehler) → Test → Fehlerbehebung → Checkliste.',
        '- Nummerierte `##`-Kapitel, zwischen Hauptteilen `---`.',
      ].join('\n')
    case 'troubleshooting':
      return [
        'Thinking — Fehlerdiagnose (Gemini Flash Lite):',
        '- Symptom & Ursachen → Diagnose-Schritte → Behebung je Befund → wenn es weiter scheitert.',
        '- Konkret, keine generischen Platzhalter.',
      ].join('\n')
    case 'decision_planning':
      return [
        'Thinking — Entscheidung (Gemini Flash Lite):',
        '- Kriterien → Optionen vergleichen (Tabelle) → Empfehlung mit Begründung → nächste Schritte.',
      ].join('\n')
    case 'process_howto':
      return [
        'Thinking — How-to (Gemini Flash Lite):',
        '- Ziel klar → nummerierte Schritte mit Erwartung je Schritt → optional Checkliste.',
        '- Fließtext + Stichpunkte mischen, nicht nur Bullets.',
      ].join('\n')
    case 'general_howto':
    case 'other':
    default:
      return [
        'Thinking — Erklärung/Aufgabe (Gemini Flash Lite):',
        '- `##`-Überschrift, dann passende Tiefe: Absätze, Listen, Tabellen wenn hilfreich.',
        '- Bei komplexem Stoff: nummerierte Kapitel mit `---` dazwischen.',
        '- Einfache Sprache; nichts erfinden.',
      ].join('\n')
  }
}

export function thinkingTaskTypeLabel(taskType: ThinkingTaskType): string {
  switch (taskType) {
    case 'document_summary':
      return 'Zusammenfassung'
    case 'server_setup':
      return 'Server-Setup'
    case 'software_setup':
      return 'Software-Setup'
    case 'troubleshooting':
      return 'Fehlerdiagnose'
    case 'decision_planning':
      return 'Entscheidung'
    case 'process_howto':
      return 'Anleitung'
    case 'general_howto':
      return 'Erklärung'
    default:
      return 'Aufgabe'
  }
}
