import type { WordOutlineV1 } from '../types'
import {
  WORD_CONTENT_HEIGHT_PX,
  buildWordMeasureCss,
} from '../constants/wordDocStyle'
import { wordBlocksToHtml, type WordBlock, type WordPage } from './wordPageSrcDoc'

export type { WordPage } from './wordPageSrcDoc'

const SCOPE_CLASS = 'straton-word-measure'
const H = WORD_CONTENT_HEIGHT_PX

type Measure = (blocks: WordBlock[]) => number

/** Unsichtbarer Mess-Host mit identischer Block-Metrik wie die Seite (siehe `buildWordMeasureCss`). */
function withMeasureHost<T>(fn: (measure: Measure) => T): T {
  const style = document.createElement('style')
  style.textContent = buildWordMeasureCss(`.${SCOPE_CLASS}`)
  const host = document.createElement('div')
  host.className = SCOPE_CLASS
  // `flow-root` = eigener Block-Formatierungskontext → schliesst auch den unteren Rand des letzten
  // Kindes ein (kein Margin-Leak), damit die gemessene Höhe der echten Seitenfüllung entspricht.
  host.style.display = 'flow-root'
  document.head.appendChild(style)
  document.body.appendChild(host)
  const measure: Measure = (blocks) => {
    host.innerHTML = wordBlocksToHtml(blocks)
    return host.getBoundingClientRect().height
  }
  try {
    return fn(measure)
  } finally {
    host.remove()
    style.remove()
  }
}

function paragraph(text: string): WordBlock {
  return { type: 'paragraph', text }
}

/** Absatz so weit aufteilen, dass `current` + Kopfteil auf die Seite passt; Rest für die Folgeseite. */
function splitParagraph(
  measure: Measure,
  current: WordBlock[],
  text: string,
): { head: WordBlock; rest: WordBlock | null } {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length <= 1) {
    return { head: paragraph(text), rest: null }
  }
  let lo = 1
  let hi = words.length
  let best = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const trial = words.slice(0, mid).join(' ')
    if (measure([...current, paragraph(trial)]) <= H) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  if (best === 0) {
    best = 1 // Fortschritt erzwingen (lieber minimaler Überlauf als Endlosschleife)
  }
  const headText = words.slice(0, best).join(' ')
  const restText = best < words.length ? words.slice(best).join(' ') : ''
  return { head: paragraph(headText), rest: restText ? paragraph(restText) : null }
}

/** Tabelle zeilenweise aufteilen; Kopfzeile (falls vorhanden) wird auf der Folgeseite wiederholt. */
function splitTable(
  measure: Measure,
  current: WordBlock[],
  block: Extract<WordBlock, { type: 'table' }>,
): { head: WordBlock; rest: WordBlock | null } {
  const rows = block.rows
  const header = block.header === true
  const bodyStart = header ? 1 : 0
  const minEnd = bodyStart + 1
  if (rows.length <= minEnd) {
    return { head: block, rest: null }
  }
  let lo = minEnd
  let hi = rows.length
  let best = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (measure([...current, { type: 'table', rows: rows.slice(0, mid), header: block.header }]) <= H) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  if (best < minEnd) {
    best = minEnd // mind. Kopf + 1 Zeile erzwingen
  }
  if (best >= rows.length) {
    return { head: block, rest: null }
  }
  const headRows = rows.slice(0, best)
  const restBody = rows.slice(best)
  const restRows = header ? [rows[0]!, ...restBody] : restBody
  return {
    head: { type: 'table', rows: headRows, header: block.header },
    rest: { type: 'table', rows: restRows, header: block.header },
  }
}

