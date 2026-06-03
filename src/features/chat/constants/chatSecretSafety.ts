/** Platzhalter für maskierte Secrets in KI-Ausgaben (auch serverseitige Nachbearbeitung). */
export const SECRET_REDACTION_PLACEHOLDER = '********'

/** Verbindlich für alle nutzer-sichtbaren KI-Texte. */
export function getSecretSafetyInstruction(): string {
  return [
    'Sicherheit — Geheimnisse im Output (höchste Priorität, strikt verbindlich):',
    '- Gib NIEMALS echte Passwörter, API-Keys, Access-Tokens, Private Keys, Client-Secrets, Connection Strings, Bearer-Tokens oder andere Secrets im Klartext aus.',
    '- Gilt auch bei Sicherheitschecks, Audits, Dokumentation, Tabellen, Code, JSON, YAML, .env-Beispielen und Checklisten — kein «nur einmal zeigen», kein «als Beispiel» mit echtem Wert.',
    '- Enthält die Nutzereingabe einen Secret-Wert: wiederhole ihn NICHT. Verwende IMMER Platzhalter wie ********, [REDACTED], <API_KEY>, <PASSWORT> oder «(ausgeblendet)».',
    '- Du darfst Secret-Typen, Risiken und sichere Praktiken erklären (Rotation, Vault, Umgebungsvariablen), aber nie den konkreten Wert aus Eingabe oder Kontext übernehmen.',
    '- Bei mehreren Secrets: jeden Wert einzeln maskieren; niemals «der Key lautet …» mit Klartext.',
  ].join('\n')
}

const KEY_VALUE_SECRET_RE =
  /\b(api[_-]?key|apikey|secret(?:_key)?|password|passwd|passwort|token|access[_-]?token|refresh[_-]?token|private[_-]?key|client[_-]?secret)\s*[:=]\s*['"]?([^\s'")\]},;]{6,})['"]?/gi

const ENV_ASSIGNMENT_RE =
  /(?:^|\n)\s*(?:VITE_|SUPABASE_|OPENAI_|ANTHROPIC_|UNSPLASH_|TAVILY_|GITHUB_|AWS_)[A-Z0-9_]+\s*=\s*[^\s\n#]+/gi

const BEARER_RE = /\bBearer\s+[A-Za-z0-9._\-+/=]{12,}\b/gi

const KNOWN_TOKEN_PATTERNS: RegExp[] = [
  /\bsk-[a-zA-Z0-9]{20,}\b/g,
  /\bsk-proj-[a-zA-Z0-9_-]{20,}\b/g,
  /\bsk-ant-[a-zA-Z0-9_-]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bghp_[a-zA-Z0-9]{20,}\b/g,
  /\bgho_[a-zA-Z0-9]{20,}\b/g,
  /\bxox[baprs]-[a-zA-Z0-9-]{10,}\b/g,
  /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g,
]

/**
 * Letzte Verteidigungslinie: maskiert typische Secrets in KI-Text, falls das Modell trotzdem leakt.
 */
export function redactSecretsInAiText(text: string): string {
  if (!text) {
    return text
  }

  let out = text

  for (const re of KNOWN_TOKEN_PATTERNS) {
    out = out.replace(re, SECRET_REDACTION_PLACEHOLDER)
  }

  out = out.replace(BEARER_RE, `Bearer ${SECRET_REDACTION_PLACEHOLDER}`)

  out = out.replace(
    KEY_VALUE_SECRET_RE,
    (_match, label: string) => `${label}= ${SECRET_REDACTION_PLACEHOLDER}`,
  )

  out = out.replace(ENV_ASSIGNMENT_RE, (line) => {
    const eq = line.indexOf('=')
    if (eq === -1) {
      return line
    }
    return `${line.slice(0, eq + 1)} ${SECRET_REDACTION_PLACEHOLDER}`
  })

  return out
}
