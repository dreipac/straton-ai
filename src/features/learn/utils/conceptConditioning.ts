/**
 * Konzept-Konditionierung der Generierung — Schicht 5.
 *
 * Baut aus dem Konzept-Netz + dem Lerner-Modell eine kompakte Vorgabe-Direktive, die den bestehenden
 * Generierungs-Prompts (Lernkarten, Arbeitsblatt, Zwischenschritt-Inhalt) vorangestellt wird. Wirkung:
 *  - jedes erzeugte Element wird mit einem ECHTEN Konzept-Slug getaggt (statt ad-hoc-Textableitung) →
 *    die BKT-Signale (Schicht 3) treffen exakt das richtige Konzept;
 *  - die Generierung wird lerner-modell-bewusst (schwache/mittlere Konzepte priorisiert, beherrschte
 *    nur aufgefrischt) und quellen-verankert;
 *  - Aufgaben-/Kartentypen werden variiert (Wissen, Anwendung, Unterscheidung, Lueckentext).
 *
 * Rein (kein DOM/I/O). Die effektive (verfallene) Mastery je Konzept wird vom Aufrufer hereingereicht.
 */

/** Mastery-Band eines Konzepts fuer die Prompt-Vorgabe. */
export type MasteryBand = 'neu' | 'schwach' | 'mittel' | 'beherrscht'

export function masteryBand(mastery: number | null): MasteryBand {
  if (mastery === null) return 'neu'
  if (mastery < 0.3) return 'schwach'
  if (mastery < 0.7) return 'mittel'
  return 'beherrscht'
}

export type ConceptDirectiveItem = {
  slug: string
  name: string
  difficulty: number
  /** Effektive (verfallene) Mastery 0..1, oder null wenn noch nie gesehen. */
  mastery: number | null
  /** Optionaler Quellen-Hinweis (Dokument/Abschnitt). */
  source?: string
}

export type ConceptDirectiveOptions = {
  /** Obergrenze gelisteter Konzepte (Prompt-Groesse begrenzen). Default 24. */
  maxConcepts?: number
  /** Schwache/neue Konzepte zuerst listen. Default true. */
  focusWeak?: boolean
}

/** Prioritaet fuers Sortieren: neu/schwach zuerst, beherrscht zuletzt. */
function bandPriority(band: MasteryBand): number {
  switch (band) {
    case 'schwach':
      return 0
    case 'neu':
      return 1
    case 'mittel':
      return 2
    case 'beherrscht':
      return 3
  }
}

/**
 * Baut die Konzept-Direktive. Gibt einen leeren String zurueck, wenn keine Konzepte vorliegen —
 * dann bleibt die Generierung unveraendert (kein Netz → Legacy-Verhalten).
 */
export function buildConceptDirective(
  items: ConceptDirectiveItem[],
  options: ConceptDirectiveOptions = {},
): string {
  if (items.length === 0) {
    return ''
  }
  const focusWeak = options.focusWeak ?? true
  const max = Math.max(1, options.maxConcepts ?? 24)

  const ordered = focusWeak
    ? [...items].sort((a, b) => {
        const pa = bandPriority(masteryBand(a.mastery))
        const pb = bandPriority(masteryBand(b.mastery))
        if (pa !== pb) {
          return pa - pb
        }
        // innerhalb eines Bands: schwerere Konzepte zuerst, dann stabil nach Slug
        if (a.difficulty !== b.difficulty) {
          return b.difficulty - a.difficulty
        }
        return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0
      })
    : items
  const listed = ordered.slice(0, max)

  const lines = listed.map((c) => {
    const band = masteryBand(c.mastery)
    const src = c.source ? `, Quelle: ${c.source}` : ''
    return `- ${c.slug} — ${c.name} [Schwierigkeit ${c.difficulty}/5, Stand: ${band}${src}]`
  })

  const weakSlugs = listed
    .filter((c) => {
      const b = masteryBand(c.mastery)
      return b === 'schwach' || b === 'neu' || b === 'mittel'
    })
    .map((c) => c.slug)

  const focusLine =
    weakSlugs.length > 0
      ? `Priorisiere diese noch nicht sicher beherrschten Konzepte: ${weakSlugs.slice(0, 10).join(', ')}.`
      : 'Alle Konzepte sind weitgehend beherrscht — frische sie mit anspruchsvolleren Anwendungsaufgaben auf.'

  return [
    'KONZEPT-VORGABEN (Wissensnetz dieses Lernpfads):',
    ...lines,
    '',
    'Regeln fuer die Generierung:',
    '- Tagge JEDES erzeugte Element (Frage/Aufgabe/Karte) im Feld "skillTag" mit GENAU EINEM der oben gelisteten Konzept-Slugs. Erfinde KEINE neuen Slugs.',
    `- ${focusLine}`,
    '- Baue auf bereits beherrschten Konzepten auf, wiederhole sie aber nicht stumpf.',
    '- Variiere die Aufgabentypen passend zum Konzept: Wissen, Anwendung, Unterscheidung/Abgrenzung, Lueckentext.',
    '- Verankere Aufgaben wo moeglich in der genannten Quelle des Konzepts.',
  ].join('\n')
}

