import type { MaybeRefOrGetter } from 'vue'
import type { Database } from '~/types/database.types'
import type { AdminSuggestion } from '#shared/types/suggestion'

/** A culled suggestion plus when it was cut — the admin audit trail. */
export type CulledSuggestion = AdminSuggestion & { culled_at: string }

const SELECT = `
  id, event_id, user_id, tmdb_movie, deleted, culled_at, created_at,
  author:profiles!suggestions_user_id_fkey(display_name, email),
  votes(user_id, hidden_at, voter:profiles!votes_user_id_fkey(display_name))
`

/**
 * The titles culled from an event's ballot — a read-only audit trail so an admin
 * can confirm what pruning removed (culls are permanent and otherwise vanish from
 * the dashboard). Realtime so a fresh cut shows up immediately. voteCount is the
 * live count the title had when it was cut.
 */
export function useCulledSuggestions(eventId: MaybeRefOrGetter<string | null | undefined>) {
  const supabase = useSupabaseClient<Database>()

  const { data: rows, error } = useRealtimeQuery<CulledSuggestion[]>({
    key: eventId,
    channel: 'culled-suggestions',
    tables: [{ table: 'suggestions' }],
    empty: [],
    errorFallback: 'Failed to load pruned titles',
    load: async (id) => {
      const { data, error } = await supabase
        .from('suggestions')
        .select(SELECT)
        .eq('event_id', id)
        .not('culled_at', 'is', null)
      if (error) throw error
      return ((data ?? []) as unknown as CulledSuggestion[])
        .map(s => ({ ...s, voteCount: liveVoteCount(s.votes) }))
    }
  })

  // Most recently cut first.
  const culled = computed(() => [...rows.value].sort((a, b) => b.culled_at.localeCompare(a.culled_at)))

  return { culled, error }
}
