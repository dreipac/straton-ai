function tryExecCommandCopy(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '0'
  textarea.style.width = '2em'
  textarea.style.height = '2em'
  textarea.style.padding = '0'
  textarea.style.border = 'none'
  textarea.style.outline = 'none'
  textarea.style.boxShadow = 'none'
  textarea.style.background = 'transparent'
  textarea.style.opacity = '0'
  textarea.style.fontSize = '16px'

  document.body.appendChild(textarea)

  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, text.length)

  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }

  document.body.removeChild(textarea)
  return ok
}

/** Kopiert Text — zuerst execCommand (iOS nach nativem `<select>`), dann Clipboard API. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const trimmed = text.trim()
  if (!trimmed) {
    return false
  }

  if (tryExecCommandCopy(trimmed)) {
    return true
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(trimmed)
      return true
    }
  } catch {
    /* Clipboard API oft ohne User-Geste auf iOS */
  }

  return tryExecCommandCopy(trimmed)
}

/**
 * Kopiert Text UND HTML gemeinsam in die Zwischenablage (z. B. für Tabellen). Ziel-Apps wie Word
 * oder Outlook lesen beim Einfügen den HTML-Anteil, wenn vorhanden, und bauen daraus eine echte
 * Tabelle/Liste — mit `writeText` allein käme dort nur der Klartext mit sichtbaren `|`-Zeichen an.
 * Fällt auf reinen Text zurück, wenn die Rich-Clipboard-API fehlt oder scheitert (ältere Browser,
 * fehlende Nutzergeste, kein sicherer Kontext).
 */
export async function copyRichTextToClipboard(html: string, plainText: string): Promise<boolean> {
  const trimmedPlain = plainText.trim()
  if (!trimmedPlain && !html.trim()) {
    return false
  }

  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      const item = new ClipboardItem({
        'text/plain': new Blob([trimmedPlain], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      })
      await navigator.clipboard.write([item])
      return true
    }
  } catch {
    /* z. B. fehlende Nutzergeste/Berechtigung/Browser-Support -- Klartext-Fallback unten */
  }

  return copyTextToClipboard(trimmedPlain)
}
