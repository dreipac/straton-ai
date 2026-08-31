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
          const row = payload.new as { id?: string; status?: string; inviter_id?: string }
          if (row?.status !== 'pending' || row.id === undefined || row.id === '') {
            return
          }
          const invitationId = row.id
          void (async () => {
            let inviterFirstName = ''
            let inviterLastName = ''
            if (row.inviter_id) {
              const { data, error } = await supabase
                .from('profiles')
                .select('first_name, last_name')
                .eq('id', row.inviter_id)
                .maybeSingle()
              if (!error && data) {
                inviterFirstName = data.first_name?.trim() ?? ''
                inviterLastName = data.last_name?.trim() ?? ''
              }
            }
            push({
              variant: 'chat-invite',
              invitationId,
              inviterFirstName,
              inviterLastName,
            })
          })()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user?.id, push])

  return null
}
