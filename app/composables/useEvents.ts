import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'
import type { MovieEvent } from '#shared/types/event'

/** Realtime list of all movie-night events, ordered chronologically. */
export function useEvents() {
  const supabase = useSupabaseClient<Database>()
  const events = ref<MovieEvent[]>([])
  const pending = ref(true)

  async function refresh(): Promise<void> {
    const { data } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: true })
    events.value = data ?? []
    pending.value = false
  }

  let channel: RealtimeChannel | null = null
  onMounted(() => {
    refresh()
    channel = supabase
      .channel(`events-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => refresh())
      .subscribe()
  })
  onUnmounted(() => {
    if (channel) supabase.removeChannel(channel)
  })

  return { events, pending, refresh }
}
