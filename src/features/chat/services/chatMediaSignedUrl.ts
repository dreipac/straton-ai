import { getSupabaseClient } from '../../../integrations/supabase/client'
import { CHAT_VISION_MEDIA_BUCKET } from './chat.visionStorage'

const DEFAULT_SIGNED_URL_TTL_SECONDS = 3600
const REFRESH_BUFFER_MS = 5 * 60 * 1000

type CacheEntry = {
  url: string
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<string | null>>()

function cacheKey(bucket: string, path: string): string {
  return `${bucket}::${path}`
}

export async function createStorageSignedUrl(
  bucket: string,
  storagePath: string,
  expiresInSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  const path = storagePath.trim()
  if (!path) {
    return null
  }

  const key = cacheKey(bucket, path)
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && cached.expiresAt - REFRESH_BUFFER_MS > now) {
    return cached.url
  }

  const pending = inflight.get(key)
  if (pending) {
    return pending
  }

  const promise = (async () => {
    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds)
      if (error || !data?.signedUrl) {
        return null
      }
      cache.set(key, {
        url: data.signedUrl,
        expiresAt: now + expiresInSeconds * 1000,
      })
      return data.signedUrl
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, promise)
  return promise
}

export function createChatMediaSignedUrl(storagePath: string): Promise<string | null> {
  return createStorageSignedUrl(CHAT_VISION_MEDIA_BUCKET, storagePath)
}
