export const NEWS_FEED_REFRESH_EVENT = 'straton-news-feed-refresh'

export type NewsFeedRefreshDetail = {
  reason: 'new-post' | 'marked-read' | 'manual'
}

export const NEWS_IMAGE_MAX_BYTES = 3 * 1024 * 1024
export const NEWS_TITLE_MAX = 160
export const NEWS_BODY_MAX = 8000
export const NEWS_STORAGE_BUCKET = 'app-news'