/** Direktive einer bestehenden Outline voranstellen (leere Direktive → Outline unveraendert). */
export function prependConceptDirective(outline: string, directive: string): string {
  if (!directive.trim()) {
    return outline
  }
  return `${directive}\n\n---\n\n${outline}`
}

function isMastered(item: ConceptDirectiveItem): boolean {
  return masteryBand(item.mastery) === 'beherrscht'
}

/**
 * Entscheidung 1 — adaptiver Einstiegscheck: die Diagnosefragen gezielt auf die noch nicht sicheren
 * Konzepte des Themas fokussieren und bereits beherrschte auslassen/kurz bestaetigen. Leer, wenn keine
 * Konzepte vorliegen → der Check wird wie bisher generiert.
 */
export function buildEntryCheckDirective(items: ConceptDirectiveItem[]): string {
  if (items.length === 0) {
    return ''
  }
  const weak = items.filter((i) => !isMastered(i))
  const mastered = items.filter(isMastered)
  const lines = ['ADAPTIVER EINSTIEGSCHECK — stelle die Diagnosefragen gezielt zusammen:']
  if (weak.length > 0) {
    lines.push(`- Pruefe schwerpunktmaessig diese noch nicht sicher beherrschten Konzepte: ${weak.map((i) => i.slug).join(', ')}.`)
  }
  if (mastered.length > 0) {
    lines.push(
      `- Diese Konzepte gelten laut Lernstand bereits als beherrscht — hoechstens je EINE kurze Bestaetigungsfrage oder ganz weglassen: ${mastered.map((i) => i.slug).join(', ')}.`,
    )
  }
  lines.push('- Halte den Check kurz und fokussiert; keine Fragen ausserhalb dieser Konzepte.')
  return lines.join('\n')
}

/** Ein gewichtetes Pruefungs-Konzept (aus dem adaptiven Plan, Entscheidung 6). */
export type ExamWeightItem = {
  slug: string
  name: string
  /** Relatives Gewicht (>0): hoeher = mehr Fragen (schwaechere/schwerere Konzepte). */
  weight: number
}

/**
 * Entscheidung 6 — gewichtete Abschlusspruefung: die Fragenanzahl je Konzept an das adaptive Gewicht
 * koppeln (schwache/schwere Konzepte bekommen mehr Fragen), alle Konzepte aber mindestens streifen.
 * Leer ohne Konzepte → die Pruefung wird wie bisher generiert.
 */
export function buildExamWeightDirective(items: ExamWeightItem[]): string {
  const usable = items.filter((i) => i.weight > 0)
  if (usable.length === 0) {
    return ''
  }
  const total = usable.reduce((acc, i) => acc + i.weight, 0)
  const ordered = [...usable].sort((a, b) => b.weight - a.weight)
  const lines = ['GEWICHTETE ABSCHLUSSPRUEFUNG — verteile die Fragen nach diesem Wissensstand-Gewicht:']
  for (const item of ordered.slice(0, 16)) {
    const share = Math.round((item.weight / total) * 100)
    lines.push(`- ${item.slug} — ${item.name}: ca. ${share}% der Fragen (Gewicht ${item.weight.toFixed(2)}).`)
  }
  lines.push('- Konzepte mit hoehrem Gewicht sind noch nicht sicher — pruefe sie gruendlicher.')
  lines.push('- Streife jedes gelistete Konzept mindestens einmal; erfinde keine themenfremden Fragen.')
  return lines.join('\n')
}

/**
 * Entscheidung 2 — personalisierter Lernplan (weicher Skip): fuer bereits beherrschte Konzepte KEINE
 * eigenen Erklaer-Zwischenschritte erzeugen, den Plan auf die schwachen Konzepte konzentrieren. Ergebnis:
 * ein kuerzerer, gezielter Plan statt einer vollstaendigen Wiederholung. Leer ohne Konzepte.
 */
export function buildStepPlanDirective(items: ConceptDirectiveItem[]): string {
  if (items.length === 0) {
    return ''
  }
  const weak = items.filter((i) => !isMastered(i))
  const mastered = items.filter(isMastered)
  const lines = ['ADAPTIVER LERNPLAN — personalisiere die Zwischenschritte fuer diesen Lernenden:']
  if (mastered.length > 0) {
    lines.push(
      `- Bereits beherrscht: ${mastered.map((i) => i.slug).join(', ')}. Erzeuge dafuer KEINE eigenen Erklaer-Zwischenschritte (hoechstens kurz streifen).`,
    )
  }
  if (weak.length > 0) {
    lines.push(`- Konzentriere die Zwischenschritte auf die noch schwachen Konzepte: ${weak.map((i) => i.slug).join(', ')}.`)
  }
  lines.push('- Ergebnis: ein kuerzerer, gezielter Plan statt einer vollstaendigen Wiederholung.')
  return lines.join('\n')
}
