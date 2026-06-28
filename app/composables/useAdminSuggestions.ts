import type { MaybeRefOrGetter } from 'vue'
import type { Database } from '~/types/database.types'
import type { AdminSuggestion } from '#shared/types/suggestion'

const SELECT = `
  id, event_id, user_id, tmdb_movie, deleted, created_at,
  author:profiles!suggestions_user_id_fkey(display_name, email),
  votes(user_id, hidden_at, voter:profiles!votes_user_id_fkey(display_name))
`

/**
 * Admin view of an event's suggestions — includes admin-deleted rows (for the
 * moderation toggle) but excludes rsvp-hidden ones (off the ballot, auto-restore
 * when the author returns), so admin sees the same contention set members do.
 * Joins the author + each voter's display name. Realtime keeps it live.
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
        // Off the ballot while the author isn't "going" (admin-deleted rows still load).
        .is('rsvp_hidden_at', null)
      if (error) throw error
      // Admins read every vote row (RLS); count only the live (non-soft-deleted)
      // ones so the admin count matches the public tally.
      return ((data ?? []) as unknown as AdminSuggestion[])
        .map(s => ({ ...s, voteCount: liveVoteCount(s.votes) }))
    }
  })

  // Most-voted first for display.
  const suggestions = computed(() =>
    [...rows.value].sort((a, b) => b.voteCount - a.voteCount)
  )

  async function setDeleted(id: string, deleted: boolean): Promise<void> {
    const { error } = await supabase.from('suggestions').update({ deleted }).eq('id', id)
    if (error) throw error
    await refresh()
  }

  function voterNames(suggestion: AdminSuggestion): string[] {
    // Only live voters — someone who left "going" no longer counts.
    return (suggestion.votes ?? [])
      .filter(vote => vote.hidden_at == null)
      .map(vote => vote.voter?.display_name ?? 'Unknown')
  }

  return { suggestions, error, setDeleted, voterNames }
}
