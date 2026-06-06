import { useCallback, useEffect, useState, type RefObject } from 'react'
import newsIcon from '../../../assets/icons/news.svg'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'
import { type ProfileFullSheetHandle } from '../../../components/ui/bottom-sheet/ProfileFullSheet'
import { ModalHeader } from '../../../components/ui/modal/ModalHeader'
import { ModalShell } from '../../../components/ui/modal/ModalShell'
import { NEWS_FEED_REFRESH_EVENT } from '../constants/newsFeed'
import { dispatchNewsFeedRefresh } from '../hooks/useNewsUnreadCount'
import { setNewsFeedOpen } from '../newsFeedSession'
import {
  deleteNewsPost,
  listNewsPosts,
  markAllNewsPostsRead,
  type NewsPost,
} from '../services/news.service'
import { NewsPostComposerModal } from './NewsPostComposerModal'

type NewsFeedVariant = 'modal' | 'sheet'

type NewsFeedModalProps = {
  isOpen: boolean
  onClose: () => void
  isAdmin: boolean
  variant?: NewsFeedVariant
  sheetRef?: RefObject<ProfileFullSheetHandle | null>
}

function formatNewsDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-CH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

export function NewsFeedModal({
  isOpen,
  onClose,
  isAdmin,
  variant = 'modal',
  sheetRef,
}: NewsFeedModalProps) {
  const [posts, setPosts] = useState<NewsPost[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingPost, setEditingPost] = useState<NewsPost | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerMounted, setComposerMounted] = useState(false)
  const [composerVisible, setComposerVisible] = useState(false)
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null)

  const isSheet = variant === 'sheet'

  const loadPosts = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const next = await listNewsPosts()
      setPosts(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Posts konnten nicht geladen werden.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  function openCreateComposer() {
    setEditingPost(null)
    setComposerOpen(true)
  }

  function openEditComposer(post: NewsPost) {
    setEditingPost(post)
    setComposerOpen(true)
  }

  function closeComposer() {
    setComposerOpen(false)
    setEditingPost(null)
  }

  function requestClose() {
    if (isSheet) {
      sheetRef?.current?.requestClose()
      return
    }
    onClose()
  }

  async function handleDeletePost(post: NewsPost) {
    if (
      !window.confirm(`Post «${post.title}» wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)
    ) {
      return
    }
    setDeletingPostId(post.id)
    setError(null)
    try {
      await deleteNewsPost(post)
      await loadPosts()
      dispatchNewsFeedRefresh({ reason: 'manual' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.')
    } finally {
      setDeletingPostId(null)
    }
  }

  useEffect(() => {
    if (!isOpen) {
      setNewsFeedOpen(false)
      setComposerOpen(false)
      setEditingPost(null)
      return
    }

    setNewsFeedOpen(true)
    void loadPosts()

    void (async () => {
      try {
        await markAllNewsPostsRead()
        dispatchNewsFeedRefresh({ reason: 'marked-read' })
      } catch {
        /* Badge optional */
      }
    })()
  }, [isOpen, loadPosts])

  useEffect(() => {
    if (isSheet) {
      return
    }
    if (composerOpen) {
      setComposerMounted(true)
      const id = window.requestAnimationFrame(() => setComposerVisible(true))
      return () => window.cancelAnimationFrame(id)
    }

    setComposerVisible(false)
    const timer = window.setTimeout(() => {
      setComposerMounted(false)
    }, 220)
    return () => window.clearTimeout(timer)
  }, [composerOpen, isSheet])

  useEffect(() => {
    if (!isOpen) {
      return
    }
    function onRefresh() {
      void loadPosts()
    }
    window.addEventListener(NEWS_FEED_REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(NEWS_FEED_REFRESH_EVENT, onRefresh)
  }, [isOpen, loadPosts])

  const composerShouldRender = isSheet ? composerOpen : composerMounted
  const composerIsOpen = isSheet ? composerOpen : composerVisible

  const feedContent = (
    <section
      className={`rename-modal news-feed-modal${isSheet ? ' news-feed-modal--sheet-embed' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Updates und Neuigkeiten"
    >
      {!isSheet ? (
        <header className="news-feed-modal-header">
          <ModalHeader
            title="Updates & Neuigkeiten"
            titleIcon={newsIcon}
            headingLevel="h2"
            onClose={requestClose}
            closeLabel="Schliessen"
          />
        </header>
      ) : null}
      {isAdmin ? (
        <div className="news-feed-modal-toolbar">
          <PrimaryButton type="button" onClick={openCreateComposer}>
            Feed posten
          </PrimaryButton>
        </div>
      ) : null}
      <div className="news-feed-modal-body">
        {isLoading && posts.length === 0 ? <p className="news-feed-empty">Lade Neuigkeiten…</p> : null}
        {error ? (
          <p className="news-feed-error" role="alert">
            {error}
          </p>
        ) : null}
        {!isLoading && !error && posts.length === 0 ? (
          <p className="news-feed-empty">Noch keine Neuigkeiten veröffentlicht.</p>
        ) : null}
        <div className="news-feed-list">
          {posts.map((post) => (
            <article key={post.id} className="news-feed-post">
              {post.image_url ? (
                <div className="news-feed-post-media">
                  <img src={post.image_url} alt="" loading="lazy" />
                </div>
              ) : null}
              <div className="news-feed-post-content">
                <div className="news-feed-post-head">
                  <div className="news-feed-post-head-copy">
                    <h3 className="news-feed-post-title">{post.title}</h3>
                    <p className="news-feed-post-date">{formatNewsDate(post.created_at)}</p>
                  </div>
                  {isAdmin ? (
                    <div className="news-feed-post-admin-actions">
                      <SecondaryButton
                        type="button"
                        className="news-feed-post-admin-btn"
                        disabled={deletingPostId === post.id}
                        onClick={() => openEditComposer(post)}
                      >
                        Bearbeiten
                      </SecondaryButton>
                      <button
                        type="button"
                        className="news-feed-post-delete-btn"
                        disabled={deletingPostId === post.id}
                        onClick={() => void handleDeletePost(post)}
                      >
                        {deletingPostId === post.id ? 'Löschen…' : 'Löschen'}
                      </button>
                    </div>
                  ) : null}
                </div>
                <p className="news-feed-post-body">{post.body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )

  const composer = composerShouldRender ? (
    <NewsPostComposerModal
      variant={variant}
      isOpen={composerIsOpen}
      editingPost={editingPost}
      onClose={closeComposer}
      onSaved={() => {
        closeComposer()
        void loadPosts()
        dispatchNewsFeedRefresh({ reason: 'manual' })
      }}
    />
  ) : null

  if (isSheet) {
    return (
      <div className="news-feed-sheet-root">
        <div className="news-feed-sheet-embed">{feedContent}</div>
        {composer}
      </div>
    )
  }

  return (
    <>
      <ModalShell isOpen={isOpen} onRequestClose={requestClose} className="news-feed-modal-wrap">
        {feedContent}
      </ModalShell>
      {composer}
    </>
  )
}
