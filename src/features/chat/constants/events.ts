export const CHAT_THREADS_REFRESH_EVENT = 'straton-chat-threads-refresh'

/** sessionStorage: zuletzt geöffneter Chat (über App-Neustart hinweg). */
export const CHAT_LAST_ACTIVE_THREAD_STORAGE_KEY = 'straton-chat-last-active-thread'

/** Optional: nach Refresh diesen Thread aktivieren */
export type ChatThreadsRefreshDetail = {
  selectThreadId?: string
}
