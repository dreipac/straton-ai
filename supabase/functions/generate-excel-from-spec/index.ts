// @ts-expect-error - Deno URL import
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
// @ts-expect-error - Deno URL import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'
import ExcelJS from 'npm:exceljs@4.4.0'
import {
  injectChartsIntoXlsx,
  type ChartInjectSpec,
} from './chartInject.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BUCKET = 'chat-excel-exports'
const MAX_SHEETS = 10
const MAX_COLS = 100
const MAX_ROWS_PER_SHEET = 4000

type CellSpec =
  | { t: 'v'; value: string | number | boolean | null }
  | { t: 'f'; formula: string }

type SheetSpec = {
  name: string
  rows: unknown
  charts?: ChartInjectSpec[]
}

type ExcelSpecV1 = {
  version: 1
  fileName: string
  sheets: SheetSpec[]
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function stripExcelSpecBlock(content: string): string {
  const start = '<<<STRATON_EXCEL_SPEC_JSON>>>'
  const end = '<<<END_STRATON_EXCEL_SPEC_JSON>>>'
  const i = content.indexOf(start)
  const j = content.indexOf(end)
  if (i === -1 || j === -1 || j < i) {
    return content
  }
  return `${content.slice(0, i).trimEnd()}\n\n${content.slice(j + end.length).trimStart()}`.trim()
}

function isCellSpec(v: unknown): v is CellSpec {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  if (o.t === 'v') {
    const val = o.value
    return val === null || typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean'
  }
  if (o.t === 'f') {
    return typeof o.formula === 'string' && o.formula.trim().length > 0
  }
  return false
}

/** Rohe Strings/Zahlen / alternative Keys — gleiche Logik wie Client `coerceExcelCell`. */
function coerceCellSpec(raw: unknown): CellSpec | null {
  if (raw === null || raw === undefined) {
    return null
  }
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
    return { t: 'v', value: raw }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const o = raw as Record<string, unknown>
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
    if (!formula.trim()) {
      return null
    }
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
  return null
}

function isSimpleA1Range(s: string): boolean {
  const compact = s.replace(/\s+/g, '').trim()
  return /^(\$?[A-Za-z]{1,3}\$?\d{1,7})(:(\$?[A-Za-z]{1,3}\$?\d{1,7}))?$/i.test(compact)
}

/**
 * KI liefert oft "Diagramme!A5:A9", "=B5:B9" oder falsche Keys — für Charts brauchen wir nur den A1-Teil.
 */
function normalizeChartRangeInput(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null
  }
  let s = raw.trim()
  if (!s) {
    return null
  }
  if (s.startsWith('=')) {
    s = s.slice(1).trim()
  }
  const bang = s.lastIndexOf('!')
  if (bang >= 0) {
    s = s.slice(bang + 1).trim()
  }
  s = s.replace(/\s+/g, '')
  if (!isSimpleA1Range(s)) {
    return null
  }
  return s
}

function pickChartRangeField(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k]
    const n = normalizeChartRangeInput(v)
    if (n) {
      return n
    }
  }
  return null
}

