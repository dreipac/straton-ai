import { getSupabaseClient } from '../../../integrations/supabase/client'
import type { UnsplashPhotoResult } from '../types'

export type UnsplashSearchResponse = {
  query: string
  photos: UnsplashPhotoResult[]
}

export async function fetchUnsplashSearchResults(query: string): Promise<UnsplashSearchResponse> {
  const trimmed = query.trim()
  if (!trimmed.length) {
    throw new Error('Bitte ein Suchmotiv eingeben.')
  }

  const supabase = getSupabaseClient()
  const { data, error } = await supabase.functions.invoke<{
    query?: string
    photos?: UnsplashPhotoResult[]
    error?: string
  }>('unsplash-search', {
    body: { query: trimmed.slice(0, 120) },
  })

  if (error) {
    throw new Error(error.message || 'Fotosuche ist fehlgeschlagen.')
  }

  if (data && typeof data === 'object' && typeof data.error === 'string' && data.error.trim()) {
    throw new Error(data.error.trim())
  }

  const photos = Array.isArray(data?.photos) ? data.photos : []
  const q = typeof data?.query === 'string' && data.query.trim() ? data.query.trim() : trimmed

  if (photos.length === 0) {
    throw new Error('Keine passenden Fotos gefunden.')
  }

  return { query: q, photos: photos.slice(0, 2) }
}

function buildUnsplashIntroText(query: string, count: number): string {
  const n = Math.min(2, Math.max(1, count))
  const bilder = n === 1 ? 'ein passendes Stock-Foto' : 'zwei passende Stock-Fotos'
  return [
    `Hier ${n === 1 ? 'ist' : 'sind'} ${bilder} von Unsplash zu **«${query}»**.`,
    'Die Bilder sind urheberrechtlich lizenziert — Quelle und Fotograf:in stehen unter jedem Foto.',
    'Tippe auf ein Bild, um es auf Unsplash in voller Größe zu öffnen.',
  ].join(' ')
}

export function buildUnsplashSearchAssistantPayload(input: UnsplashSearchResponse): {
  content: string
  metadata: { unsplashSearch: { query: string; photos: UnsplashPhotoResult[] } }
} {
  const { query, photos } = input
  const intro = buildUnsplashIntroText(query, photos.length)
  return {
    content: `## 📷 Fotos zu «${query}»\n\n${intro}`,
    metadata: {
      unsplashSearch: {
        query,
        photos,
      },
    },
  }
}
