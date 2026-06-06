import { useCallback, useEffect, useState } from 'react'
import { NEWS_FEED_REFRESH_EVENT, type NewsFeedRefreshDetail } from '../constants/newsFeed'
import { countUnreadNewsPosts } from '../services/news.service'

export function dispatchNewsFeedRefresh(detail: NewsFeedRefreshDetail) {
  window.dispatchEvent(new CustomEvent(NEWS_FEED_REFRESH_EVENT, { detail }))
}

export function useNewsUnreadCount(enabled: boolean) {
  const [unreadCount, setUnreadCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!enabled) {
      setUnreadCount(0)
      return
    }
    try {
      const count = await countUnreadNewsPosts()
      setUnreadCount(count)
    } catch {
      /* still — Badge optional */
    }
  }, [enabled])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!enabled) {
      return
    }
    function onRefresh() {
      void refresh()
    }
    window.addEventListener(NEWS_FEED_REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(NEWS_FEED_REFRESH_EVENT, onRefresh)
  }, [enabled, refresh])

  return { unreadCount, refreshUnreadCount: refresh }
}