function parseSpec(raw: unknown): ExcelSpecV1 {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Spec ist kein Objekt.')
  }
  const o = raw as Record<string, unknown>
  if (o.version !== 1) {
    throw new Error('Nur version 1 wird unterstützt.')
  }
  const fileName = typeof o.fileName === 'string' ? o.fileName.trim() : ''
  if (!fileName || !/^[a-zA-Z0-9._-]+\.xlsx$/i.test(fileName) || fileName.length > 120) {
    throw new Error('fileName muss auf .xlsx enden und nur sichere Zeichen enthalten.')
  }
  if (!Array.isArray(o.sheets) || o.sheets.length === 0) {
    throw new Error('sheets muss ein nicht-leeres Array sein.')
  }
  if (o.sheets.length > MAX_SHEETS) {
    throw new Error(`Maximal ${MAX_SHEETS} Blätter.`)
  }

  const sheets: SheetSpec[] = []
  for (const s of o.sheets) {
    if (!s || typeof s !== 'object') {
      throw new Error('Ungültiges Blatt.')
    }
    const sh = s as Record<string, unknown>
    const name = typeof sh.name === 'string' ? sh.name.trim().slice(0, 31) : ''
    if (!name) {
      throw new Error('Jedes Blatt braucht einen Namen.')
    }
    if (!Array.isArray(sh.rows)) {
      throw new Error('rows muss ein Array sein.')
    }
    if (sh.rows.length > MAX_ROWS_PER_SHEET) {
      throw new Error(`Maximal ${MAX_ROWS_PER_SHEET} Zeilen pro Blatt.`)
    }

    let charts: ChartInjectSpec[] | undefined
    if (sh.charts !== undefined && sh.charts !== null) {
      if (!Array.isArray(sh.charts)) {
        throw new Error('charts muss ein Array sein.')
      }
      if (sh.charts.length > 8) {
        throw new Error('Maximal 8 Diagramme pro Blatt.')
      }
      const parsedCharts: ChartInjectSpec[] = []
      for (const rawCh of sh.charts) {
        if (!rawCh || typeof rawCh !== 'object') {
          throw new Error('Ungültiges Diagramm-Objekt.')
        }
        const c = rawCh as Record<string, unknown>
        const t = typeof c.type === 'string' ? c.type.trim().toLowerCase() : ''
        if (t !== 'column' && t !== 'bar' && t !== 'line') {
          throw new Error('Diagramm type muss column, bar oder line sein.')
        }
        const categoriesRange = pickChartRangeField(c, [
          'categoriesRange',
          'categoryRange',
          'categories_range',
          'category_range',
          'xRange',
          'x_range',
          'labelsRange',
          'labels_range',
          'catRange',
          'cat_range',
        ])
        const valuesRange = pickChartRangeField(c, [
          'valuesRange',
          'valueRange',
          'values_range',
          'value_range',
          'yRange',
          'y_range',
          'dataRange',
          'data_range',
          'valRange',
          'val_range',
        ])
        if (!categoriesRange || !valuesRange) {
          throw new Error(
            'Jedes Diagramm braucht categoriesRange und valuesRange als A1-Bereich (z.B. A5:A9 und B5:B9). Optional mit Blatt: Diagramme!A5:A9.',
          )
        }
        const title = typeof c.title === 'string' ? c.title : undefined
        const seriesName = typeof c.seriesName === 'string' ? c.seriesName : undefined
        let anchorCol: number | undefined
        let anchorRow: number | undefined
        if (
          typeof c.anchorCol === 'number' &&
          Number.isFinite(c.anchorCol) &&
          c.anchorCol >= 0 &&
          c.anchorCol < 200
        ) {
          anchorCol = Math.floor(c.anchorCol)
        }
        if (
          typeof c.anchorRow === 'number' &&
          Number.isFinite(c.anchorRow) &&
          c.anchorRow >= 0 &&
          c.anchorRow < 100_000
        ) {
          anchorRow = Math.floor(c.anchorRow)
        }
        const rawSource = c.sourceSheet ?? c.dataSheet ?? c.rangeSheet ?? c.source_sheet
        let sourceSheet: string | undefined
        if (typeof rawSource === 'string' && rawSource.trim()) {
          sourceSheet = rawSource.trim().slice(0, 31)
        }
        parsedCharts.push({
          type: t as ChartInjectSpec['type'],
          title,
          seriesName,
          sourceSheet,
          categoriesRange,
          valuesRange,
          anchorCol,
          anchorRow,
        })
      }
      charts = parsedCharts
    }

    sheets.push({ name, rows: sh.rows, charts })
  }

  return { version: 1, fileName, sheets }
}

function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31)
  return cleaned || 'Tabelle'
}

/**
 * Entfernt fehlerhaftes @ direkt nach = (z.B. "=@SUMME(...)").
 * KI setzt das oft; Excel 365 zeigt "=@..." sonst in der Zelle.
 */
function sanitizeFormulaForExcelJs(raw: string): string {
  let s = raw.trim().replace(/\u00a0/g, ' ')
  let prev: string
  do {
    prev = s
    s = s.replace(/^=\s*@\s*/, '=')
  } while (s !== prev)
  if (s.startsWith('=')) {
    s = s.slice(1)
  }
  s = s.trimStart()
  while (s.startsWith('@')) {
    s = s.slice(1).trimStart()
  }
  return s
}

/** Ersetzt `;` nur ausserhalb von "...". In DE-Excel sind das Argument-Trenner; OOXML nutzt `,`. */
function replaceSemicolonsOutsideDoubleQuotes(s: string): string {
  let out = ''
  let inQuote = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '"') {
      inQuote = !inQuote
      out += c
    } else if (c === ';' && !inQuote) {
      out += ','
    } else {
      out += c
    }
  }
  return out
}

