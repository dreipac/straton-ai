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
