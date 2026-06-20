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
  const stats = ref<EventStats | null>(null)
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function load(id: string): Promise<void> {
    pending.value = true
    error.value = null
    try {
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
      // Drop a stale response if the selected event changed mid-flight.
      if (toValue(eventId) !== id) return

      stats.value = computeEventStats({
        // The votes embed isn't declared in the generated types, so cast as
        // useSuggestions does (the inferred shape doesn't match).
        suggestions: (suggestions.data ?? []) as unknown as Suggestion[],
        rsvps: rsvps.data ?? [],
        bringItems: bring.data ?? []
      })
    } catch (e) {
      error.value = errorMessage(e, 'Failed to load stats')
      stats.value = null
    } finally {
      pending.value = false
    }
  }

  watch(() => toValue(eventId), (id) => {
    if (!id) {
      stats.value = null
      return
    }
    void load(id)
  }, { immediate: true })

  return { stats, pending, error }
}
