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
  'keine',
  'nach',
  'bei',
  'aus',
  'wie',
  'was',
  'wird',
  'werden',
  'haben',
  'hat',
  'auch',
  'nicht',
  'nur',
  'sich',
  'dass',
  'einem',
  'einen',
  'zum',
  'zur',
  'vom',
  'beim',
  'dann',
  'noch',
  'schon',
  'sehr',
  'hier',
  'alle',
  'mehr',
  'ueber',
  'über',
])

function normalizeText(raw: string): string {
  return raw.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
}

function rawWords(raw: string): string[] {
  return normalizeText(raw)
    .split(' ')
    .map((w) => w.trim())
    .filter(Boolean)
}

function tokenize(raw: string): string[] {
  return rawWords(raw).filter((token) => {
    if (token.length === 1) {
      return false
    }
    if (STOPWORDS.has(token)) {
      return false
    }
    if (token.length >= 3) {
      return true
    }
    return token.length === 2 && /^\p{L}{2}$/u.test(token)
  })
}

/** Query-Terme inkl. kurzer Mehrwort-Phrasen (Bigramme) fuer besseren Themabezug. */
function expandQueryTerms(query: string): { terms: string[]; bigramPhrases: string[] } {
  const words = rawWords(query)
  const terms = [...new Set(tokenize(query))]
  const bigramPhrases: string[] = []
  for (let i = 0; i < words.length - 1; i += 1) {
    const a = words[i]
    const b = words[i + 1]
    if (a.length < 2 || b.length < 2) {
      continue
    }
    if (STOPWORDS.has(a) && STOPWORDS.has(b)) {
      continue
    }
    if (!STOPWORDS.has(a) || !STOPWORDS.has(b) || a.length >= 4 || b.length >= 4) {
      bigramPhrases.push(`${a} ${b}`)
    }
  }
  return { terms, bigramPhrases: [...new Set(bigramPhrases)] }
}

