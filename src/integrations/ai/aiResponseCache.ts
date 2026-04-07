/**
 * Clientseitiger Cache fuer KI-Hilfsantworten (gleicher Input → gleiche Antwort).
 * Bewusst NICHT fuer Hauptchat sendMessage — dort aendert sich der Kontext staendig.
 */

const STORAGE_KEY = 'straton-ai-response-cache-v1'
const SCHEMA_VERSION = 1
const MAX_ENTRIES = 36
const MAX_PAYLOAD_CHARS = 100_000

type StoredBlob = {
  exp: number
  payload: unknown
}

type StoreShape = {
  entries: Record<string, StoredBlob>
  /** LRU: aelteste Keys vorne */
  order: string[]
}

function fnv1aHex(input: string): string {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16)
}

export function cacheKey(namespace: string, parts: string[]): string {
  const body = parts.join('\u001e')
  return `${SCHEMA_VERSION}:${namespace}:${fnv1aHex(body)}`
}

function readStore(): StoreShape {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { entries: {}, order: [] }
    }
    const parsed = JSON.parse(raw) as Partial<StoreShape>
    if (!parsed.entries || typeof parsed.entries !== 'object' || !Array.isArray(parsed.order)) {
      return { entries: {}, order: [] }
    }
    return { entries: parsed.entries as Record<string, StoredBlob>, order: parsed.order as string[] }
  } catch {
    return { entries: {}, order: [] }
  }
}

function writeStore(store: StoreShape) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Quota — leeren und erneut versuchen (ein Eintrag)
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }
}

function pruneExpired(store: StoreShape, now: number) {
  const nextOrder: string[] = []
  for (const k of store.order) {
    const e = store.entries[k]
    if (!e || e.exp <= now) {
      delete store.entries[k]
    } else {
      nextOrder.push(k)
    }
  }
  store.order = nextOrder
}

function touchOrder(store: StoreShape, key: string) {
  store.order = store.order.filter((k) => k !== key)
  store.order.push(key)
}

function evictIfNeeded(store: StoreShape) {
  while (store.order.length > MAX_ENTRIES) {
    const victim = store.order.shift()
    if (victim) {
      delete store.entries[victim]
    }
  }
}

export function getCachedResponse<T>(namespace: string, parts: string[]): T | null {
  if (typeof window === 'undefined') {
    return null
  }
  const key = cacheKey(namespace, parts)
  const now = Date.now()
  const store = readStore()
  pruneExpired(store, now)
  const hit = store.entries[key]
  if (!hit || hit.exp <= now) {
    if (hit) {
      delete store.entries[key]
      store.order = store.order.filter((k) => k !== key)
      writeStore(store)
    }
    return null
  }
  touchOrder(store, key)
  writeStore(store)
  return hit.payload as T
}

export function setCachedResponse<T>(namespace: string, parts: string[], value: T, ttlMs: number) {
  if (typeof window === 'undefined') {
    return
  }
  const key = cacheKey(namespace, parts)
  let serialized: string
  try {
    serialized = JSON.stringify(value)
  } catch {
    return
  }
  if (serialized.length > MAX_PAYLOAD_CHARS) {
    return
  }
  const now = Date.now()
  const store = readStore()
  pruneExpired(store, now)
  store.entries[key] = { exp: now + ttlMs, payload: value }
  touchOrder(store, key)
  evictIfNeeded(store)
  writeStore(store)
}

export function clearAiResponseCache() {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** Liest Cache oder fuehrt fetcher aus; bei Erfolg speichern (Fehler werden nicht gecacht). */
export async function getOrSetCachedResponse<T>(
  namespace: string,
  keyParts: string[],
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  if (typeof window === 'undefined') {
    return fetcher()
  }
  const hit = getCachedResponse<T>(namespace, keyParts)
  if (hit !== null) {
    return hit
  }
  const v = await fetcher()
  setCachedResponse(namespace, keyParts, v, ttlMs)
  return v
}

/** TTL-Konstanten (ms) */
export const AI_CACHE_TTL = {
  topicSuggestions: 86_400_000, // 24h
  chatTitle: 86_400_000 * 7,
  excelSpec: 86_400_000,
  learnFlashcards: 86_400_000 * 7,
  learnWorksheet: 86_400_000 * 7,
  quizEval: 86_400_000,
} as const
