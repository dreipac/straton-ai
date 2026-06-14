import { useEffect, useRef, useState } from 'react'
import userAddIcon from '../../../assets/icons/userAdd.svg'
import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton'
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton'
import {
  formatFriendDisplayName,
  type IncomingFriendRequest,
  type OutgoingFriendRequest,
  type UserFriend,
} from '../services/friends.service'
import type { ChatFriendsOverviewTab } from '../types'
import { AddFriendModal } from './AddFriendModal'

type ChatFriendsOverviewProps = {
  tab: ChatFriendsOverviewTab
  friends: UserFriend[]
  incomingRequests: IncomingFriendRequest[]
  outgoingRequests: OutgoingFriendRequest[]
  incomingCount: number
  isLoading: boolean
  error: string | null
  isCompactMobile: boolean
  onTabChange: (tab: ChatFriendsOverviewTab) => void
  onSendRequest: (email: string) => Promise<void>
  onAcceptRequest: (requestId: string) => Promise<void>
  onDeclineRequest: (requestId: string) => Promise<void>
  onCancelRequest: (requestId: string) => Promise<void>
}

function FriendAvatar({
  name,
  avatarUrl,
}: {
  name: string
  avatarUrl: string | null
}) {
  if (avatarUrl) {
    return <img className="chat-friends-avatar-img" src={avatarUrl} alt="" aria-hidden="true" />
  }
  return <span className="chat-friends-avatar-fallback">{name.charAt(0).toUpperCase()}</span>
}

