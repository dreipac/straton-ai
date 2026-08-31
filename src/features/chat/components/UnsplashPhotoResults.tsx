import { UNSPLASH_SEARCH_MAX_PHOTOS } from '../services/unsplashSearch.service'
import type { UnsplashPhotoResult } from '../types'

type Props = {
  query: string
  photos: UnsplashPhotoResult[]
}

export function UnsplashPhotoResults({ query, photos }: Props) {
  const shown = photos.slice(0, UNSPLASH_SEARCH_MAX_PHOTOS)
  if (shown.length === 0) {
    return null
  }

  return (
    <div className="chat-unsplash-results" role="region" aria-label={`Fotos zu ${query}`}>
      {shown.map((photo, index) => (
        <figure key={photo.id || `photo-${index}`} className="chat-unsplash-card">
          <a
            href={photo.photoPageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="chat-unsplash-image-link"
          >
            <img
              src={photo.thumbUrl || photo.regularUrl}
              alt={photo.description}
              className="chat-unsplash-image"
              loading="lazy"
              decoding="async"
            />
          </a>
          <figcaption className="chat-unsplash-caption">
            <p className="chat-unsplash-description">{photo.description}</p>
            <p className="chat-unsplash-credit">
              Quelle:{' '}
              <a href={photo.photographerUrl} target="_blank" rel="noopener noreferrer">
                {photo.photographerName}
              </a>{' '}
              auf{' '}
              <a href={photo.photoPageUrl} target="_blank" rel="noopener noreferrer">
                Unsplash
              </a>
            </p>
          </figcaption>
        </figure>
      ))}
    </div>
  )
}
