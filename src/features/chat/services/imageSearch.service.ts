import { getSupabaseClient } from '../../../integrations/supabase/client'
import type { ImageSearchPhotoResult } from '../types'

export const IMAGE_SEARCH_MAX_PHOTOS = 4

export type ImageSearchResponse = {
  query: string
  photos: ImageSearchPhotoResult[]
}

export async function fetchImageSearchResults(query: string): Promise<ImageSearchResponse> {
  const trimmed = query.trim()
  if (!trimmed.length) {
    throw new Error('Bitte ein Suchmotiv eingeben.')
  }

  const supabase = getSupabaseClient()
  const { data, error, response } = await supabase.functions.invoke<{
    query?: string
    photos?: ImageSearchPhotoResult[]
    error?: string
  }>('unsplash-search', {
    body: { query: trimmed.slice(0, 120) },
  })

  if (error) {
    let detail = error.message || 'Fotosuche ist fehlgeschlagen.'
    if (response) {
      try {
        const text = (await response.text()).trim()
        if (text) {
          const parsed = JSON.parse(text) as { error?: unknown }
          if (typeof parsed.error === 'string' && parsed.error.trim()) {
            detail = parsed.error.trim()
          }
        }
      } catch {
        /* Body nicht lesbar */
      }
    }
    throw new Error(detail)
  }

  if (data && typeof data === 'object' && typeof data.error === 'string' && data.error.trim()) {
    throw new Error(data.error.trim())
  }

  const photos = Array.isArray(data?.photos) ? data.photos : []
  const q = typeof data?.query === 'string' && data.query.trim() ? data.query.trim() : trimmed

  if (photos.length === 0) {
    throw new Error('Keine passenden Fotos gefunden.')
  }

  return { query: q, photos: photos.slice(0, IMAGE_SEARCH_MAX_PHOTOS) }
}

function buildImageSearchIntroText(query: string, count: number): string {
  const n = Math.min(IMAGE_SEARCH_MAX_PHOTOS, Math.max(1, count))
  const bilder = n === 1 ? 'ein passendes Bild' : `${n} passende Bilder`
  return [
    `Hier ${n === 1 ? 'ist' : 'sind'} ${bilder} aus der Tavily-Websuche zu **«${query}»**.`,
    'Unter jedem Bild findest du die Quelle — tippe darauf, um das Original zu öffnen.',
  ].join(' ')
}

export function buildImageSearchAssistantPayload(input: ImageSearchResponse): {
  content: string
  metadata: { imageSearch: { query: string; photos: ImageSearchPhotoResult[] } }
} {
  const { query, photos } = input
  const intro = buildImageSearchIntroText(query, photos.length)
  return {
    content: `## 📷 Fotos zu «${query}»\n\n${intro}`,
    metadata: {
      imageSearch: {
        query,
        photos,
      },
    },
  }
}
