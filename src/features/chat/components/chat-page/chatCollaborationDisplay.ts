import type { ChatThreadMemberPublic } from '../../services/chat.collaboration'
import { CHAT_TOOLBAR_AVATAR_ACCENTS } from './chatPageConstants'

export function toolbarAvatarAccentForUser(userId: string): string {
  let n = 0
  for (let i = 0; i < userId.length; i++) {
    n = (n + userId.charCodeAt(i) * (i + 19)) % 2147483647
  }
  const idx = Math.abs(n) % CHAT_TOOLBAR_AVATAR_ACCENTS.length
  return CHAT_TOOLBAR_AVATAR_ACCENTS[idx]
}

export function displayNameForMember(m: ChatThreadMemberPublic): string {
  const s = [m.firstName, m.lastName].filter(Boolean).join(' ').trim()
  return s || 'Mitglied'
}

export function letterForMemberLabel(label: string): string {
  const t = label.trim()
  return t ? t[0].toUpperCase() : '?'
}
