import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
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

/**
 * Generischer Hinweis-Toast: Icon in einem offenen Ring links, Titel + dezenter Untertitel rechts,
 * optional klickbar, mit dezentem Schliessen-Kreuz oben rechts. Nicht an ein Feature gebunden — z. B.
 * für "Problem behoben" (Feedback) gebaut, aber für jede kurze, nicht blockierende Erfolgsmeldung mit
 * optionaler Detailansicht wiederverwendbar.
 */
export type NoticeToastPayload = {
  variant: 'notice'
  icon: string
  /** Bislang nur „success" (dezentes Grün) — bei Bedarf um weitere Farbtöne erweiterbar. */
  tone?: 'success'
  title: string
  subtitle?: string
  /** Default `'top-right'` (wie die übrigen Toasts). `'top-center'` für seltene, wichtigere Hinweise. */
  position?: 'top-right' | 'top-center'
  /** Sichtbarkeitsdauer in ms vor dem automatischen Ausblenden. Default `TOAST_VISIBLE_MS`. */
  visibleMs?: number
  /** Klick auf den Toast (ausser dem Schliessen-Kreuz) — schliesst den Toast danach zusätzlich. */
  onClick?: () => void
  /** Läuft genau einmal beim Verschwinden (Timeout, Kreuz-Klick oder Klick auf den Toast). */
  onDismiss?: () => void
}

export type ToastPushPayload = string | ChatInviteToastPayload | NoticeToastPayload

type ToastItem = {
  id: string
  kind: 'default' | 'chat-invite' | 'notice'
  message: string
  invitationId?: string
  /** Nur bei chat-invite */
  inviterFirstName?: string
  inviterLastName?: string
  /** Nur bei notice */
  icon?: string
  tone?: 'success'
  title?: string
  subtitle?: string
  position?: 'top-right' | 'top-center'
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

function ToastNoticeCard({
  item,
  onDismiss,
  onActivate,
}: {
  item: ToastItem
  onDismiss: () => void
  onActivate: () => void
}) {
  return (
    <div
      className={`toast-item toast-item--notice${item.exiting ? ' toast-item--exiting' : ''}`}
      role="status"
    >
      <button type="button" className="toast-notice-close" aria-label="Meldung schließen" onClick={onDismiss}>
        <span aria-hidden="true">×</span>
      </button>
      <button type="button" className="toast-notice-row" onClick={onActivate}>
        <span className={`toast-notice-icon-wrap toast-notice-icon-wrap--${item.tone ?? 'success'}`} aria-hidden="true">
          <span className="toast-notice-icon-ring" />
          {item.icon ? <img className="toast-notice-icon-svg" src={item.icon} alt="" /> : null}
        </span>
        <span className="toast-notice-copy">
          <span className="toast-notice-title">{item.title}</span>
          {item.subtitle ? <span className="toast-notice-subtitle">{item.subtitle}</span> : null}
        </span>
      </button>
    </div>
  )
}

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
  /* onClick/onDismiss von notice-Toasts liegen bewusst nicht im `items`-State (sonst müsste der
     Exit-Ablauf sie aus einem State-Updater heraus aufrufen — verboten, Updater müssen rein bleiben).
     `dismissedIdsRef` verhindert einen doppelten `onDismiss`-Aufruf, falls z. B. Kreuz-Klick und
     Auto-Timeout knapp aufeinanderfallen. */
  const noticeHandlersRef = useRef(new Map<string, { onClick?: () => void; onDismiss?: () => void }>())
  const dismissedIdsRef = useRef(new Set<string>())

  const startExit = useCallback((id: string) => {
    if (dismissedIdsRef.current.has(id)) {
      return
    }
    dismissedIdsRef.current.add(id)
    noticeHandlersRef.current.get(id)?.onDismiss?.()
    noticeHandlersRef.current.delete(id)
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)))
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id))
      dismissedIdsRef.current.delete(id)
    }, TOAST_EXIT_ANIM_MS)
  }, [])

  const dismissAfter = useCallback(
    (id: string, ms: number = TOAST_VISIBLE_MS) => {
      window.setTimeout(() => startExit(id), ms)
    },
    [startExit],
  )

  const push = useCallback(
    (payload: ToastPushPayload) => {
      const id = crypto.randomUUID()
      if (typeof payload === 'string') {
        setItems((prev) => [...prev, { id, kind: 'default', message: payload }])
        dismissAfter(id)
        return
      }
      if (payload.variant === 'notice') {
        noticeHandlersRef.current.set(id, { onClick: payload.onClick, onDismiss: payload.onDismiss })
        setItems((prev) => [
          ...prev,
          {
            id,
            kind: 'notice',
            message: '',
            icon: payload.icon,
            tone: payload.tone,
            title: payload.title,
            subtitle: payload.subtitle,
            position: payload.position ?? 'top-right',
          },
        ])
        dismissAfter(id, payload.visibleMs)
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

  const handleNoticeActivate = useCallback(
    (id: string) => {
      noticeHandlersRef.current.get(id)?.onClick?.()
      startExit(id)
    },
    [startExit],
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

  function renderItem(t: ToastItem) {
    if (t.kind === 'notice') {
      return (
        <ToastNoticeCard
          key={t.id}
          item={t}
          onDismiss={() => startExit(t.id)}
          onActivate={() => handleNoticeActivate(t.id)}
        />
      )
    }
    if (t.kind === 'chat-invite' && t.invitationId) {
      return (
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
      )
    }
    return (
      <div key={t.id} className={`toast-item${t.exiting ? ' toast-item--exiting' : ''}`} role="status">
        {t.message}
      </div>
    )
  }

  /* Zwei getrennte Stapel statt einem: `top-center` (bislang nur die Feedback-Abschlussmeldung) steht
     eigens zentriert oben, unabhängig von der bestehenden `top-right`-Ecke der übrigen Toasts. */
  const topCenterItems = items.filter((t) => t.kind === 'notice' && t.position === 'top-center')
  const topRightItems = items.filter((t) => !(t.kind === 'notice' && t.position === 'top-center'))

  const stack = (
    <>
      <div className="toast-stack" aria-live="polite">
        {topRightItems.map(renderItem)}
      </div>
      <div className="toast-stack toast-stack--top-center" aria-live="polite">
        {topCenterItems.map(renderItem)}
      </div>
    </>
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' ? createPortal(stack, document.body) : null}
    </ToastContext.Provider>
  )
}
