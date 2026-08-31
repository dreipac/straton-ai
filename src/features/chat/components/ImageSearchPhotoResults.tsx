import { useMemo, useState } from 'react'
import { IMAGE_SEARCH_MAX_PHOTOS } from '../services/imageSearch.service'
import type { ImageSearchPhotoResult } from '../types'

type Props = {
  query: string
  photos: ImageSearchPhotoResult[]
}

function photoKey(photo: ImageSearchPhotoResult, index: number): string {
  return photo.id || `photo-${index}`
}

export function ImageSearchPhotoResults({ query, photos }: Props) {
  const [failedKeys, setFailedKeys] = useState<Set<string>>(() => new Set())

  const shown = useMemo(() => {
    return photos
      .slice(0, IMAGE_SEARCH_MAX_PHOTOS)
      .filter((photo, index) => !failedKeys.has(photoKey(photo, index)))
  }, [photos, failedKeys])

  if (shown.length === 0) {
    return null
  }

  return (
    <div className="chat-unsplash-results" role="region" aria-label={`Fotos zu ${query}`}>
      {shown.map((photo, index) => {
        const key = photoKey(photo, index)
        return (
          <figure key={key} className="chat-unsplash-card">
            <a
              href={photo.photoPageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="chat-unsplash-image-link"
              aria-label={`Foto öffnen (${photo.photographerName})`}
            >
              <img
                src={photo.thumbUrl || photo.regularUrl}
                alt=""
                className="chat-unsplash-image"
                loading="lazy"
                decoding="async"
                onError={() => {
                  setFailedKeys((prev) => {
                    if (prev.has(key)) {
                      return prev
                    }
                    const next = new Set(prev)
                    next.add(key)
                    return next
                  })
                }}
              />
            </a>
            <figcaption className="chat-unsplash-caption">
              <p className="chat-unsplash-credit">
                Quelle:{' '}
                <a href={photo.photographerUrl} target="_blank" rel="noopener noreferrer">
                  {photo.photographerName}
                </a>
              </p>
            </figcaption>
          </figure>
        )
      })}
    </div>
  )
}
