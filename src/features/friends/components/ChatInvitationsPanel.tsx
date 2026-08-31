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

type ChatInvitationsPanelProps = {
  userId: string | undefined
}

/**
 * Einladungen zu gemeinsamen Chats — Inhalt des gleichnamigen Tabs in der Freunde-Übersicht.
 * Übernimmt die Klassen der Freunde-Panels (Überschrift, Leer-/Ladehinweise), damit der Tab sich
 * nicht von «Freunde» und «Ausstehende Anfragen» absetzt.
 */
export function ChatInvitationsPanel({ userId }: ChatInvitationsPanelProps) {
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
      <p className="chat-friends-overview-empty">
        Melde dich an, um Einladungen zu gemeinsamen Chats zu sehen.
      </p>
    )
  }

  return (
    <section className="chat-friends-pending-section">
      <h3 className="chat-friends-pending-heading">Gemeinsame Chats</h3>

      {error ? (
        <p className="error-text chat-friends-overview-error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? <p className="chat-friends-overview-empty">Wird geladen…</p> : null}
      {!loading && items.length === 0 ? (
        <p className="chat-friends-overview-empty">Keine ausstehenden Einladungen.</p>
      ) : null}

      {items.length > 0 ? (
        <ul className="chat-invitations-list chat-invitations-list--friends-tab">
          {items.map((inv) => (
            <li key={inv.id} className="chat-invitations-row">
              <div className="chat-invitations-row-copy">
                <strong>{inv.threadTitle ?? 'Chat'}</strong>
                <span className="chat-invitations-meta">Eingeladen als {inv.inviteeEmail}</span>
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
      ) : null}
    </section>
  )
}
