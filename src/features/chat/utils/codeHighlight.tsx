import type { ReactNode } from 'react'

/**
 * Leichtgewichtiges, abhängigkeitsfreies Syntax-Highlighting für Chat-Codeblöcke.
 * Bewusst konservativ: nur Kommentare, Strings, Zahlen, Variablen, CLI-Flags und
 * eine sprachabhängige Keyword-Liste werden eingefärbt — alles andere bleibt Klartext.
 * Wirft nie; bei Problemen fällt der Aufrufer auf den rohen Text zurück.
 */

type TokenKind = 'comment' | 'string' | 'number' | 'keyword' | 'var' | 'param'

type LangConfig = {
  /** `#` als Zeilenkommentar (bash, powershell, python, yaml, …). */
  hashComment: boolean
  /** `//` und `/* … *​/` als Kommentar (C-artige Sprachen). */
  slashComment: boolean
  keywords: ReadonlySet<string>
}

const COMMON_KEYWORDS = [
  'if', 'else', 'elif', 'then', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac',
  'function', 'return', 'try', 'catch', 'finally', 'throw', 'switch', 'break',
  'continue', 'in', 'of', 'new', 'class', 'const', 'let', 'var', 'def', 'import',
  'from', 'export', 'default', 'async', 'await', 'true', 'false', 'null', 'undefined',
  'and', 'or', 'not', 'is', 'none', 'true', 'false', 'echo', 'set', 'param',
]

const POWERSHELL_KEYWORDS = [
  'if', 'else', 'elseif', 'function', 'return', 'try', 'catch', 'finally', 'throw',
  'foreach', 'for', 'while', 'do', 'switch', 'param', 'begin', 'process', 'end',
  'break', 'continue', 'filter', 'in', 'true', 'false', 'null',
]

function buildLangConfig(language: string): LangConfig {
  const lang = language.trim().toLowerCase()
  if (lang === 'powershell' || lang === 'ps' || lang === 'ps1') {
    return { hashComment: true, slashComment: false, keywords: new Set(POWERSHELL_KEYWORDS) }
  }
  if (
    lang === 'bash' || lang === 'sh' || lang === 'shell' || lang === 'zsh' ||
    lang === 'python' || lang === 'py' || lang === 'yaml' || lang === 'yml' ||
    lang === 'ruby' || lang === 'rb' || lang === 'toml' || lang === 'ini' || lang === 'dockerfile'
  ) {
    return { hashComment: true, slashComment: false, keywords: new Set(COMMON_KEYWORDS) }
  }
  // JS/TS/JSON/C-artig und unbekannte Sprachen: nur //-Kommentare, kein #.
  return { hashComment: false, slashComment: true, keywords: new Set(COMMON_KEYWORDS) }
}

function buildScanner(cfg: LangConfig): RegExp {
  const parts: string[] = []
  // 1) Kommentare
  if (cfg.slashComment) {
    parts.push('\\/\\/[^\\n]*', '\\/\\*[\\s\\S]*?\\*\\/')
  }
  if (cfg.hashComment) {
    parts.push('#[^\\n]*')
  }
  // 2) Strings (doppelt, einfach, Backtick — mit Escapes)
  parts.push('"(?:[^"\\\\]|\\\\.)*"', "'(?:[^'\\\\]|\\\\.)*'", '`(?:[^`\\\\]|\\\\.)*`')
  // 3) Variablen ($foo, ${foo})
  parts.push('\\$\\{[^}]*\\}', '\\$[A-Za-z_]\\w*')
  // 4) CLI-Flags / Parameter (-Foo, --bar) nach Whitespace oder Zeilenanfang
  parts.push('(?:(?<=\\s)|(?<=^))-{1,2}[A-Za-z][\\w-]*')
  // 5) Zahlen
  parts.push('\\b0x[0-9a-fA-F]+\\b', '\\b\\d+(?:\\.\\d+)?\\b')
  // 6) Wörter (für Keyword-Abgleich)
  parts.push('[A-Za-z_][A-Za-z0-9_-]*')
  return new RegExp(parts.join('|'), 'g')
}

function classify(token: string, cfg: LangConfig): TokenKind | null {
  const first = token[0]
  if (cfg.slashComment && (token.startsWith('//') || token.startsWith('/*'))) return 'comment'
  if (cfg.hashComment && first === '#') return 'comment'
  if (first === '"' || first === "'" || first === '`') return 'string'
  if (first === '$') return 'var'
  if (first === '-' && /[A-Za-z]/.test(token[1] ?? '')) return 'param'
  if (/^[0-9]/.test(token)) return 'number'
  if (cfg.keywords.has(token.toLowerCase())) return 'keyword'
  return null
}

/** Färbt Code-Quelltext zu React-Spans ein. Sicher: gibt bei Fehlern einfach den Rohtext zurück. */
export function highlightCode(code: string, language: string): ReactNode {
  try {
    const cfg = buildLangConfig(language)
    const scanner = buildScanner(cfg)
    const out: ReactNode[] = []
    let last = 0
    let key = 0
    let match: RegExpExecArray | null
    while ((match = scanner.exec(code)) !== null) {
      const value = match[0]
      if (!value) {
        scanner.lastIndex += 1
        continue
      }
      const start = match.index
      if (start > last) {
        out.push(code.slice(last, start))
      }
      const kind = classify(value, cfg)
      if (kind) {
        out.push(
          <span key={`t${key++}`} className={`tok-${kind}`}>
            {value}
          </span>,
        )
      } else {
        out.push(value)
      }
      last = start + value.length
    }
    if (last < code.length) {
      out.push(code.slice(last))
    }
    return out
  } catch {
    return code
  }
}
