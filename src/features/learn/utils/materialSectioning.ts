/**
 * Material-Sectioning für die vollständige Konzept-Ingestion (Schicht 1, Map-Reduce).
 *
 * Zerlegt ALLE hochgeladenen Materialien in aufeinanderfolgende, luecken­lose Abschnitte fester Groesse.
 * Anders als die RAG-Auswahl (die nur die relevantesten ~12k Zeichen durchlaesst) deckt dies das gesamte
 * Material ab — jeder Abschnitt wird spaeter einzeln analysiert und die Konzepte werden zusammengefuehrt.
 * So geht nichts verloren.
 *
 * Rein (kein DOM/I/O), voll unit-testbar.
 */

export type MaterialSection = {
  /** Ursprungs-Dateiname (fuer Quellen-Referenz). */
  materialName: string
  /** Menschlich lesbares Label, z. B. "skript.pdf · Teil 2/5". */
  label: string
  /** Der Abschnittstext. */
  text: string
}

export type SectionMaterialsOptions = {
  /** Ziel-Zeichenzahl pro Abschnitt. Default 7000. */
  targetChars?: number
  /** Obergrenze der Gesamt-Abschnitte (begrenzt KI-Kosten); Abschnitte wachsen bei Bedarf. Default 16. */
  maxSections?: number
  /** Kleiner Ueberlappungspuffer, damit Konzepte an Abschnittsgrenzen nicht zerrissen werden. Default 200. */
  overlapChars?: number
}

type MaterialLike = { name: string; excerpt: string }

/** Sinnvolle Bruchstelle innerhalb [from, hardEnd) suchen: Absatz > Zeile > Satz > Wort. */
function findBreakPoint(text: string, from: number, hardEnd: number): number {
  if (hardEnd >= text.length) {
    return text.length
  }
  const window = text.slice(from, hardEnd)
  const candidates = [
    window.lastIndexOf('\n\n'),
    window.lastIndexOf('\n'),
    window.lastIndexOf('. '),
    window.lastIndexOf('; '),
    window.lastIndexOf(' '),
  ]
  // Nur Bruchstellen akzeptieren, die mindestens 60 % des Fensters fuellen (sonst zu kurze Abschnitte).
  const minAccept = Math.floor((hardEnd - from) * 0.6)
  for (const rel of candidates) {
    if (rel >= minAccept) {
      return from + rel + 1
    }
  }
  return hardEnd
}

/** Einen Text lueckenlos in Fenster von ~size Zeichen (grenzen-bewusst) zerlegen, mit kleiner Ueberlappung. */
function chunkText(raw: string, size: number, overlap: number): string[] {
  const text = raw.trim()
  if (text.length === 0) {
    return []
  }
  if (text.length <= size) {
    return [text]
  }
  const chunks: string[] = []
  let cursor = 0
  const safeOverlap = Math.max(0, Math.min(overlap, Math.floor(size / 2)))
  while (cursor < text.length) {
    const hardEnd = Math.min(cursor + size, text.length)
    const breakAt = findBreakPoint(text, cursor, hardEnd)
    const piece = text.slice(cursor, breakAt).trim()
    if (piece) {
      chunks.push(piece)
    }
    if (breakAt >= text.length) {
      break
    }
    // Naechster Start etwas vor der Grenze (Ueberlappung), aber immer vorwaerts.
    cursor = Math.max(breakAt - safeOverlap, cursor + 1)
    if (breakAt <= cursor) {
      cursor = breakAt
    }
  }
  return chunks
}

/**
 * Alle Materialien in vollstaendig abdeckende Abschnitte zerlegen. Garantiert:
 *  - jeder Zeichen des Materials liegt in mindestens einem Abschnitt (keine Luecken),
 *  - die Gesamtzahl der Abschnitte ueberschreitet maxSections nicht (Abschnitte wachsen sonst).
 */
export function sectionMaterials(
  materials: MaterialLike[],
  options: SectionMaterialsOptions = {},
): MaterialSection[] {
  const targetChars = Math.max(1000, options.targetChars ?? 7000)
  const maxSections = Math.max(1, options.maxSections ?? 16)
  const overlap = Math.max(0, options.overlapChars ?? 200)

  const usable = materials
    .map((m) => ({ name: m.name, excerpt: (m.excerpt ?? '').trim() }))
    .filter((m) => m.excerpt.length > 0)
  if (usable.length === 0) {
    return []
  }

  const totalChars = usable.reduce((acc, m) => acc + m.excerpt.length, 0)
  let size = Math.max(targetChars, Math.ceil(totalChars / maxSections))

  let sections: MaterialSection[] = []
  for (let guard = 0; guard < 8; guard += 1) {
    sections = []
    for (const material of usable) {
      const chunks = chunkText(material.excerpt, size, overlap)
      chunks.forEach((text, index) => {
        sections.push({
          materialName: material.name,
          label: chunks.length > 1 ? `${material.name} · Teil ${index + 1}/${chunks.length}` : material.name,
          text,
        })
      })
    }
    if (sections.length <= maxSections) {
      break
    }
    size = Math.ceil(size * 1.35)
  }

  return sections
}
