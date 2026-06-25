import type { MaybeRefOrGetter } from 'vue'
import type { Database } from '~/types/database.types'
import { clampPlusOnes, type RsvpStatus } from '#shared/types/rsvp'

/** RSVP state for an event: my status + guest count, live counts, and set/toggle. */
export function useRsvp(eventId: MaybeRefOrGetter<string | null | undefined>) {
  const supabase = useSupabaseClient<Database>()
  const myId = useMyId()

  const { data: rsvps, error, refresh } = useRealtimeQuery<{ user_id: string, status: string, plus_ones: number }[]>({
    key: eventId,
    channel: 'rsvps',
    tables: [{ table: 'rsvps' }],
    empty: [],
    errorFallback: 'Failed to load RSVPs',
    load: async (id) => {
      const { data, error } = await supabase.from('rsvps').select('user_id, status, plus_ones').eq('event_id', id)
      if (error) throw error
      return data ?? []
    }
  })

  const mine = computed(() => rsvps.value.find(r => r.user_id === myId.value) ?? null)
  const myStatus = computed<RsvpStatus | null>(() => (mine.value?.status as RsvpStatus | undefined) ?? null)
  const myPlusOnes = computed(() => mine.value?.plus_ones ?? 0)

  const counts = computed(() => {
    const going = rsvps.value.filter(r => r.status === 'going')
    return {
      going: going.length,
      maybe: rsvps.value.filter(r => r.status === 'maybe').length,
      no: rsvps.value.filter(r => r.status === 'no').length,
      // Guests brought by those going — so the line can show the real headcount.
      guests: going.reduce((sum, r) => sum + (r.plus_ones ?? 0), 0)
    }
  })

  async function writeMine(status: RsvpStatus, plusOnes: number): Promise<void> {
    const id = toValue(eventId)
    if (!id || !myId.value) return
    // Guests only count when going.
    const guests = status === 'going' ? clampPlusOnes(plusOnes) : 0
    const { error } = await supabase
      .from('rsvps')
      .upsert(
        { event_id: id, user_id: myId.value, status, plus_ones: guests, updated_at: new Date().toISOString() },
        { onConflict: 'event_id,user_id' }
      )
    if (error) throw error
    await refresh()
  }

  /** Set my status, or clear it if I tap the one I already have. Switching to going
   *  preserves a guest count I'd already set; leaving going drops it (writeMine zeroes
   *  guests for non-going). */
  async function setStatus(status: RsvpStatus): Promise<void> {
    const id = toValue(eventId)
    if (!id || !myId.value) return
    if (myStatus.value === status) {
      const { error } = await supabase.from('rsvps').delete().eq('event_id', id).eq('user_id', myId.value)
      if (error) throw error
      await refresh()
      return
    }
    await writeMine(status, myPlusOnes.value)
  }

  /** Set how many guests I'm bringing (only meaningful while going). */
  async function setGuests(plusOnes: number): Promise<void> {
    if (myStatus.value !== 'going') return
    await writeMine('going', plusOnes)
  }

  return { rsvps, error, myStatus, myPlusOnes, counts, setStatus, setGuests }
}
