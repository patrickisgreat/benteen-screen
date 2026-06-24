import type { MaybeRefOrGetter, Ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'

/** A person currently viewing the same page. */
export interface OnlineUser {
  id: string
  name: string
  avatar: string | null
}

/**
 * Tracks who is currently on the page via Supabase Realtime Presence. Everyone who
 * joins the same `topic` channel publishes a small {id,name,avatar} payload; the
 * channel gossips joins/leaves and we expose the deduped roster — one entry per
 * user even across multiple tabs (the presence key is the user id). Nothing is
 * written to the database; presence lives only in Realtime, so it clears when the
 * tab closes. Re-keys (and re-tracks) whenever the topic changes.
 */
export function usePresence(topic: MaybeRefOrGetter<string | null | undefined>): { online: Ref<OnlineUser[]> } {
  const supabase = useSupabaseClient<Database>()
  const { account, myId } = useAuth()
  const online = ref<OnlineUser[]>([])
  let channel: RealtimeChannel | null = null

  function syncRoster(): void {
    if (!channel) return
    const state = channel.presenceState<OnlineUser>()
    const byId = new Map<string, OnlineUser>()
    for (const presences of Object.values(state)) {
      for (const p of presences) byId.set(p.id, { id: p.id, name: p.name, avatar: p.avatar })
    }
    online.value = [...byId.values()]
  }

  watch(() => toValue(topic), (t) => {
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }
    online.value = []
    const me = myId.value
    if (!t || !me) return
    channel = supabase.channel(`presence:${t}`, { config: { presence: { key: me } } })
    channel
      .on('presence', { event: 'sync' }, syncRoster)
      .on('presence', { event: 'join' }, syncRoster)
      .on('presence', { event: 'leave' }, syncRoster)
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        void channel?.track({
          id: me,
          name: account.value?.displayName ?? 'Someone',
          avatar: account.value?.avatarUrl ?? null
        })
      })
  }, { immediate: true })

  onScopeDispose(() => {
    if (channel) supabase.removeChannel(channel)
  })

  return { online }
}
