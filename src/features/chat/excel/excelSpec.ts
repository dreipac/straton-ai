import type { ChatMessage } from '../types'

export const STRATON_EXCEL_SPEC_START = '<<<STRATON_EXCEL_SPEC_JSON>>>'
export const STRATON_EXCEL_SPEC_END = '<<<END_STRATON_EXCEL_SPEC_JSON>>>'

export type ExcelSpecV1 = {
  version: 1
  fileName: string
  sheets: Array<{
    name: string
    rows: unknown[][]
  }>
}

/** Zeilenumbrüche / unsichtbare Zeichen vereinheitlichen (Marker sonst nicht gefunden). */
export function normalizeContentForExcelSpec(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\u200b|\u200c|\u200d|\ufeff/g, '')
}

export function hasExcelSpecMarkers(content: string): boolean {
  const n = normalizeContentForExcelSpec(content)
  return n.includes(STRATON_EXCEL_SPEC_START) && n.includes(STRATON_EXCEL_SPEC_END)
}

export function stripExcelSpecBlock(content: string): string {
  const normalized = normalizeContentForExcelSpec(content)
  const i = normalized.indexOf(STRATON_EXCEL_SPEC_START)
  const j = normalized.indexOf(STRATON_EXCEL_SPEC_END)
  if (i === -1 || j === -1 || j < i) {
    return content
  }
  const before = normalized.slice(0, i).trimEnd()
  const after = normalized.slice(j + STRATON_EXCEL_SPEC_END.length).trimStart()
  if (!before && !after) {
    return ''
  }
  if (!before) {
    return after
  }
  if (!after) {
    return before
  }
  return `${before}\n\n${after}`.trim()
}

/** Anzeige-Text: Spez-Block ausblenden (z. B. wenn Export fehlgeschlagen ist). */
export function getAssistantMessageDisplayContent(message: ChatMessage): string {
  if (message.role !== 'assistant') {
    return message.content
  }
  return stripExcelSpecBlock(message.content).trim()
}

/**
 * Die KI liefert `rows` oft falsch als 1D-Liste von Zellen statt 2D (Zeilen aus Zellen).
 * Ohne Normalisierung schlaegt der Excel-Export fehl → kein Download.
 */
/** Entfernt fehlerhaftes =@ in Formelstrings (KI); gleiche Logik wie Edge Function. */
function cleanKiFormulaField(formula: string): string {
  let s = formula.trim().replace(/\u00a0/g, ' ')
  let prev: string
  do {
    prev = s
    s = s.replace(/^=\s*@\s*/, '=')
  } while (s !== prev)
  s = s.trimStart()
  while (s.startsWith('@')) {
    s = s.slice(1).trimStart()
  }
  if (!s.startsWith('=')) {
    s = `=${s}`
  }
  return s
}

/**
 * KI liefert oft Tabellen als reine Strings/Zahlen statt { "t":"v","value":... } — ohne das scheitert der Export bei Zelle 1,1.
 */
function coerceExcelCell(cell: unknown): unknown {
  if (cell === null || cell === undefined) {
    return cell
  }
  if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') {
    return { t: 'v', value: cell }
  }
  if (typeof cell !== 'object' || Array.isArray(cell)) {
    return cell
  }
  const o = cell as Record<string, unknown>
  const tRaw = o.t ?? o.type
  const t = typeof tRaw === 'string' ? tRaw.trim().toLowerCase() : ''
  if (t === 'v' || t === 'value') {
    let val: unknown = o.value !== undefined ? o.value : o.val
    if (val === undefined) {
      val = null
    }
    if (val !== null && typeof val !== 'string' && typeof val !== 'number' && typeof val !== 'boolean') {
      val = String(val)
    }
    return { t: 'v', value: val as string | number | boolean | null }
  }
  if (t === 'f' || t === 'formula') {
    const formula =
      typeof o.formula === 'string' ? o.formula : typeof o.f === 'string' ? o.f : ''
    return { t: 'f', formula }
  }
  if (o.value !== undefined && typeof o.t !== 'string' && o.type === undefined) {
    const val = o.value
    if (
      val === null ||
      typeof val === 'string' ||
      typeof val === 'number' ||
      typeof val === 'boolean'
    ) {
      return { t: 'v', value: val }
    }
  }
  return cell
}

function mapFormulaCellsInRows(rows: unknown[][]): unknown[][] {
  return rows.map((row) =>
    row.map((cell) => {
      const c0 = coerceExcelCell(cell)
      if (!c0 || typeof c0 !== 'object') {
        return c0
      }
      const c = c0 as { t?: string; formula?: string }
      if (c.t === 'f' && typeof c.formula === 'string') {
        return { ...c, formula: cleanKiFormulaField(c.formula) }
      }
      return c0
    }),
  )
}

