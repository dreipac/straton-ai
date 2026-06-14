import { useCallback, useEffect, useState } from 'react'
import { getSupabaseClient } from '../../../integrations/supabase/client'
import {
  acceptFriendRequest,
  cancelFriendRequest,
  countIncomingFriendRequests,
  declineFriendRequest,
  listIncomingFriendRequests,
  listOutgoingFriendRequests,
  listUserFriends,
  sendFriendRequest,
  type IncomingFriendRequest,
  type OutgoingFriendRequest,
  type UserFriend,
} from '../services/friends.service'

export function useFriends(userId: string | undefined) {
  const [friends, setFriends] = useState<UserFriend[]>([])
  const [incomingRequests, setIncomingRequests] = useState<IncomingFriendRequest[]>([])
  const [outgoingRequests, setOutgoingRequests] = useState<OutgoingFriendRequest[]>([])
  const [incomingCount, setIncomingCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!userId) {
      setFriends([])
      setIncomingRequests([])
      setOutgoingRequests([])
      setIncomingCount(0)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const [friendsList, incoming, outgoing, count] = await Promise.all([
        listUserFriends(),
        listIncomingFriendRequests(),
        listOutgoingFriendRequests(),
        countIncomingFriendRequests(),
      ])
      setFriends(friendsList)
      setIncomingRequests(incoming)
      setOutgoingRequests(outgoing)
      setIncomingCount(count)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Freunde konnten nicht geladen werden.')
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!userId) {
      return
    }
    const supabase = getSupabaseClient()
    const channel = supabase
      .channel(`user-friend-requests:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_friend_requests',
          filter: `addressee_id=eq.${userId}`,
        },
        () => {
          void refresh()
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_friend_requests',
          filter: `requester_id=eq.${userId}`,
        },
        () => {
          void refresh()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [refresh, userId])

  const sendRequest = useCallback(
    async (email: string) => {
      await sendFriendRequest(email)
      await refresh()
    },
    [refresh],
  )

  const acceptRequest = useCallback(
    async (requestId: string) => {
      await acceptFriendRequest(requestId)
      await refresh()
    },
    [refresh],
  )

  const declineRequest = useCallback(
    async (requestId: string) => {
      await declineFriendRequest(requestId)
      await refresh()
    },
    [refresh],
  )

  const cancelRequest = useCallback(
    async (requestId: string) => {
      await cancelFriendRequest(requestId)
      await refresh()
    },
    [refresh],
  )

  return {
    friends,
    incomingRequests,
    outgoingRequests,
    incomingCount,
    isLoading,
    error,
    refresh,
    sendRequest,
    acceptRequest,
    declineRequest,
    cancelRequest,
  }
}
