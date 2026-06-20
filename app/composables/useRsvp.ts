import type { MaybeRefOrGetter } from 'vue'
import type { Database } from '~/types/database.types'
import type { RsvpStatus } from '#shared/types/rsvp'

/** RSVP state for an event: my status, live counts, and set/toggle. */
export function useRsvp(eventId: MaybeRefOrGetter<string | null | undefined>) {
  const supabase = useSupabaseClient<Database>()
  const myId = useState<string | null>('my-id', () => null)

  const { data: rsvps, error, refresh } = useRealtimeQuery<{ user_id: string, status: string }[]>({
    key: eventId,
    channel: 'rsvps',
    tables: [{ table: 'rsvps' }],
    empty: [],
    errorFallback: 'Failed to load RSVPs',
    load: async (id) => {
      const { data, error } = await supabase.from('rsvps').select('user_id, status').eq('event_id', id)
      if (error) throw error
      return data ?? []
    }
  })

  const myStatus = computed<RsvpStatus | null>(() => {
    const mine = rsvps.value.find(r => r.user_id === myId.value)
    return (mine?.status as RsvpStatus | undefined) ?? null
  })
  const counts = computed(() => ({
    going: rsvps.value.filter(r => r.status === 'going').length,
    maybe: rsvps.value.filter(r => r.status === 'maybe').length,
    no: rsvps.value.filter(r => r.status === 'no').length
  }))

  /** Set my status, or clear it if I tap the one I already have. */
  async function setStatus(status: RsvpStatus): Promise<void> {
    const id = toValue(eventId)
    if (!id || !myId.value) return
    if (myStatus.value === status) {
      const { error } = await supabase.from('rsvps').delete().eq('event_id', id).eq('user_id', myId.value)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('rsvps')
        .upsert(
          { event_id: id, user_id: myId.value, status, updated_at: new Date().toISOString() },
          { onConflict: 'event_id,user_id' }
        )
      if (error) throw error
    }
    await refresh()
  }

  return { rsvps, error, myStatus, counts, setStatus }
}
