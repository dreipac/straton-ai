/** Entfernt Anhang-Blöcke — nur für Intent/Routing, nicht für die gespeicherte Nutzernachricht. */
export function stripComposerAttachmentBlocksForRouting(content: string): string {
  return content
    .replace(/\[Datei:[^\]]*\][\s\S]*?\[\/Datei\]/gi, '')
    .replace(/\[BildData:[^\]]*\][\s\S]*?\[\/BildData\]/gi, '')
    .replace(/\[Bild:[^\]]*\][\s\S]*?\[\/Bild\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Nutzer hat eine Datei (PDF/Word/…) als `[Datei:…]` angehängt — kein Vision-`BildData`. */
export function messageHasDocumentFileAttachment(content: string): boolean {
  return /\[Datei:\s*[^\]]+\]/i.test(content)
}
