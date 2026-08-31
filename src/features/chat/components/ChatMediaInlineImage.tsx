import { useEffect, useState } from 'react'
import { getSupabaseClient } from '../../../integrations/supabase/client'
import { CHAT_VISION_MEDIA_BUCKET } from '../services/chat.visionStorage'

type ChatMediaInlineImageProps = {
  storagePath: string
  alt: string
  className?: string
  onPreview?: (src: string) => void
}

export function ChatMediaInlineImage({ storagePath, alt, className, onPreview }: ChatMediaInlineImageProps) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSrc(null)
    setFailed(false)

    void (async () => {
      try {
        const supabase = getSupabaseClient()
        const { data, error } = await supabase.storage
          .from(CHAT_VISION_MEDIA_BUCKET)
          .createSignedUrl(storagePath, 3600)
        if (cancelled) {
          return
        }
        if (error || !data?.signedUrl) {
          setFailed(true)
          return
        }
        setSrc(data.signedUrl)
      } catch {
        if (!cancelled) {
          setFailed(true)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [storagePath])

  if (failed) {
    return <span className="chat-md-inline-image-fallback">{alt}</span>
  }

  if (!src) {
    return <span className="chat-md-inline-image-loading" aria-hidden="true" />
  }

  const classes = ['chat-md-inline-image', className ?? ''].filter(Boolean).join(' ')

  if (onPreview) {
    return (
      <button
        type="button"
        className="chat-inline-image-trigger"
        onClick={() => onPreview(src)}
        aria-label={alt || 'Bild vergrößern'}
      >
        <img className={classes} src={src} alt={alt} loading="lazy" />
      </button>
    )
  }

  return <img className={classes} src={src} alt={alt} loading="lazy" />
}
