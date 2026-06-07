export function htmlToStructuredPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|tr)>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function normalizeDocumentLineBreaks(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function expandCollapsedDocumentText(text: string): string {
  let out = text.trim()
  if (out.includes('\n')) {
    return normalizeDocumentLineBreaks(out)
  }

  out = out.replace(/\s+(?=Übung\s+\d+\s*:)/gi, '\n\n')
  out = out.replace(/\s+(?=Aufgabe\s+\d+\s*:)/gi, '\n\n')
  out = out.replace(/\s+(?=Teil\s+\d+\s*:)/gi, '\n\n')
  out = out.replace(/\s+(?=Exercise\s+\d+\s*:)/gi, '\n\n')
  out = out.replace(/\s+(?=Kapitel\s+\d+\s*:)/gi, '\n\n')
  out = out.replace(/\s+(?=\d+\.\s+[A-ZÄÖÜ])/g, '\n\n')
  out = out.replace(/\s+(?=Lösung\s*:)/gi, '\n\n')

  return normalizeDocumentLineBreaks(out)
}

export function normalizeDocumentPreviewText(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) {
    return ''
  }
  return expandCollapsedDocumentText(trimmed)
}

export function isDocumentPreviewSectionHeading(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) {
    return false
  }
  if (/^(?:Übung|Aufgabe|Teil|Exercise|Kapitel)\s+\d+\s*:/i.test(trimmed)) {
    return true
  }
  if (/^\d+\.\s+[A-ZÄÖÜ]/.test(trimmed) && trimmed.length <= 120) {
    return true
  }
  return false
}

export async function extractDocxPreviewTextFromUrl(signedUrl: string): Promise<string> {
  const mammoth = await import('mammoth')
  const res = await fetch(signedUrl)
  if (!res.ok) {
    throw new Error('Datei konnte nicht geladen werden.')
  }
  const arrayBuffer = await res.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  let raw = (result.value ?? '').trim()
  if (!raw) {
    const htmlResult = await mammoth.convertToHtml({ arrayBuffer })
    raw = htmlToStructuredPlain(htmlResult.value ?? '').trim()
  }
  return normalizeDocumentPreviewText(raw)
}