/** Wie Edge `parseSpec`: nur sichere Zeichen; KI liefert oft Leerzeichen im Dateinamen. */
function sanitizeExcelFileNameForEdge(name: string): string {
  let s = name.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '')
  if (!s.toLowerCase().endsWith('.xlsx')) {
    const base = s.replace(/\.xlsx$/i, '').replace(/^\.+$/, '') || 'export'
    s = `${base}.xlsx`
  }
  if (!/^[a-zA-Z0-9._-]+\.xlsx$/i.test(s) || s.length > 120) {
    s = 'export.xlsx'
  }
  return s
}

/** Entfernt häufige KI-Verstöße: ```json … ``` innerhalb der Marker (Prompt verbietet das, wird ignoriert). */
function sanitizeSpecJsonChunk(chunk: string): string {
  let s = chunk.trim()
  if (s.startsWith('```')) {
    const firstLineBreak = s.indexOf('\n')
    if (firstLineBreak !== -1) {
      s = s.slice(firstLineBreak + 1)
    }
    const close = s.lastIndexOf('```')
    if (close !== -1) {
      s = s.slice(0, close)
    }
  }
  return s.trim()
}

/**
 * Erstes top-level `{ ... }` — KI setzt oft noch Saetze vor das JSON innerhalb der Marker.
 * Einfaches first/last-`}` bricht bei `}` in Formelstrings.
 */
function extractBalancedJsonObject(s: string): string | null {
  const start = s.indexOf('{')
  if (start === -1) {
    return null
  }
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (escape) {
      escape = false
      continue
    }
    if (inString) {
      if (c === '\\') {
        escape = true
        continue
      }
      if (c === '"') {
        inString = false
      }
      continue
    }
    if (c === '"') {
      inString = true
      continue
    }
    if (c === '{') {
      depth++
    } else if (c === '}') {
      depth--
      if (depth === 0) {
        return s.slice(start, i + 1)
      }
    }
  }
  return null
}

function tryParseExcelSpecJson(jsonChunk: string): unknown {
  const trimmed = jsonChunk.trim()
  const tryParse = (raw: string): unknown => JSON.parse(raw.replace(/,\s*([\]}])/g, '$1'))

  try {
    return JSON.parse(trimmed)
  } catch {
    try {
      return tryParse(trimmed)
    } catch {
      const balanced = extractBalancedJsonObject(trimmed)
      if (!balanced) {
        throw new Error('no-json-object')
      }
      try {
        return JSON.parse(balanced)
      } catch {
        return tryParse(balanced)
      }
    }
  }
}

export function normalizeExcelSpecForExport(spec: ExcelSpecV1): ExcelSpecV1 {
  return {
    ...spec,
    fileName: sanitizeExcelFileNameForEdge(spec.fileName),
    sheets: spec.sheets.map((sheet) => {
      const rows2d = normalizeRowsTo2D(sheet.rows as unknown)
      return {
        ...sheet,
        rows: mapFormulaCellsInRows(rows2d),
      }
    }),
  }
}

function normalizeRowsTo2D(rows: unknown): unknown[][] {
  if (!Array.isArray(rows) || rows.length === 0) {
    return []
  }
  const first = rows[0]
  const firstLooksLikeCell =
    first !== null &&
    typeof first === 'object' &&
    !Array.isArray(first) &&
    typeof (first as { t?: unknown }).t === 'string'

  if (firstLooksLikeCell) {
    return (rows as unknown[]).map((cell) => [cell])
  }

  return (rows as unknown[]).map((row) => {
    if (Array.isArray(row)) {
      return row
    }
    const looksLikeCell =
      row !== null &&
      typeof row === 'object' &&
      typeof (row as { t?: unknown }).t === 'string'
    if (looksLikeCell) {
      return [row]
    }
    return []
  })
}

export function parseExcelSpecFromContent(content: string): { spec: ExcelSpecV1 | null } {
  const normalized = normalizeContentForExcelSpec(content)
  const i = normalized.indexOf(STRATON_EXCEL_SPEC_START)
  const j = normalized.indexOf(STRATON_EXCEL_SPEC_END)
  if (i === -1 || j === -1 || j <= i) {
    return { spec: null }
  }
  const jsonChunk = sanitizeSpecJsonChunk(
    normalized.slice(i + STRATON_EXCEL_SPEC_START.length, j),
  )
  try {
    const parsed = tryParseExcelSpecJson(jsonChunk) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return { spec: null }
    }
    const o = parsed as { version?: unknown; fileName?: unknown; sheets?: unknown }
    const versionOk = o.version === 1 || o.version === '1'
    if (!versionOk || typeof o.fileName !== 'string' || !Array.isArray(o.sheets)) {
      return { spec: null }
    }
    if (o.sheets.length === 0) {
      return { spec: null }
    }
    const spec: ExcelSpecV1 = { ...parsed, version: 1 } as ExcelSpecV1
    return { spec }
  } catch {
    return { spec: null }
  }
}
