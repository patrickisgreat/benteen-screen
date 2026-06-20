import type { MaybeRefOrGetter } from 'vue'
import type { Database } from '~/types/database.types'
import type { AdminSuggestion } from '#shared/types/suggestion'

const SELECT = `
  id, event_id, user_id, tmdb_movie, deleted, created_at,
  author:profiles!suggestions_user_id_fkey(display_name, email),
  votes(user_id, voter:profiles!votes_user_id_fkey(display_name))
`

/**
 * Admin view of an event's suggestions — includes soft-deleted rows, and joins
 * the author + each voter's display name. Realtime keeps it live.
 */
export function useAdminSuggestions(eventId: MaybeRefOrGetter<string | null | undefined>) {
  const supabase = useSupabaseClient<Database>()

  const { data: rows, error, refresh } = useRealtimeQuery<AdminSuggestion[]>({
    key: eventId,
    channel: 'admin-suggestions',
    tables: [{ table: 'suggestions' }, { table: 'votes', global: true }],
    empty: [],
    errorFallback: 'Failed to load suggestions',
    load: async (id) => {
      const { data, error } = await supabase
        .from('suggestions')
        .select(SELECT)
        .eq('event_id', id)
      if (error) throw error
      return (data ?? []) as unknown as AdminSuggestion[]
    }
  })

  // Most-voted first for display.
  const suggestions = computed(() =>
    [...rows.value].sort((a, b) => (b.votes?.length ?? 0) - (a.votes?.length ?? 0))
  )

  async function setDeleted(id: string, deleted: boolean): Promise<void> {
    const { error } = await supabase.from('suggestions').update({ deleted }).eq('id', id)
    if (error) throw error
    await refresh()
  }

  function voterNames(suggestion: AdminSuggestion): string[] {
    return (suggestion.votes ?? []).map(vote => vote.voter?.display_name ?? 'Unknown')
  }

  return { suggestions, error, setDeleted, voterNames }
}
