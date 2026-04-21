import { useEffect } from 'react'
import { getSupabaseClient } from '../../../integrations/supabase/client'
import { useAuth } from '../../auth/context/useAuth'
import { useToast } from '../../../components/toast/ToastProvider'

/**
 * Zeigt eine Toast-Meldung, wenn eine neue Chat-Einladung für den aktuellen Nutzer eintrifft.
 */
export function ChatInvitationSubscriptions() {
  const { user } = useAuth()
  const { push } = useToast()

  useEffect(() => {
    if (!user?.id) {
      return
    }
    const supabase = getSupabaseClient()
    const channel = supabase
      .channel(`chat-invitations-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_thread_invitations',
          filter: `invitee_user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as { status?: string }
          if (row?.status !== 'pending') {
            return
          }
          push(
            'Einladung: Du wurdest zu einem gemeinsamen Chat eingeladen. Unter Einstellungen → Einladungen kannst du beitreten.',
          )
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user?.id, push])

  return null
}
