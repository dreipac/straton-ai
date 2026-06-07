import { useEffect, useLayoutEffect, useRef, useState, type TransitionEvent } from 'react'
import { getSupabaseClient } from '../../../integrations/supabase/client'
import {
  extractDateiTextFromContent,
  type ResolvedUserDocumentAttachment,
} from '../components/chat-window/chatWindowMessageUtils'
import {
  extractDocxPreviewTextFromUrl,
  normalizeDocumentPreviewText,
} from '../utils/documentPreviewFormat'

export type ChatDocumentPreviewState = {
  attachment: ResolvedUserDocumentAttachment
  messageContent: string
}

function isPdfAttachment(attachment: ResolvedUserDocumentAttachment): boolean {
  const mime = attachment.mimeType.toLowerCase()
  if (mime === 'application/pdf') {
    return true
  }
  return attachment.name.toLowerCase().endsWith('.pdf')
}

function isDocxAttachment(attachment: ResolvedUserDocumentAttachment): boolean {
  const name = attachment.name.toLowerCase()
  const mime = attachment.mimeType.toLowerCase()
  return (
    name.endsWith('.docx') ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
}

export function useChatDocumentPreview() {
  const [preview, setPreview] = useState<ChatDocumentPreviewState | null>(null)
  const [open, setOpen] = useState(false)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [textLoading, setTextLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewText, setPreviewText] = useState('')
  const closePendingRef = useRef(false)

  const showPdfEmbed =
    Boolean(preview && !preview.attachment.textOnly && signedUrl && isPdfAttachment(preview.attachment))
  const canDownload = Boolean(preview && !preview.attachment.textOnly && preview.attachment.bucket && preview.attachment.path)

  useLayoutEffect(() => {
    if (!preview) {
      setOpen(false)
      return
    }
    closePendingRef.current = false
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setOpen(true))
    })
    return () => cancelAnimationFrame(id)
  }, [preview])

  useEffect(() => {
    if (!preview || preview.attachment.textOnly) {
      setSignedUrl(null)
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setSignedUrl(null)

    void (async () => {
      try {
        const supabase = getSupabaseClient()
        const { data, error: urlError } = await supabase.storage
          .from(preview.attachment.bucket)
          .createSignedUrl(preview.attachment.path, 3600)
        if (cancelled) {
          return
        }
        if (urlError || !data?.signedUrl) {
          throw new Error(urlError?.message ?? 'Vorschau konnte nicht geladen werden.')
        }
        setSignedUrl(data.signedUrl)
      } catch (loadErr) {
        if (!cancelled) {
          setError(loadErr instanceof Error ? loadErr.message : 'Vorschau konnte nicht geladen werden.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [preview])

  useEffect(() => {
    if (!preview) {
      setPreviewText('')
      setTextLoading(false)
      return
    }

    const fallback = normalizeDocumentPreviewText(
      extractDateiTextFromContent(preview.messageContent, preview.attachment.name),
    )

    const canReparseDocx =
      !preview.attachment.textOnly &&
      isDocxAttachment(preview.attachment) &&
      Boolean(preview.attachment.bucket && preview.attachment.path)

    if (!canReparseDocx) {
      setPreviewText(fallback)
      setTextLoading(false)
      return
    }

    if (!signedUrl) {
      setPreviewText(fallback)
      setTextLoading(true)
      return
    }

    let cancelled = false
    setTextLoading(true)

    void extractDocxPreviewTextFromUrl(signedUrl)
      .then((text) => {
        if (!cancelled) {
          setPreviewText(text || fallback)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewText(fallback)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTextLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [preview, signedUrl])

  function openDocumentPreview(next: ChatDocumentPreviewState) {
    setPreview(next)
  }

  function closeDocumentPreview() {
    closePendingRef.current = true
    setOpen(false)
  }

  function handleTransitionEnd(event: TransitionEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.propertyName !== 'opacity') {
      return
    }
    if (closePendingRef.current) {
      closePendingRef.current = false
      setPreview(null)
      setSignedUrl(null)
      setError(null)
      setLoading(false)
      setTextLoading(false)
      setPreviewText('')
    }
  }

  useEffect(() => {
    if (!preview) {
      return
    }
    const onKeyDown = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        closeDocumentPreview()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [preview])

  async function downloadDocument() {
    if (!preview || preview.attachment.textOnly || !signedUrl) {
      return
    }
    try {
      const res = await fetch(signedUrl)
      if (!res.ok) {
        throw new Error('Datei konnte nicht geladen werden.')
      }
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = preview.attachment.name
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (downloadErr) {
      setError(downloadErr instanceof Error ? downloadErr.message : 'Download fehlgeschlagen.')
    }
  }

  return {
    preview,
    open,
    signedUrl,
    loading: loading || textLoading,
    error,
    previewText,
    showPdfEmbed,
    canDownload,
    openDocumentPreview,
    closeDocumentPreview,
    handleTransitionEnd,
    downloadDocument,
  }
}