function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function chunkText(text: string, size = 720, overlap = 140): string[] {
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

/** Erst Absaetze, dann Fenster — weniger mitten im Satz/Konzept geschnitten. */
function chunkParagraphs(text: string, maxChunkSize: number, overlap: number): string[] {
  const paragraphs = splitIntoParagraphs(text)
  const sources = paragraphs.length > 0 ? paragraphs : [text.replace(/\s+/g, ' ').trim()].filter(Boolean)
  const out: string[] = []
  for (const para of sources) {
    if (para.length <= maxChunkSize) {
      out.push(para)
    } else {
      out.push(...chunkText(para, maxChunkSize, overlap))
    }
  }
  return out
}

function buildChunks(materials: UploadedMaterial[]): MaterialChunk[] {
  const result: MaterialChunk[] = []
  for (const material of materials) {
    for (const chunk of chunkParagraphs(material.excerpt, 720, 140)) {
      result.push({
        materialName: material.name,
        content: chunk,
      })
    }
  }
  return result
}

function termFrequencyInText(normalizedChunk: string, term: string): number {
  if (!term.includes(' ')) {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
    const m = normalizedChunk.match(re)
    return m ? m.length : 0
  }
  let count = 0
  let pos = 0
  while ((pos = normalizedChunk.indexOf(term, pos)) !== -1) {
    count += 1
    pos += term.length
  }
  return count
}

function buildIdfIndex(chunks: MaterialChunk[]): { idf: Map<string, number>; avgdl: number; N: number } {
  const N = chunks.length
  if (N === 0) {
    return { idf: new Map(), avgdl: 1, N: 0 }
  }

  const df = new Map<string, number>()
  const lengths: number[] = []

  for (const { content } of chunks) {
    const terms = tokenize(content)
    lengths.push(Math.max(terms.length, 1))
    const seen = new Set(terms)
    for (const t of seen) {
      df.set(t, (df.get(t) ?? 0) + 1)
    }
  }

  const idf = new Map<string, number>()
  for (const [term, freq] of df) {
    idf.set(term, Math.log(1 + (N - freq + 0.5) / (freq + 0.5)))
  }

  const avgdl = lengths.reduce((a, b) => a + b, 0) / lengths.length
  return { idf, avgdl, N }
}

function bm25ScoreForChunk(
  queryTerms: string[],
  normalizedChunk: string,
  idf: Map<string, number>,
  avgdl: number,
  k1 = 1.35,
  b = 0.82,
): number {
  const chunkTerms = tokenize(normalizedChunk)
  const dl = chunkTerms.length
  const tf = new Map<string, number>()
  for (const t of chunkTerms) {
    tf.set(t, (tf.get(t) ?? 0) + 1)
  }

  let score = 0
  for (const q of queryTerms) {
    const idfQ = idf.get(q) ?? 0.01
    const f = tf.get(q) ?? 0
    if (f === 0) {
      continue
    }
    const denom = f + k1 * (1 - b + b * (dl / avgdl))
    score += idfQ * ((f * (k1 + 1)) / denom)
  }
  return score
}

function filenameRelevanceScore(materialName: string, queryTerms: Set<string>): number {
  const base = materialName.replace(/\.[^.]+$/i, '')
  const nameTokens = new Set(tokenize(base))
  if (nameTokens.size === 0) {
    return 0
  }
  let hit = 0
  for (const t of queryTerms) {
    if (nameTokens.has(t)) {
      hit += 1
    }
  }
  return hit / nameTokens.size
}

function phraseBonus(normalizedChunk: string, bigramPhrases: string[], queryNorm: string): number {
  let bonus = 0
  for (const phrase of bigramPhrases) {
    if (phrase.length >= 5 && normalizedChunk.includes(phrase)) {
      bonus += 2.5
    }
  }
  if (queryNorm.length >= 12 && normalizedChunk.includes(queryNorm)) {
    bonus += 1.5
  }
  return bonus
}

type ScoredChunk = {
  chunk: MaterialChunk
  score: number
}

function scoreAllChunks(
  chunks: MaterialChunk[],
  query: string,
  queryTerms: string[],
  queryTermSet: Set<string>,
  bigramPhrases: string[],
  idf: Map<string, number>,
  avgdl: number,
): ScoredChunk[] {
  const queryNorm = normalizeText(query)
  return chunks.map((chunk) => {
    const normalizedChunk = normalizeText(chunk.content)
    let score = bm25ScoreForChunk(queryTerms, normalizedChunk, idf, avgdl)
    score += phraseBonus(normalizedChunk, bigramPhrases, queryNorm)
    score += filenameRelevanceScore(chunk.materialName, queryTermSet) * 4

    for (const phrase of bigramPhrases) {
      const c = termFrequencyInText(normalizedChunk, phrase)
      if (c > 0) {
        score += Math.min(3, c) * 1.2
      }
    }

    return { chunk, score }
  })
}

function firstChunkPerMaterial(allChunks: MaterialChunk[]): MaterialChunk[] {
  const seen = new Set<string>()
  const out: MaterialChunk[] = []
  for (const ch of allChunks) {
    if (!seen.has(ch.materialName)) {
      seen.add(ch.materialName)
      out.push(ch)
    }
  }
  return out
}

/** Ergaenzt fehlende Dateien mit je einem ersten Absatz-Chunk (bessere Mehr-Datei-Abdeckung). */
function appendMissingMaterials(selected: MaterialChunk[], allChunks: MaterialChunk[], maxChunks: number): MaterialChunk[] {
  if (selected.length >= maxChunks) {
    return selected.slice(0, maxChunks)
  }
  const names = new Set(selected.map((c) => c.materialName))
  const extra = [...selected]
  for (const ch of firstChunkPerMaterial(allChunks)) {
    if (extra.length >= maxChunks) {
      break
    }
    if (!names.has(ch.materialName)) {
      extra.push(ch)
      names.add(ch.materialName)
    }
  }
  return extra.slice(0, maxChunks)
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
  if (chunks.length === 0) {
    return ''
  }

  const { terms: queryTerms, bigramPhrases } = expandQueryTerms(query)
  const queryTermSet = new Set(queryTerms)
  const { idf, avgdl } = buildIdfIndex(chunks)

  const ranked = scoreAllChunks(chunks, query, queryTerms, queryTermSet, bigramPhrases, idf, avgdl).sort(
    (a, b) => b.score - a.score,
  )

  const positive = ranked.filter((e) => e.score > 0).map((e) => e.chunk)
  let selected = positive.slice(0, maxChunks)

  if (selected.length === 0) {
    selected = chunks.slice(0, maxChunks)
  } else if (materials.length > 1 && selected.length < maxChunks) {
    selected = appendMissingMaterials(selected, chunks, maxChunks)
  }

  const lines: string[] = []
  let totalChars = 0
  for (let index = 0; index < selected.length; index += 1) {
    const chunk = selected[index]
    const line = `Quelle ${index + 1} (${chunk.materialName}): ${chunk.content}`
    if (totalChars + line.length > maxChars) {
      break
    }
    lines.push(line)
    totalChars += line.length
  }

  return lines.join('\n\n')
}
