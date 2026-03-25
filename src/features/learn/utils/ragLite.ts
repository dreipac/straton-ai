import type { UploadedMaterial } from '../services/learn.persistence'

type RetrievalOptions = {
  maxChunks?: number
  maxChars?: number
}

type MaterialChunk = {
  materialName: string
  content: string
}

const STOPWORDS = new Set([
  'der',
  'die',
  'das',
  'und',
  'oder',
  'ein',
  'eine',
  'mit',
  'ohne',
  'fuer',
  'für',
  'ist',
  'sind',
  'im',
  'in',
  'am',
  'an',
  'von',
  'zu',
  'auf',
  'als',
  'thema',
  'datei',
  'dateien',
  'material',
  'lernen',
  'lernpfad',
  'quiz',
  'kapitel',
  'frage',
  'fragen',
])

function normalizeText(raw: string): string {
  return raw.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
}

function tokenize(raw: string): string[] {
  return normalizeText(raw)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
}

function chunkText(text: string, size = 650, overlap = 120): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return []
  }

  const chunks: string[] = []
  let cursor = 0
  while (cursor < normalized.length) {
    const end = Math.min(normalized.length, cursor + size)
    const slice = normalized.slice(cursor, end).trim()
    if (slice) {
      chunks.push(slice)
    }
    if (end >= normalized.length) {
      break
    }
    cursor = Math.max(end - overlap, cursor + 1)
  }
  return chunks
}

function buildChunks(materials: UploadedMaterial[]): MaterialChunk[] {
  const result: MaterialChunk[] = []
  for (const material of materials) {
    for (const chunk of chunkText(material.excerpt)) {
      result.push({
        materialName: material.name,
        content: chunk,
      })
    }
  }
  return result
}

function scoreChunk(queryTokens: Set<string>, chunk: MaterialChunk): number {
  if (queryTokens.size === 0) {
    return 0
  }
  const chunkTokens = new Set(tokenize(chunk.content))
  let overlap = 0
  for (const token of queryTokens) {
    if (chunkTokens.has(token)) {
      overlap += 1
    }
  }
  return overlap / queryTokens.size
}

export function formatRelevantMaterialContext(
  query: string,
  materials: UploadedMaterial[],
  options?: RetrievalOptions,
): string {
  const maxChunks = options?.maxChunks ?? 8
  const maxChars = options?.maxChars ?? 5000
  if (!materials.length) {
    return ''
  }

  const chunks = buildChunks(materials)
  const queryTokens = new Set(tokenize(query))
  const ranked = chunks
    .map((chunk) => ({
      chunk,
      score: scoreChunk(queryTokens, chunk),
    }))
    .sort((a, b) => b.score - a.score)

  const selected = ranked
    .filter((entry) => entry.score > 0)
    .slice(0, maxChunks)
    .map((entry) => entry.chunk)

  const fallback = selected.length > 0 ? selected : chunks.slice(0, maxChunks)

  const lines: string[] = []
  let totalChars = 0
  for (let index = 0; index < fallback.length; index += 1) {
    const chunk = fallback[index]
    const line = `Quelle ${index + 1} (${chunk.materialName}): ${chunk.content}`
    if (totalChars + line.length > maxChars) {
      break
    }
    lines.push(line)
    totalChars += line.length
  }

  return lines.join('\n\n')
}
