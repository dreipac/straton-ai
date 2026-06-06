import { useEffect } from 'react'
import { getSupabaseClient } from '../../../integrations/supabase/client'
import { useAuth } from '../../auth/context/useAuth'
import { useToast } from '../../../components/toast/ToastProvider'
import { NEWS_FEED_REFRESH_EVENT } from '../constants/newsFeed'
import { isNewsFeedOpen } from '../newsFeedSession'

/**
 * Realtime: neuer Feed-Post → Toast (wenn Feed geschlossen) + Badge-Refresh.
 */
export function AppNewsSubscriptions() {
  const { user } = useAuth()
  const { push } = useToast()

  useEffect(() => {
    if (!user?.id) {
      return
    }

    const supabase = getSupabaseClient()
    const channel = supabase
      .channel(`app-news-posts-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'app_news_posts',
        },
        (payload) => {
          const row = payload.new as { id?: string; author_id?: string }
          if (!row?.id || row.author_id === user.id) {
            return
          }

          window.dispatchEvent(
            new CustomEvent(NEWS_FEED_REFRESH_EVENT, { detail: { reason: 'new-post' } }),
          )

          if (!isNewsFeedOpen()) {
            push('Neuer Post ist verfügbar')
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'app_news_posts',
        },
        () => {
          window.dispatchEvent(
            new CustomEvent(NEWS_FEED_REFRESH_EVENT, { detail: { reason: 'manual' } }),
          )
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'app_news_posts',
        },
        () => {
          window.dispatchEvent(
            new CustomEvent(NEWS_FEED_REFRESH_EVENT, { detail: { reason: 'manual' } }),
          )
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [push, user?.id])

  return null
}
