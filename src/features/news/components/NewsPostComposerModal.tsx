import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ContentBottomSheet } from '../../../components/ui/bottom-sheet/ContentBottomSheet'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'
import { TextArea } from '../../../components/ui/inputs/TextArea'
import { ModalHeader } from '../../../components/ui/modal/ModalHeader'
import { ModalShell } from '../../../components/ui/modal/ModalShell'
import { NEWS_BODY_MAX, NEWS_IMAGE_MAX_BYTES, NEWS_TITLE_MAX } from '../constants/newsFeed'
import { createNewsPost, updateNewsPost, type NewsPost } from '../services/news.service'

type NewsPostComposerVariant = 'modal' | 'sheet'

type NewsPostComposerModalProps = {
  isOpen: boolean
  editingPost?: NewsPost | null
  onClose: () => void
  onSaved: () => void
  variant?: NewsPostComposerVariant
}

export function NewsPostComposerModal({
  isOpen,
  editingPost = null,
  onClose,
  onSaved,
  variant = 'modal',
}: NewsPostComposerModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [removeExistingImage, setRemoveExistingImage] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = editingPost != null
  const isSheet = variant === 'sheet'

  useEffect(() => {
    if (!isOpen) {
      setTitle('')
      setBody('')
      setImageFile(null)
      setImagePreviewUrl(null)
      setRemoveExistingImage(false)
      setError(null)
      setIsSaving(false)
      return
    }

    if (editingPost) {
      setTitle(editingPost.title)
      setBody(editingPost.body)
      setImageFile(null)
      setImagePreviewUrl(editingPost.image_url)
      setRemoveExistingImage(false)
      setError(null)
      setIsSaving(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [editingPost, isOpen])

  useEffect(() => {
    if (!imageFile) {
      if (!removeExistingImage && editingPost?.image_url) {
        setImagePreviewUrl(editingPost.image_url)
      } else if (removeExistingImage) {
        setImagePreviewUrl(null)
      }
      return
    }
    const url = URL.createObjectURL(imageFile)
    setImagePreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [editingPost?.image_url, imageFile, removeExistingImage])

  function handleImagePick(file: File | null) {
    if (!file) {
      setImageFile(null)
      return
    }
    if (!file.type.startsWith('image/')) {
      setError('Nur Bilddateien sind erlaubt.')
      return
    }
    if (file.size > NEWS_IMAGE_MAX_BYTES) {
      setError('Bild darf maximal 3 MB gross sein.')
      return
    }
    setError(null)
    setRemoveExistingImage(false)
    setImageFile(file)
  }

  function clearImage() {
    setImageFile(null)
    setRemoveExistingImage(true)
    setImagePreviewUrl(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (isSaving) {
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      if (isEditing && editingPost) {
        await updateNewsPost({
          postId: editingPost.id,
          title,
          body,
          imageFile,
          removeImage: removeExistingImage,
          existingImagePath: editingPost.image_path,
        })
      } else {
        await createNewsPost({ title, body, imageFile })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
      setIsSaving(false)
    }
  }

  const form = (
    <form className="news-composer-form" onSubmit={(event) => void handleSubmit(event)}>
      <div className="news-composer-layout">
        <div className="news-composer-media">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="news-composer-file-input"
            onChange={(event) => handleImagePick(event.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            className="news-composer-media-button"
            onClick={() => fileInputRef.current?.click()}
          >
            {imagePreviewUrl ? (
              <img src={imagePreviewUrl} alt="Vorschau" className="news-composer-media-preview" />
            ) : (
              <span className="news-composer-media-placeholder">Bild einfügen</span>
            )}
          </button>
          {imagePreviewUrl || imageFile || (isEditing && editingPost.image_url && !removeExistingImage) ? (
            <button type="button" className="news-composer-media-remove" onClick={clearImage}>
              Bild entfernen
            </button>
          ) : null}
        </div>
        <div className="news-composer-fields">
          <label className="news-composer-label" htmlFor="news-composer-title">
            Titel
          </label>
          <input
            id="news-composer-title"
            className="news-composer-input"
            value={title}
            maxLength={NEWS_TITLE_MAX}
            disabled={isSaving}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Kurzer Titel"
          />
          <label className="news-composer-label" htmlFor="news-composer-body">
            Text
          </label>
          <TextArea
            id="news-composer-body"
            className="news-composer-textarea"
            value={body}
            maxLength={NEWS_BODY_MAX}
            rows={8}
            disabled={isSaving}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Was gibt es Neues?"
          />
        </div>
      </div>
      {error ? (
        <p className="news-composer-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="news-composer-actions">
        <SecondaryButton type="button" disabled={isSaving} onClick={onClose}>
          Abbrechen
        </SecondaryButton>
        <PrimaryButton type="submit" disabled={isSaving || !title.trim() || !body.trim()}>
          {isSaving ? 'Speichert…' : isEditing ? 'Speichern' : 'Veröffentlichen'}
        </PrimaryButton>
      </div>
    </form>
  )

  if (isSheet) {
    return (
      <ContentBottomSheet
        open={isOpen}
        onExitComplete={onClose}
        title={isEditing ? 'Post bearbeiten' : 'Feed posten'}
        adaptVisualViewport
        panelClassName="news-composer-sheet-panel"
        bodyClassName="news-composer-sheet-body"
      >
        {form}
      </ContentBottomSheet>
    )
  }

  return (
    <ModalShell isOpen={isOpen} onRequestClose={onClose} className="news-composer-modal-wrap">
      <section
        className="rename-modal news-composer-modal"
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? 'Post bearbeiten' : 'Feed posten'}
      >
        <header className="news-composer-modal-header">
          <ModalHeader
            title={isEditing ? 'Post bearbeiten' : 'Feed posten'}
            headingLevel="h3"
            onClose={onClose}
            closeLabel="Schliessen"
          />
        </header>
        {form}
      </section>
    </ModalShell>
  )
}
