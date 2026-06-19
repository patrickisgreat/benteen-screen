import type { MaybeRefOrGetter } from 'vue'
import type { Database } from '~/types/database.types'
import type { Suggestion } from '#shared/types/suggestion'
import type { EventStats } from '#shared/utils/eventStats'

/**
 * Key participation stats for one event, for the admin events drill-down:
 * suggestions, votes, distinct submitters/voters, RSVP split, bring-list
 * progress, and the top picks. A snapshot loaded on demand — no realtime.
 */
export function useEventStats(eventId: MaybeRefOrGetter<string | null>) {
  const supabase = useSupabaseClient<Database>()

  return useOnDemandStats<EventStats>(eventId, async (id) => {
    const [suggestions, rsvps, bring] = await Promise.all([
      supabase
        .from('suggestions')
        .select('id, event_id, user_id, tmdb_movie, deleted, created_at, votes(user_id)')
        .eq('event_id', id),
      supabase.from('rsvps').select('status').eq('event_id', id),
      supabase.from('bring_items').select('user_id').eq('event_id', id)
    ])
    const firstError = suggestions.error ?? rsvps.error ?? bring.error
    if (firstError) throw firstError

    return computeEventStats({
      // The votes embed isn't declared in the generated types, so cast as
      // useSuggestions does (the inferred shape doesn't match).
      suggestions: (suggestions.data ?? []) as unknown as Suggestion[],
      rsvps: rsvps.data ?? [],
      bringItems: bring.data ?? []
    })
  })
}