/** Liste zwischen Punkten aufteilen; Fortsetzung führt die restlichen Punkte auf der Folgeseite. */
function splitList(
  measure: Measure,
  current: WordBlock[],
  block: Extract<WordBlock, { type: 'list' }>,
): { head: WordBlock; rest: WordBlock | null } {
  const items = block.items
  if (items.length <= 1) {
    return { head: block, rest: null }
  }
  let lo = 1
  let hi = items.length
  let best = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (measure([...current, { type: 'list', ordered: block.ordered, items: items.slice(0, mid) }]) <= H) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  if (best === 0) {
    best = 1
  }
  if (best >= items.length) {
    return { head: block, rest: null }
  }
  return {
    head: { type: 'list', ordered: block.ordered, items: items.slice(0, best) },
    rest: { type: 'list', ordered: block.ordered, items: items.slice(best) },
  }
}

/** `null` = Block (Überschrift) nicht teilbar → ganz auf die nächste Seite verschieben. */
function trySplit(
  measure: Measure,
  current: WordBlock[],
  block: WordBlock,
): { head: WordBlock; rest: WordBlock | null } | null {
  if (block.type === 'paragraph') {
    return splitParagraph(measure, current, block.text)
  }
  if (block.type === 'list') {
    return splitList(measure, current, block)
  }
  if (block.type === 'table') {
    return splitTable(measure, current, block)
  }
  return null
}

/**
 * Blöcke (heading/paragraph/table) auf A4-Seiten umbrechen — durch echte DOM-Messung mit der
 * Seiten-Metrik. Die Vorschau-Umbrüche nähern die von Word/LibreOffice eng an; massgeblich bleibt
 * die heruntergeladene Datei.
 */
export function paginateWordOutline(outline: WordOutlineV1): WordPage[] {
  const blocks = outline.blocks as WordBlock[]
  const title = outline.title?.trim() || ''
  /**
   * Cover-Seite + Kopfzeile auf Inhaltsseiten anbringen. Die Kopfzeile sitzt im oberen Seitenrand
   * (absolut positioniert) und verbraucht KEINE Inhaltshöhe → die Pagination misst unverändert
   * gegen `WORD_CONTENT_HEIGHT_PX`.
   */
  const decorate = (pages: WordPage[]): WordPage[] => {
    const content: WordPage[] = pages.map((p) => ({
      ...p,
      kind: 'content' as const,
      title: title || undefined,
    }))
    if (!title) {
      return content
    }
    const cover: WordPage = {
      kind: 'cover',
      title,
      subtitle: outline.subtitle?.trim() || undefined,
      author: outline.author?.trim() || undefined,
      date: outline.date,
      blocks: [],
    }
    return [cover, ...content]
  }

  if (blocks.length === 0) {
    return decorate([{ blocks: [] }])
  }
  if (typeof document === 'undefined') {
    return decorate([{ blocks }]) // SSR/Test-Fallback: keine Messung möglich
  }

  return decorate(withMeasureHost((measure) => {
    const pages: WordPage[] = []
    let current: WordBlock[] = []
    const pushPage = () => {
      if (current.length > 0) {
        pages.push({ blocks: current })
        current = []
      }
    }

    const queue: WordBlock[] = [...blocks]
    let guard = 0
    while (queue.length > 0) {
      if (guard++ > 500000) {
        break
      }
      const block = queue.shift()!
      if (measure([...current, block]) <= H) {
        current.push(block)
        continue
      }
      const split = trySplit(measure, current, block)
      if (split) {
        current.push(split.head)
        pushPage()
        if (split.rest) {
          queue.unshift(split.rest)
        }
        continue
      }
      // Nicht teilbar (Überschrift). Auf neue Seite ziehen; eine voranstehende Überschrift mitnehmen
      // (kein „Witwen“-Heading allein am Seitenende), solange echter Inhalt auf der Seite bleibt.
      if (current.length === 0) {
        current.push(block) // leere Seite + passt trotzdem nicht → erzwingen (praktisch nie)
        pushPage()
        continue
      }
      const carried: WordBlock[] = []
      while (current.length > 1 && current[current.length - 1]!.type === 'heading') {
        carried.unshift(current.pop()!)
      }
      pushPage()
      current.push(...carried)
      queue.unshift(block)
    }
    pushPage()
    return pages.length > 0 ? pages : [{ blocks }]
  }))
}
