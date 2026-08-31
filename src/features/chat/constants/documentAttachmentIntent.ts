/** Nur die Nutzerfrage (ohne `[Datei:…]`-Extrakt) — für Intent-Heuristiken. */
export function normalizeDocumentIntentUserText(text: string): string {
  return text
    .replace(/\[Datei:[^\]]*\][\s\S]*?\[\/Datei\]/gi, '')
    .replace(/\[BildData:[^\]]*\][\s\S]*?\[\/BildData\]/gi, '')
    .replace(/\[Bild:[^\]]*\][\s\S]*?\[\/Bild\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Nutzer fragt nur, ob der Anhang/Inhalt sichtbar oder lesbar ist —
 * kein Zusammenfassungs-, Quiz- oder Lösungsauftrag.
 */
export function userAsksDocumentVisibilityQuestion(text: string): boolean {
  const t = normalizeDocumentIntentUserText(text)
  if (!t) {
    return false
  }
  if (
    /\b(?:siehst\s+du|siehst|kannst\s+du|könntest\s+du|kriegst\s+du|bekommst\s+du|hast\s+du|hast)\b/i.test(
      t,
    ) &&
    /\b(?:inhalt|text|anhang|dokument|pdf|datei|material|dossier|upload|hochgeladen)\b/i.test(t)
  ) {
    return true
  }
  if (/\b(?:kannst|könntest)\s+du\b/i.test(t) && /\b(?:lesen|sehen|erkennen|öffnen)\b/i.test(t)) {
    return true
  }
  if (
    /\b(?:ist|sind|war|wurde)\b/i.test(t) &&
    /\b(?:anhang|datei|dokument|pdf|upload)\b/i.test(t) &&
    /\b(?:sichtbar|lesbar|da|angekommen|drin|erkannt|mitgeschickt)\b/i.test(t)
  ) {
    return true
  }
  if (/\b(?:hast|habt)\s+du\b/i.test(t) && /\b(?:zugriff|zugang)\b/i.test(t)) {
    return true
  }
  return false
}

const EXPLICIT_SUMMARY_REQUEST_RE =
  /\b(fass(?:e)?\s+(?:\S+\s+){0,8}?zusammen\b|zusammenfassung|zusammenfassen|überblick|ueberblick|stichwortartig|in\s+kapiteln|hauptpunkte\s+im\s+überblick|ausführliche?\s+zusammenfassung|zusammenfass(?:e|en)\s+(?:mir|bitte|das|den|die|zu|von)|mach(?:e)?\s+(?:mir\s+)?(?:eine\s+)?zusammenfassung|erstell(?:e)?\s+(?:mir\s+)?(?:eine\s+)?zusammenfassung)\b/i

const SUMMARY_TOPIC_REQUEST_RE =
  /\b(mach(?:e)?|erstell(?:e)?|schreib(?:e)?).{0,48}(ausführlich(?:e)?|zusammenfassung|zusammenfass(?:en|e))\b/i

const DOCUMENT_CONTENT_READ_REQUEST_RE =
  /\b(?:(?:lies|lese|auswert).{0,24}(?:inhalt|text|dokument|pdf|anhang)|inhalt\s+(?:des|vom)\s+(?:dokuments?|pdf|anhang|material|dossier)|was\s+steht\s+(?:im|in\s+dem)\s+(?:dokument|pdf|anhang|text))\b/i

/** Expliziter Zusammenfassungswunsch — «inhalt» allein (z. B. «siehst du den inhalt?») zählt nicht. */
export function userMessageWantsDocumentSummary(
  text: string,
  hasDocumentFileAttachment = false,
): boolean {
  const t = normalizeDocumentIntentUserText(text)
  if (!t || userAsksDocumentVisibilityQuestion(t)) {
    return false
  }
  if (EXPLICIT_SUMMARY_REQUEST_RE.test(t) || SUMMARY_TOPIC_REQUEST_RE.test(t)) {
    return true
  }
  if (hasDocumentFileAttachment && /\b(fass|zusammenfass|überblick|ueberblick|auswert)\b/i.test(t)) {
    return true
  }
  if (hasDocumentFileAttachment && DOCUMENT_CONTENT_READ_REQUEST_RE.test(t)) {
    return true
  }
  return false
}

export function buildInstantAnalyzeVisibilityHintForUserMessage(userMessage: string): string | null {
  if (!userAsksDocumentVisibilityQuestion(userMessage)) {
    return null
  }
  return [
    '[Struktur erkannt: Anhang-Sichtbarkeit — Nutzer will nur wissen, ob du den Anhang/Inhalt lesen kannst]',
    'Einordnung: category chat, action answer, reply_mode short_answer, task_type explanation, explanation_depth brief.',
    'Nicht summary, nicht mc_solve, nicht quiz_generate.',
    '',
  ].join('\n')
}

import {
  buildDocumentSummaryPlaybook,
  buildDocumentSummaryCoverageBriefing,
  resolveDocumentCoverageTopics,
} from './documentSummaryPlaybook'

export { buildDocumentSummaryPlaybook, buildDocumentSummaryCoverageBriefing, resolveDocumentCoverageTopics }

/** @deprecated Einmaliges Playbook — nur noch für Export-Pfade ohne Layout-Profil. */
export function buildDocumentSummaryDeliverableBriefing(): string {
  return buildDocumentSummaryPlaybook()
}

/** @deprecated Im Playbook enthalten — Aufrufe liefern absichtlich leer (keine Doppelung). */
export function buildDocumentSummaryVisualFirstBriefing(): string {
  return ''
}

export function buildDocumentVisibilityTurnBriefing(): string {
  return [
    'Anhang-Sichtbarkeit (verbindlich):',
    '- Nutzer fragt nur, ob du den Anhang/Inhalt **sehen und lesen** kannst.',
    '- **Kein** Quiz, **keine** Zusammenfassung, **keine** Aufgabenlösung — es sei denn, der Nutzer bittet danach.',
    '- Kurz: Ja/Nein + Dateiname + 1–2 Sätze, worum es grob geht (Thema/Typ).',
    '- Optional **ein** Satz: «Soll ich zusammenfassen, Aufgaben erklären oder ein Quiz daraus machen?»',
    '- **Verboten:** `## Zusammenfassung`, nummerierte Kapitel, MC-Optionen, `**Antwort: X**`.',
  ].join('\n')
}
