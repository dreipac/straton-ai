import { useCallback, useEffect, useState } from 'react'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import {
  CHAT_THREADS_REFRESH_EVENT,
  type ChatThreadsRefreshDetail,
} from '../../chat/constants/events'
import type { ChatThread } from '../../chat/types'
import {
  deleteChatThread,
  listArchivedChatThreads,
  unarchiveChatThread,
} from '../../chat/services/chat.persistence'

type ArchivedChatsSettingsSectionProps = {
  userId: string | undefined
}

function formatArchivedDate(iso: string | null | undefined): string {
  if (!iso) {
    return ''
  }
  try {
    return new Intl.DateTimeFormat('de-CH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function ArchivedChatsSettingsSection({ userId }: ArchivedChatsSettingsSectionProps) {
  const [items, setItems] = useState<ChatThread[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!userId) {
      setItems([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const next = await listArchivedChatThreads(userId)
      setItems(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archivierte Chats konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleRestore(threadId: string) {
    setBusyId(threadId)
    try {
      await unarchiveChatThread(threadId)
      window.dispatchEvent(
        new CustomEvent<ChatThreadsRefreshDetail>(CHAT_THREADS_REFRESH_EVENT, {
          detail: { selectThreadId: threadId },
        }),
      )
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wiederherstellen fehlgeschlagen.')
    } finally {
      setBusyId(null)
    }
  }

  async function handlePermanentDelete(threadId: string) {
    setBusyId(threadId)
    try {
      await deleteChatThread(threadId)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.')
    } finally {
      setBusyId(null)
    }
  }

  if (!userId) {
    return (
      <section className="chat-invitations-panel">
        <p className="general-setting-copy">
          Melde dich an, um archivierte Chats zu verwalten.
        </p>
      </section>
    )
  }

  return (
    <section className="chat-invitations-panel">
      <div className="general-setting-copy">
        <h3>Archivierte Chats</h3>
        <p>
          Chats, die du aus der Sidebar archiviert hast, erscheinen hier. Du kannst sie wiederherstellen
          oder endgültig löschen.
        </p>
      </div>

      {loading ? <p className="thread-list-info">Lade Archiv…</p> : null}
      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && items.length === 0 ? (
        <p className="thread-list-info">Keine archivierten Chats.</p>
      ) : null}

      <ul className="chat-invitations-list">
        {items.map((thread) => (
          <li key={thread.id} className="chat-invitations-row">
            <div className="chat-invitations-row-copy">
              <strong>{thread.title || 'Chat'}</strong>
              {thread.archivedAt ? (
                <span className="chat-invitations-meta">
                  Archiviert am {formatArchivedDate(thread.archivedAt)}
                </span>
              ) : null}
            </div>
            <div className="chat-invitations-row-actions">
              <SecondaryButton
                type="button"
                disabled={busyId === thread.id}
                onClick={() => void handlePermanentDelete(thread.id)}
              >
                Endgültig löschen
              </SecondaryButton>
              <PrimaryButton
                type="button"
                disabled={busyId === thread.id}
                onClick={() => void handleRestore(thread.id)}
              >
                Wiederherstellen
              </PrimaryButton>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
