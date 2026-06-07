export const STRATON_MERMAID_DIAGRAM_START = '<<<STRATON_MERMAID_DIAGRAM>>>'
export const STRATON_MERMAID_DIAGRAM_END = '<<<END_STRATON_MERMAID_DIAGRAM>>>'

const MERMAID_HEADER_RE =
  /^(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|mindmap|timeline|block-beta|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|sankey-beta|xychart-beta|quadrantChart|requirementDiagram|gitGraph|pie)\b/i

export type DiagramSpecV1 = {
  version: 1
  source: string
}

export function normalizeContentForDiagramSpec(content: string): string {
  return content.replace(/\r\n/g, '\n')
}

export function hasDiagramSpecMarkers(content: string): boolean {
  const n = normalizeContentForDiagramSpec(content)
  return n.includes(STRATON_MERMAID_DIAGRAM_START) && n.includes(STRATON_MERMAID_DIAGRAM_END)
}

export function stripDiagramSpecBlock(content: string): string {
  const normalized = normalizeContentForDiagramSpec(content)
  const i = normalized.indexOf(STRATON_MERMAID_DIAGRAM_START)
  const j = normalized.indexOf(STRATON_MERMAID_DIAGRAM_END)
  if (i < 0 || j < 0 || j <= i) {
    return content
  }
  const before = normalized.slice(0, i).trimEnd()
  const after = normalized.slice(j + STRATON_MERMAID_DIAGRAM_END.length).trimStart()
  return [before, after].filter(Boolean).join('\n\n')
}

function stripMermaidFences(source: string): string {
  const trimmed = source.trim()
  const fenced = /^```(?:mermaid)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed)
  if (fenced?.[1]) {
    return fenced[1].trim()
  }
  return trimmed
}

function isPlausibleMermaidSource(source: string): boolean {
  const lines = stripMermaidFences(source)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) {
    return false
  }
  const first = lines[0] ?? ''
  if (MERMAID_HEADER_RE.test(first)) {
    return true
  }
  // Manche Diagramme starten mit %%{init:...}%% — zweite Zeile prüfen
  if (first.startsWith('%%') && lines[1] && MERMAID_HEADER_RE.test(lines[1])) {
    return true
  }
  return false
}

function tryParseDiagramSource(raw: string): DiagramSpecV1 | null {
  const source = stripMermaidFences(raw.trim())
  if (!source || source.length > 24_000) {
    return null
  }
  if (!isPlausibleMermaidSource(source)) {
    return null
  }
  return { version: 1, source }
}

export function parseDiagramSpecFromContent(content: string): { spec: DiagramSpecV1 | null } {
  const normalized = normalizeContentForDiagramSpec(content)
  const i = normalized.indexOf(STRATON_MERMAID_DIAGRAM_START)
  const j = normalized.indexOf(STRATON_MERMAID_DIAGRAM_END)
  if (i >= 0 && j > i) {
    const fromMarkers = tryParseDiagramSource(
      normalized.slice(i + STRATON_MERMAID_DIAGRAM_START.length, j),
    )
    if (fromMarkers) {
      return { spec: fromMarkers }
    }
  }

  const fenced = /```mermaid\s*\n([\s\S]*?)\n```/i.exec(normalized)
  if (fenced?.[1]) {
    const fromFence = tryParseDiagramSource(fenced[1])
    if (fromFence) {
      return { spec: fromFence }
    }
  }

  return { spec: null }
}
