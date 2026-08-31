export const STRATON_CHART_SPEC_START = '<<<STRATON_CHART_SPEC_JSON>>>'
export const STRATON_CHART_SPEC_END = '<<<END_STRATON_CHART_SPEC_JSON>>>'

export const CHART_SPEC_TYPES = ['bar', 'line', 'pie', 'doughnut'] as const
export type ChartSpecType = (typeof CHART_SPEC_TYPES)[number]

export type ChartSpecDatasetV1 = {
  label: string
  data: number[]
}

export type ChartSpecOptionsV1 = {
  stacked?: boolean
  unit?: string
  locale?: string
  beginAtZero?: boolean
}

export type ChartSpecV1 = {
  version: 1
  type: ChartSpecType
  title?: string
  labels: string[]
  datasets: ChartSpecDatasetV1[]
  options?: ChartSpecOptionsV1
}

const MAX_LABELS = 50
const MAX_DATASETS = 10
const MAX_POINTS_PER_DATASET = 50

export function normalizeContentForChartSpec(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\u200b|\u200c|\u200d|\ufeff/g, '')
}

export function hasChartSpecMarkers(content: string): boolean {
  const n = normalizeContentForChartSpec(content)
  return n.includes(STRATON_CHART_SPEC_START) && n.includes(STRATON_CHART_SPEC_END)
}

export function stripChartSpecBlock(content: string): string {
  const normalized = normalizeContentForChartSpec(content)
  const i = normalized.indexOf(STRATON_CHART_SPEC_START)
  const j = normalized.indexOf(STRATON_CHART_SPEC_END)
  if (i === -1 || j === -1 || j < i) {
    return content
  }
  const before = normalized.slice(0, i).trimEnd()
  const after = normalized.slice(j + STRATON_CHART_SPEC_END.length).trimStart()
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

function sanitizeSpecJsonChunk(chunk: string): string {
  let s = chunk.trim()
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  }
  return s.trim()
}

function isChartType(value: unknown): value is ChartSpecType {
  return typeof value === 'string' && (CHART_SPEC_TYPES as readonly string[]).includes(value)
}

function parseNumberArray(value: unknown, maxLen: number): number[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const out: number[] = []
  for (const entry of value.slice(0, maxLen)) {
    if (typeof entry === 'number' && Number.isFinite(entry)) {
      out.push(entry)
    } else if (typeof entry === 'string' && entry.trim() !== '') {
      const n = Number(entry.replace(',', '.'))
      if (Number.isFinite(n)) {
        out.push(n)
      } else {
        return null
      }
    } else {
      return null
    }
  }
  return out.length > 0 ? out : null
}

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
      depth += 1
    } else if (c === '}') {
      depth -= 1
      if (depth === 0) {
        return s.slice(start, i + 1)
      }
    }
  }
  return null
}

function tryParseChartSpecJson(jsonChunk: string): ChartSpecV1 | null {
  try {
    const parsed = JSON.parse(sanitizeSpecJsonChunk(jsonChunk)) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return null
    }
    const o = parsed as Record<string, unknown>
    const versionOk = o.version === 1 || o.version === '1'
    if (!versionOk || !isChartType(o.type)) {
      return null
    }
    if (!Array.isArray(o.labels) || !Array.isArray(o.datasets)) {
      return null
    }
    const labels = o.labels
      .filter((l): l is string => typeof l === 'string')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, MAX_LABELS)
    if (labels.length === 0) {
      return null
    }
    const labelCount = labels.length
    const datasets: ChartSpecDatasetV1[] = []
    for (const raw of o.datasets.slice(0, MAX_DATASETS)) {
      if (!raw || typeof raw !== 'object') {
        return null
      }
      const ds = raw as Record<string, unknown>
      const label = typeof ds.label === 'string' ? ds.label.trim() : 'Serie'
      const data = parseNumberArray(ds.data, MAX_POINTS_PER_DATASET)
      if (!data || data.length !== labelCount) {
        return null
      }
      datasets.push({ label: label || 'Serie', data })
    }
    if (datasets.length === 0) {
      return null
    }
    const optionsRaw = o.options
    let options: ChartSpecOptionsV1 | undefined
    if (optionsRaw && typeof optionsRaw === 'object' && !Array.isArray(optionsRaw)) {
      const opt = optionsRaw as Record<string, unknown>
      options = {
        ...(opt.stacked === true ? { stacked: true } : {}),
        ...(typeof opt.unit === 'string' && opt.unit.trim() ? { unit: opt.unit.trim().slice(0, 40) } : {}),
        ...(typeof opt.locale === 'string' && opt.locale.trim()
          ? { locale: opt.locale.trim().slice(0, 20) }
          : {}),
        ...(opt.beginAtZero === true ? { beginAtZero: true } : {}),
      }
      if (Object.keys(options).length === 0) {
        options = undefined
      }
    }
    const title = typeof o.title === 'string' ? o.title.trim().slice(0, 120) : undefined
    const spec: ChartSpecV1 = {
      version: 1,
      type: o.type,
      labels,
      datasets,
      ...(title ? { title } : {}),
      ...(options ? { options } : {}),
    }
    return spec
  } catch {
    return null
  }
}

export function parseChartSpecFromContent(content: string): { spec: ChartSpecV1 | null } {
  const normalized = normalizeContentForChartSpec(content)
  const i = normalized.indexOf(STRATON_CHART_SPEC_START)
  const j = normalized.indexOf(STRATON_CHART_SPEC_END)
  if (i !== -1 && j !== -1 && j > i) {
    const fromMarkers = tryParseChartSpecJson(
      normalized.slice(i + STRATON_CHART_SPEC_START.length, j),
    )
    if (fromMarkers) {
      return { spec: fromMarkers }
    }
  }
  const fenced = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    const fromFence = tryParseChartSpecJson(fenced[1])
    if (fromFence) {
      return { spec: fromFence }
    }
  }
  const balanced = extractBalancedJsonObject(normalized)
  if (balanced && /"type"\s*:\s*"(?:bar|line|pie|doughnut)"/.test(balanced)) {
    const fromBalanced = tryParseChartSpecJson(balanced)
    if (fromBalanced) {
      return { spec: fromBalanced }
    }
  }
  return { spec: null }
}
