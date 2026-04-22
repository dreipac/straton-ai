import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import { createPortal } from 'react-dom'
import inviteIcon from '../../assets/icons/invite.svg'
import {
  CHAT_THREADS_REFRESH_EVENT,
  type ChatThreadsRefreshDetail,
} from '../../features/chat/constants/events'
import { acceptChatInvitation } from '../../features/chat/services/chat.collaboration'

export type ChatInviteToastPayload = {
  variant: 'chat-invite'
  invitationId: string
  /** Vor- und Nachname der einladenden Person (profiles.first_name / last_name) */
  inviterFirstName: string
  inviterLastName: string
}

export type ToastPushPayload = string | ChatInviteToastPayload

type ToastItem = {
  id: string
  kind: 'default' | 'chat-invite'
  message: string
  invitationId?: string
  /** Nur bei chat-invite */
  inviterFirstName?: string
  inviterLastName?: string
  /** Ausblend-Animation läuft, danach wird entfernt */
  exiting?: boolean
}

/** Sichtbarkeit bevor Ausblend-Animation (mobil: nach unten + Fade) */
const TOAST_VISIBLE_MS = 5000
/** Dauer der Ausblend-Animation bis DOM-Entfernen */
const TOAST_EXIT_ANIM_MS = 400

type ToastApi = {
  push: (payload: ToastPushPayload) => void
}

const ToastContext = createContext<ToastApi | null>(null)

type ToastInviteCardProps = {
  toastId: string
  invitationId: string
  firstName: string
  lastName: string
  accepting: boolean
  exiting?: boolean
  onAccept: (toastId: string, invitationId: string) => void | Promise<void>
}

function ToastInviteCard({
  toastId,
  invitationId,
  firstName,
  lastName,
  accepting,
  exiting,
  onAccept,
}: ToastInviteCardProps) {
  const fn = firstName.trim()
  const ln = lastName.trim()
  const hasAny = Boolean(fn || ln)

  const announce = hasAny ? `${fn}${fn && ln ? ' ' : ''}${ln}` : 'Unbekannt'

  return (
    <div
      className={`toast-item toast-item--invite${exiting ? ' toast-item--exiting' : ''}`}
      role="status"
      aria-label={`Chat Einladung von ${announce}`}
    >
      <div className="toast-invite-visual-row">
        <div className="toast-invite-icon-wrap" aria-hidden="true">
          <img src={inviteIcon} alt="" className="toast-invite-icon-svg" />
        </div>
        <div className="toast-invite-copy">
          <p className="toast-invite-title">Chat Einladung</p>
          <p className="toast-invite-from">
            Von{' '}
            {!hasAny ? (
              <strong>Unbekannt</strong>
            ) : (
              <strong className="toast-invite-names">
                {fn ? <span className="toast-invite-fn">{fn}</span> : null}
                {fn && ln ? ' ' : null}
                {ln ? <span className="toast-invite-ln">{ln}</span> : null}
              </strong>
            )}
          </p>
        </div>
        <div className="toast-invite-visual-actions">
          <button
            type="button"
            className="ui-button ui-button-primary toast-invite-accept"
            disabled={accepting}
            aria-busy={accepting}
            onClick={() => void onAccept(toastId, invitationId)}
          >
            {accepting ? 'Wird beigetreten…' : 'Annehmen'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast muss innerhalb von ToastProvider verwendet werden.')
  }
  return ctx
}

export function ToastProvider({ children }: PropsWithChildren) {
  const [items, setItems] = useState<ToastItem[]>([])
  const [acceptingInvitationId, setAcceptingInvitationId] = useState<string | null>(null)

  const dismissAfter = useCallback((id: string, ms: number = TOAST_VISIBLE_MS) => {
    window.setTimeout(() => {
      setItems((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)))
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id))
      }, TOAST_EXIT_ANIM_MS)
    }, ms)
  }, [])

  const push = useCallback(
    (payload: ToastPushPayload) => {
      const id = crypto.randomUUID()
      if (typeof payload === 'string') {
        setItems((prev) => [...prev, { id, kind: 'default', message: payload }])
        dismissAfter(id)
        return
      }
      setItems((prev) => [
        ...prev,
        {
          id,
          kind: 'chat-invite',
          message: '',
          invitationId: payload.invitationId,
          inviterFirstName: payload.inviterFirstName,
          inviterLastName: payload.inviterLastName,
        },
      ])
      dismissAfter(id)
    },
    [dismissAfter],
  )

  const handleInviteAccept = useCallback(
    async (toastId: string, invitationId: string) => {
      setAcceptingInvitationId(invitationId)
      try {
        const threadId = await acceptChatInvitation(invitationId)
        setItems((prev) => prev.filter((t) => t.id !== toastId))
        const okId = crypto.randomUUID()
        setItems((prev) => [...prev, { id: okId, kind: 'default', message: 'Einladung angenommen.' }])
        dismissAfter(okId)
        window.location.hash = '#/chat'
        window.setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent<ChatThreadsRefreshDetail>(CHAT_THREADS_REFRESH_EVENT, {
              detail: { selectThreadId: threadId },
            }),
          )
        }, 80)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Beitreten fehlgeschlagen.'
        const errId = crypto.randomUUID()
        setItems((prev) => [...prev, { id: errId, kind: 'default', message: msg }])
        dismissAfter(errId)
      } finally {
        setAcceptingInvitationId(null)
      }
    },
    [dismissAfter],
  )

  const value = useMemo(() => ({ push }), [push])

  const stack = (
    <div className="toast-stack" aria-live="polite">
      {items.map((t) =>
        t.kind === 'chat-invite' && t.invitationId ? (
          <ToastInviteCard
            key={t.id}
            invitationId={t.invitationId}
            toastId={t.id}
            firstName={t.inviterFirstName ?? ''}
            lastName={t.inviterLastName ?? ''}
            accepting={acceptingInvitationId === t.invitationId}
            exiting={t.exiting}
            onAccept={handleInviteAccept}
          />
        ) : (
          <div key={t.id} className={`toast-item${t.exiting ? ' toast-item--exiting' : ''}`} role="status">
            {t.message}
          </div>
        ),
      )}
    </div>
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' ? createPortal(stack, document.body) : null}
    </ToastContext.Provider>
  )
}