export function ChatFriendsOverview({
  tab,
  friends,
  incomingRequests,
  outgoingRequests,
  incomingCount,
  isLoading,
  error,
  isCompactMobile,
  onTabChange,
  onSendRequest,
  onAcceptRequest,
  onDeclineRequest,
  onCancelRequest,
}: ChatFriendsOverviewProps) {
  const prefersReducedMotionRef = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [isOverviewEntering, setIsOverviewEntering] = useState(prefersReducedMotionRef.current)
  const [addFriendOpen, setAddFriendOpen] = useState(false)
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)

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

  async function runAction(id: string, action: () => Promise<void>) {
    setActionBusyId(id)
    try {
      await action()
    } finally {
      setActionBusyId(null)
    }
  }

  return (
    <section
      className={`chat-friends-overview${isCompactMobile ? ' is-mobile-fullscreen' : ''}${
        isOverviewEntering ? ' is-entering' : ''
      }`}
      aria-label="Freunde"
    >
      <div className="chat-friends-overview-inner">
        <header className="chat-friends-overview-header">
          <div className="chat-friends-overview-title-row">
            <span className="chat-friends-overview-icon" aria-hidden="true">
              <img className="ui-icon" src={userAddIcon} alt="" />
            </span>
            <h2 className="chat-friends-overview-title">Freunde</h2>
          </div>
          <PrimaryButton
            type="button"
            className="chat-friends-overview-add-btn"
            onClick={() => setAddFriendOpen(true)}
          >
            Freund hinzufügen
          </PrimaryButton>
        </header>

        <nav className="chat-friends-overview-tabs learn-top-tabs" aria-label="Freunde Tabs">
          <button
            type="button"
            className={`learn-top-tab learn-top-tab--path${tab === 'friends' ? ' is-active' : ''}`}
            onClick={() => onTabChange('friends')}
          >
            <span className="learn-top-tab-label">Freunde</span>
          </button>
          <button
            type="button"
            className={`learn-top-tab learn-top-tab--tests${tab === 'pending' ? ' is-active' : ''}`}
            onClick={() => onTabChange('pending')}
          >
            <span className="learn-top-tab-label-row">
              <span className="learn-top-tab-label">Ausstehende Anfragen</span>
              {incomingCount > 0 ? (
                <span className="chat-friends-tab-badge" aria-label={`${incomingCount} eingehend`}>
                  {incomingCount > 9 ? '9+' : incomingCount}
                </span>
              ) : null}
            </span>
          </button>
        </nav>

        <div key={tab} className="chat-friends-overview-tab-content">
          <div className="chat-friends-overview-panel learn-tab-panel">
            {error ? <p className="error-text chat-friends-overview-error">{error}</p> : null}
            {isLoading ? <p className="chat-friends-overview-empty">Wird geladen…</p> : null}

            {!isLoading && tab === 'friends' ? (
              friends.length === 0 ? (
                <p className="chat-friends-overview-empty">
                  Noch keine Freunde. Füge jemanden per E-Mail hinzu, um Chats später einfacher zu teilen.
                </p>
              ) : (
                <ul className="chat-friends-list">
                  {friends.map((friend) => {
                    const name = formatFriendDisplayName(friend.firstName, friend.lastName)
                    return (
                      <li key={friend.friendUserId} className="chat-friends-list-item">
                        <div className="chat-friends-card">
                          <span className="chat-friends-avatar" aria-hidden="true">
                            <FriendAvatar name={name} avatarUrl={friend.avatarUrl} />
                          </span>
                          <div className="chat-friends-card-body">
                            <p className="chat-friends-card-name">{name}</p>
                            <p className="chat-friends-card-meta">Befreundet</p>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )
            ) : null}

            {!isLoading && tab === 'pending' ? (
              <>
                <section className="chat-friends-pending-section">
                  <h3 className="chat-friends-pending-heading">Eingegangen</h3>
                  {incomingRequests.length === 0 ? (
                    <p className="chat-friends-overview-empty">Keine eingehenden Anfragen.</p>
                  ) : (
                    <ul className="chat-friends-list">
                      {incomingRequests.map((request) => {
                        const name = formatFriendDisplayName(request.firstName, request.lastName)
                        const busy = actionBusyId === request.id
                        return (
                          <li key={request.id} className="chat-friends-list-item">
                            <div className="chat-friends-card chat-friends-card--pending">
                              <span className="chat-friends-avatar" aria-hidden="true">
                                <FriendAvatar name={name} avatarUrl={request.avatarUrl} />
                              </span>
                              <div className="chat-friends-card-body">
                                <p className="chat-friends-card-name">{name}</p>
                                <p className="chat-friends-card-meta">Möchte sich verbinden</p>
                              </div>
                              <div className="chat-friends-card-actions">
                                <PrimaryButton
                                  type="button"
                                  className="chat-friends-action-btn"
                                  disabled={busy}
                                  onClick={() => void runAction(request.id, () => onAcceptRequest(request.id))}
                                >
                                  Annehmen
                                </PrimaryButton>
                                <SecondaryButton
                                  type="button"
                                  className="chat-friends-action-btn"
                                  disabled={busy}
                                  onClick={() => void runAction(request.id, () => onDeclineRequest(request.id))}
                                >
                                  Ablehnen
                                </SecondaryButton>
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>

                <section className="chat-friends-pending-section">
                  <h3 className="chat-friends-pending-heading">Gesendet</h3>
                  {outgoingRequests.length === 0 ? (
                    <p className="chat-friends-overview-empty">Keine gesendeten Anfragen.</p>
                  ) : (
                    <ul className="chat-friends-list">
                      {outgoingRequests.map((request) => {
                        const name = formatFriendDisplayName(
                          request.firstName,
                          request.lastName,
                          request.inviteeEmail,
                        )
                        const busy = actionBusyId === request.id
                        return (
                          <li key={request.id} className="chat-friends-list-item">
                            <div className="chat-friends-card chat-friends-card--pending">
                              <span className="chat-friends-avatar" aria-hidden="true">
                                <FriendAvatar name={name} avatarUrl={request.avatarUrl} />
                              </span>
                              <div className="chat-friends-card-body">
                                <p className="chat-friends-card-name">{name}</p>
                                <p className="chat-friends-card-meta">Anfrage ausstehend</p>
                              </div>
                              <div className="chat-friends-card-actions">
                                <SecondaryButton
                                  type="button"
                                  className="chat-friends-action-btn"
                                  disabled={busy}
                                  onClick={() => void runAction(request.id, () => onCancelRequest(request.id))}
                                >
                                  Zurückziehen
                                </SecondaryButton>
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <AddFriendModal
        isOpen={addFriendOpen}
        onClose={() => setAddFriendOpen(false)}
        onSubmit={onSendRequest}
      />
    </section>
  )
}