function escapeRegexChars(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * OOXML/ExcelJS erwartet für gültige .xlsx typischerweise englische Funktionsnamen
 * und Kommas als Argument-Trenner. Deutsche Namen (SUMME) lösen oft Reparatur-Dialoge aus.
 */
function convertGermanExcelFormulaToEnUsForOoxml(innerNoLeadingEquals: string): string {
  const pairs: Array<{ de: string; en: string }> = [
    { de: 'SUMMEWENNS', en: 'SUMIFS' },
    { de: 'SUMMEWENN', en: 'SUMIF' },
    { de: 'MITTELWERTWENNS', en: 'AVERAGEIFS' },
    { de: 'MITTELWERTWENN', en: 'AVERAGEIF' },
    { de: 'ZÄHLENWENNS', en: 'COUNTIFS' },
    { de: 'ZÄHLENWENN', en: 'COUNTIF' },
    { de: 'BEREICH.VERSCHIEBEN', en: 'OFFSET' },
    { de: 'WENNFEHLER', en: 'IFERROR' },
    { de: 'WENNFEHL', en: 'IFERROR' },
    { de: 'VERGLEICH', en: 'MATCH' },
    { de: 'INDIREKT', en: 'INDIRECT' },
    { de: 'XVERWEIS', en: 'XLOOKUP' },
    { de: 'SVERWEIS', en: 'VLOOKUP' },
    { de: 'WVERWEIS', en: 'HLOOKUP' },
    { de: 'FILTERN', en: 'FILTER' },
    { de: 'EINDEUTIG', en: 'UNIQUE' },
    { de: 'SORTIEREN', en: 'SORT' },
    { de: 'FOLGE', en: 'SEQUENCE' },
    { de: 'MTRANS', en: 'TRANSPOSE' },
    { de: 'SUMME', en: 'SUM' },
    { de: 'MITTELWERT', en: 'AVERAGE' },
    { de: 'ANZAHL2', en: 'COUNTA' },
    { de: 'ANZAHL', en: 'COUNT' },
    { de: 'PRODUKT', en: 'PRODUCT' },
    { de: 'WENN', en: 'IF' },
    { de: 'WAHR', en: 'TRUE' },
    { de: 'FALSCH', en: 'FALSE' },
    { de: 'UND', en: 'AND' },
    { de: 'ODER', en: 'OR' },
    { de: 'NICHT', en: 'NOT' },
    { de: 'RUNDEN', en: 'ROUND' },
    { de: 'ABS', en: 'ABS' },
    { de: 'MAX', en: 'MAX' },
    { de: 'MIN', en: 'MIN' },
    { de: 'NV', en: 'NA' },
    { de: 'WURZEL', en: 'SQRT' },
    { de: 'POTENZ', en: 'POWER' },
    { de: 'VERKETTEN', en: 'CONCAT' },
    { de: 'LINKS', en: 'LEFT' },
    { de: 'RECHTS', en: 'RIGHT' },
    { de: 'TEIL', en: 'MID' },
    { de: 'LÄNGE', en: 'LEN' },
    { de: 'GROSS', en: 'UPPER' },
    { de: 'KLEIN', en: 'LOWER' },
    { de: 'HEUTE', en: 'TODAY' },
    { de: 'JETZT', en: 'NOW' },
    { de: 'ZEILE', en: 'ROW' },
    { de: 'SPALTE', en: 'COLUMN' },
    { de: 'ISTLEER', en: 'ISBLANK' },
    { de: 'ISTZAHL', en: 'ISNUMBER' },
    { de: 'ISTTEXT', en: 'ISTEXT' },
    { de: 'GANZZAHL', en: 'INT' },
    { de: 'REST', en: 'MOD' },
    { de: 'ZUFALLSZAHL', en: 'RAND' },
  ]

  let s = innerNoLeadingEquals
  for (const { de, en } of pairs) {
    const re = new RegExp(`\\b${escapeRegexChars(de)}\\b`, 'gi')
    s = s.replace(re, en)
  }
  return replaceSemicolonsOutsideDoubleQuotes(s)
}

/** Wandelt häufige KI-Fehler (1D-Liste von Zellen) in echtes 2D-Zeilen-Array um. */
function normalizeRowsTo2D(rows: unknown): unknown[][] {
  if (!Array.isArray(rows) || rows.length === 0) {
    return []
  }
  const first = rows[0]
  const firstLooksLikeCell =
    first !== null &&
    typeof first === 'object' &&
    !Array.isArray(first) &&
    typeof (first as Record<string, unknown>).t === 'string'
  if (firstLooksLikeCell) {
    return (rows as unknown[]).map((cell) => [cell])
  }
  return (rows as unknown[]).map((row, idx) => {
    if (Array.isArray(row)) {
      return row
    }
    if (
      row !== null &&
      typeof row === 'object' &&
      typeof (row as Record<string, unknown>).t === 'string'
    ) {
      return [row]
    }
    throw new Error(`Ungültige Zeilenstruktur in Zeile ${idx + 1}.`)
  })
}

async function buildWorkbook(spec: ExcelSpecV1): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  for (const sheet of spec.sheets) {
    const ws = wb.addWorksheet(sanitizeSheetName(sheet.name))
    const rows = normalizeRowsTo2D(sheet.rows)
    rows.forEach((row, rIdx) => {
      if (!Array.isArray(row)) {
        throw new Error(`Zeile ${rIdx + 1}: erwartet Array von Zellen.`)
      }
      if (row.length > MAX_COLS) {
        throw new Error(`Maximal ${MAX_COLS} Spalten pro Zeile (Zeile ${rIdx + 1}).`)
      }
      row.forEach((cell, cIdx) => {
        if (cell === null || cell === undefined) {
          return
        }
        const coerced = coerceCellSpec(cell)
        if (!coerced || !isCellSpec(coerced)) {
          throw new Error(`Ungültige Zelle bei Zeile ${rIdx + 1}, Spalte ${cIdx + 1}.`)
        }
        const addr = rIdx + 1
        const col = cIdx + 1
        const target = ws.getCell(addr, col)
        if (coerced.t === 'v') {
          target.value = coerced.value as string | number | boolean | null
        } else {
          const cleaned = sanitizeFormulaForExcelJs(coerced.formula)
          if (!cleaned) {
            throw new Error(`Leere Formel bei Zeile ${rIdx + 1}, Spalte ${cIdx + 1}.`)
          }
          const ooxml = convertGermanExcelFormulaToEnUsForOoxml(cleaned)
          if (!ooxml.trim()) {
            throw new Error(`Leere Formel nach Konvertierung (Zeile ${rIdx + 1}, Spalte ${cIdx + 1}).`)
          }
          target.value = { formula: ooxml }
        }
      })
    })
  }
  const buf = await wb.xlsx.writeBuffer()
  const raw = new Uint8Array(buf)
  const sheetsForCharts = spec.sheets.map((s) => ({
    name: sanitizeSheetName(s.name),
    charts: s.charts,
  }))
  return await injectChartsIntoXlsx(raw, sheetsForCharts)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const authHeader = req.headers.get('Authorization')

  if (!supabaseUrl || !supabaseAnonKey || !serviceKey) {
    return jsonResponse({ error: 'Supabase-Konfiguration unvollständig.' }, 500)
  }
  if (!authHeader) {
    return jsonResponse({ error: 'Nicht authentifiziert.' }, 401)
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const admin = createClient(supabaseUrl, serviceKey)

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser()
  if (authError || !user) {
    return jsonResponse({ error: 'Session ist ungültig.' }, 401)
  }

  try {
    const body = (await req.json()) as {
      messageId?: unknown
      threadId?: unknown
      spec?: unknown
    }
    const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : ''
    const threadId = typeof body.threadId === 'string' ? body.threadId.trim() : ''
    if (!messageId || !threadId) {
      return jsonResponse({ error: 'messageId und threadId sind erforderlich.' }, 400)
    }

    const { data: msg, error: msgErr } = await userClient
      .from('chat_messages')
      .select('id, thread_id, role, content, metadata')
      .eq('id', messageId)
      .single()

    if (msgErr || !msg) {
      return jsonResponse({ error: 'Nachricht nicht gefunden.' }, 404)
    }
    if (msg.thread_id !== threadId || msg.role !== 'assistant') {
      return jsonResponse({ error: 'Ungültige Nachricht.' }, 400)
    }

    const { data: thread, error: thrErr } = await userClient
      .from('chat_threads')
      .select('user_id')
      .eq('id', threadId)
      .single()

    if (thrErr || !thread || thread.user_id !== user.id) {
      return jsonResponse({ error: 'Kein Zugriff auf diesen Chat.' }, 403)
    }

    const spec = parseSpec(body.spec)
    const bytes = await buildWorkbook(spec)
    if (bytes.length > 50 * 1024 * 1024) {
      return jsonResponse({ error: 'Datei zu gross.' }, 400)
    }

    const path = `${user.id}/${messageId}.xlsx`
    const upload = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true,
    })
    if (upload.error) {
      return jsonResponse({ error: upload.error.message || 'Upload fehlgeschlagen.' }, 500)
    }

    const prevMeta =
      msg.metadata && typeof msg.metadata === 'object' ? (msg.metadata as Record<string, unknown>) : {}
    let newContent = stripExcelSpecBlock(typeof msg.content === 'string' ? msg.content : '')
    if (!newContent.trim()) {
      newContent =
        'Die Excel-Datei wurde erstellt. Nutze den Button «Excel herunterladen» unter dieser Nachricht.'
    }
    const nextMetadata = {
      ...prevMeta,
      excelExport: {
        bucket: BUCKET,
        path,
        fileName: spec.fileName,
      },
    }

    const { error: upErr } = await admin
      .from('chat_messages')
      .update({
        content: newContent,
        metadata: nextMetadata,
      })
      .eq('id', messageId)

    if (upErr) {
      return jsonResponse({ error: upErr.message || 'Metadaten konnten nicht gespeichert werden.' }, 500)
    }

    return jsonResponse({
      excelExport: nextMetadata.excelExport,
      displayContent: newContent,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Serverfehler.'
    return jsonResponse({ error: message }, 500)
  }
})
