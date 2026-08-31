import { useCallback, useEffect, useRef, useState } from 'react'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'
import { NEWS_FEED_REFRESH_EVENT } from '../constants/newsFeed'
import { dispatchNewsFeedRefresh } from '../hooks/useNewsUnreadCount'
import { setNewsFeedOpen } from '../newsFeedSession'
import { deleteNewsPost, listNewsPosts, markAllNewsPostsRead, type NewsPost } from '../services/news.service'
import { NewsPostComposerModal } from './NewsPostComposerModal'

type ChatNewsOverviewProps = {
  isAdmin: boolean
  isCompactMobile: boolean
}

/** Datum als Tag/Monat für das Kalender-Badge links neben dem Beitrag — bewusst ohne Uhrzeit. */
function formatNewsDateParts(iso: string): { day: string; month: string; full: string } {
  try {
    const date = new Date(iso)
    return {
      day: date.toLocaleDateString('de-CH', { day: '2-digit' }),
      month: date.toLocaleDateString('de-CH', { month: 'long' }),
      full: date.toLocaleDateString('de-CH', { dateStyle: 'medium' }),
    }
  } catch {
    return { day: '–', month: '', full: iso }
  }
}

/**
 * Updates & Neuigkeiten direkt im rechten Chat-Hauptbereich statt als Modal — gleiches Muster wie
 * `ChatFriendsOverview`. Bewusst ohne Tabs/Card-Look: Titel oben, darunter die Posts direkt auf dem
 * Hintergrund (nur Titel, Datum, Text).
 */
export function ChatNewsOverview({ isAdmin, isCompactMobile }: ChatNewsOverviewProps) {
  const prefersReducedMotionRef = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [isOverviewEntering, setIsOverviewEntering] = useState(prefersReducedMotionRef.current)
  const [posts, setPosts] = useState<NewsPost[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingPost, setEditingPost] = useState<NewsPost | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIsOverviewEntering(true)
      return
    }
    setIsOverviewEntering(false)
    const frame = window.requestAnimationFrame(() => {
      setIsOverviewEntering(true)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

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

  useEffect(() => {
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
    return () => setNewsFeedOpen(false)
  }, [loadPosts])

  useEffect(() => {
    function onRefresh() {
      void loadPosts()
    }
    window.addEventListener(NEWS_FEED_REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(NEWS_FEED_REFRESH_EVENT, onRefresh)
  }, [loadPosts])

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

  return (
    <section
      className={`chat-news-overview${isCompactMobile ? ' is-mobile-fullscreen' : ''}${
        isOverviewEntering ? ' is-entering' : ''
      }`}
      aria-label="Updates & Neuigkeiten"
    >
      <div className="chat-news-overview-inner">
        <header className="chat-news-overview-header">
          <h2 className="chat-news-overview-title">Updates & Neuigkeiten</h2>
          {isAdmin ? (
            <PrimaryButton type="button" className="chat-news-overview-add-btn" onClick={openCreateComposer}>
              Feed posten
            </PrimaryButton>
          ) : null}
        </header>

        {/* Gleicher Tab-Look wie die Lernpfad-Reiter (`.learn-top-tabs`/`.learn-top-tab` in
            learn.css) — aktuell nur ein Jahrgang, deshalb ein einzelner, aktiver Tab. */}
        <div className="chat-news-overview-tabs">
          <button type="button" className="chat-news-overview-tab is-active" aria-current="true">
            2026
          </button>
        </div>

        <div className="chat-news-overview-body">
          {isLoading && posts.length === 0 ? <p className="chat-news-overview-empty">Lade Neuigkeiten…</p> : null}
          {error ? (
            <p className="error-text chat-news-overview-error" role="alert">
              {error}
            </p>
          ) : null}
          {!isLoading && !error && posts.length === 0 ? (
            <p className="chat-news-overview-empty">Noch keine Neuigkeiten veröffentlicht.</p>
          ) : null}

          <div className="chat-news-overview-list">
            {posts.map((post) => {
              const postDate = formatNewsDateParts(post.created_at)
              return (
                <article key={post.id} className="chat-news-overview-post">
                  <div className="chat-news-overview-post-content">
                    {post.image_url ? (
                      <div className="chat-news-overview-post-media">
                        <img src={post.image_url} alt="" loading="lazy" />
                      </div>
                    ) : null}
                    <div className="chat-news-overview-post-head">
                      <div className="chat-news-overview-post-date-badge" aria-label={postDate.full}>
                        <span className="chat-news-overview-post-date-day" aria-hidden="true">
                          {postDate.day}
                        </span>
                        <span className="chat-news-overview-post-date-month" aria-hidden="true">
                          {postDate.month}
                        </span>
                      </div>
                      <div className="chat-news-overview-post-head-copy">
                        <h3 className="chat-news-overview-post-title">{post.title}</h3>
                      </div>
                      {isAdmin ? (
                        <div className="chat-news-overview-post-admin-actions">
                          <SecondaryButton
                            type="button"
                            className="chat-news-overview-post-admin-btn"
                            disabled={deletingPostId === post.id}
                            onClick={() => openEditComposer(post)}
                          >
                            Bearbeiten
                          </SecondaryButton>
                          <button
                            type="button"
                            className="chat-news-overview-post-delete-btn"
                            disabled={deletingPostId === post.id}
                            onClick={() => void handleDeletePost(post)}
                          >
                            {deletingPostId === post.id ? 'Löschen…' : 'Löschen'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <p className="chat-news-overview-post-body">{post.body}</p>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </div>

      <NewsPostComposerModal
        variant={isCompactMobile ? 'sheet' : 'modal'}
        isOpen={composerOpen}
        editingPost={editingPost}
        onClose={closeComposer}
        onSaved={() => {
          closeComposer()
          void loadPosts()
          dispatchNewsFeedRefresh({ reason: 'manual' })
        }}
      />
    </section>
  )
}
