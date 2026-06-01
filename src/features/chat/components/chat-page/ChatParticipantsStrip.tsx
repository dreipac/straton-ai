import type { ChatThreadMemberPublic } from '../../services/chat.collaboration'
import {
  displayNameForMember,
  letterForMemberLabel,
  toolbarAvatarAccentForUser,
} from './chatCollaborationDisplay'

type ChatParticipantsStripProps = {
  members: ChatThreadMemberPublic[]
  extraClassName?: string
}

export function ChatParticipantsStrip({ members, extraClassName }: ChatParticipantsStripProps) {
  return (
    <div
      className={['chat-participants-strip', extraClassName].filter(Boolean).join(' ')}
      role="list"
    >
      {members.map((m) => {
        const fn = (m.firstName ?? '').trim() || '–'
        const ln = (m.lastName ?? '').trim()
        const accent = toolbarAvatarAccentForUser(m.userId)
        return (
          <div key={m.userId} className="chat-participants-card" role="listitem">
            <div
              className="chat-participants-card-avatar-wrap"
              style={{ ['--chat-toolbar-avatar-accent' as string]: accent }}
            >
              {m.avatarUrl ? (
                <img src={m.avatarUrl} alt="" className="chat-participants-card-avatar-img" />
              ) : (
                <span className="chat-participants-card-avatar-fallback" aria-hidden="true">
                  {letterForMemberLabel(displayNameForMember(m))}
                </span>
              )}
            </div>
            <span className="chat-participants-card-fn">{fn}</span>
            <span className="chat-participants-card-ln">{ln || '\u00a0'}</span>
          </div>
        )
      })}
    </div>
  )
}
