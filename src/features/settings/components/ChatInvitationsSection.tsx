import { useCallback, useEffect, useState } from 'react'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'
import {
  CHAT_THREADS_REFRESH_EVENT,
  type ChatThreadsRefreshDetail,
} from '../../chat/constants/events'
import {
  acceptChatInvitation,
  declineChatInvitation,
  listPendingInvitationsForUser,
  type ChatThreadInvitationRow,
} from '../../chat/services/chat.collaboration'

type ChatInvitationsSectionProps = {
  userId: string | undefined
}

export function ChatInvitationsSection({ userId }: ChatInvitationsSectionProps) {
  const [items, setItems] = useState<ChatThreadInvitationRow[]>([])
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
      const next = await listPendingInvitationsForUser(userId)
      setItems(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Einladungen konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleAccept(id: string) {
    setBusyId(id)
    try {
      const threadId = await acceptChatInvitation(id)
      window.dispatchEvent(
        new CustomEvent<ChatThreadsRefreshDetail>(CHAT_THREADS_REFRESH_EVENT, {
          detail: { selectThreadId: threadId },
        }),
      )
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Beitreten fehlgeschlagen.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDecline(id: string) {
    setBusyId(id)
    try {
      await declineChatInvitation(id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ablehnen fehlgeschlagen.')
    } finally {
      setBusyId(null)
    }
  }

  if (!userId) {
    return (
      <section className="chat-invitations-panel">
        <p className="general-setting-copy">
          Melde dich an, um Einladungen zu gemeinsamen Chats zu sehen.
        </p>
      </section>
    )
  }

  return (
    <section className="chat-invitations-panel">
      <div className="general-setting-copy">
        <h3>Gemeinsame Chats</h3>
        <p>
          Hier siehst du Einladungen zu Chats von anderen Nutzern. Nach dem Beitreten erscheint der Chat in
          deiner Liste und ihr könnt in Echtzeit dieselben Nachrichten nutzen.
        </p>
      </div>

      {loading ? <p className="thread-list-info">Lade Einladungen…</p> : null}
      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && items.length === 0 ? (
        <p className="thread-list-info">Keine ausstehenden Einladungen.</p>
      ) : null}

      <ul className="chat-invitations-list">
        {items.map((inv) => (
          <li key={inv.id} className="chat-invitations-row">
            <div className="chat-invitations-row-copy">
              <strong>{inv.threadTitle ?? 'Chat'}</strong>
              <span className="chat-invitations-meta">
                Eingeladen als {inv.inviteeEmail}
              </span>
            </div>
            <div className="chat-invitations-row-actions">
              <SecondaryButton
                type="button"
                disabled={busyId === inv.id}
                onClick={() => void handleDecline(inv.id)}
              >
                Ablehnen
              </SecondaryButton>
              <PrimaryButton
                type="button"
                disabled={busyId === inv.id}
                onClick={() => void handleAccept(inv.id)}
              >
                Beitreten
              </PrimaryButton>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
