import type { MaybeRefOrGetter } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'
import type { Suggestion } from '#shared/types/suggestion'
import type { TmdbMovie } from '#shared/types/movie'

/**
 * Realtime suggestions for an event + the write actions. Votes are normalized
 * rows, so vote integrity is automatic: one row per (suggestion, user) via the
 * PK, and the count is just `votes.length`.
 */
export function useSuggestions(eventId: MaybeRefOrGetter<string | null | undefined>) {
  const supabase = useSupabaseClient<Database>()
  const myId = useState<string | null>('my-id', () => null)
  const suggestions = ref<Suggestion[]>([])

  async function refresh(): Promise<void> {
    const id = toValue(eventId)
    if (!id) {
      suggestions.value = []
      return
    }
    const { data } = await supabase
      .from('suggestions')
      .select('id, event_id, user_id, tmdb_movie, deleted, created_at, votes(user_id)')
      .eq('event_id', id)
      .eq('deleted', false)
    suggestions.value = ((data ?? []) as unknown as Suggestion[]).sort((a, b) => {
      const diff = b.votes.length - a.votes.length
      return diff !== 0 ? diff : new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })
  }

  let channel: RealtimeChannel | null = null
  watch(() => toValue(eventId), (id) => {
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }
    refresh()
    if (!id) return
    channel = supabase
      .channel(`suggestions-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suggestions', filter: `event_id=eq.${id}` }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, () => refresh())
      .subscribe()
  }, { immediate: true })
  onUnmounted(() => {
    if (channel) supabase.removeChannel(channel)
  })

  function alreadySuggested(movieId: number): boolean {
    return suggestions.value.some(s => s.tmdb_movie?.id === movieId)
  }

  // user_id is omitted on inserts — a DB trigger stamps it with auth.uid().
  async function suggest(movie: TmdbMovie): Promise<void> {
    const id = toValue(eventId)
    if (!id || !myId.value) return
    const { error } = await supabase
      .from('suggestions')
      .insert({ event_id: id, tmdb_movie: movie, deleted: false })
    if (error) throw error
    await refresh()
  }

  async function vote(suggestion: Suggestion): Promise<void> {
    if (!myId.value) return
    if (suggestion.votes.some(v => v.user_id === myId.value)) return
    const { error } = await supabase.from('votes').insert({ suggestion_id: suggestion.id })
    if (error) throw error
    await refresh()
  }

  async function unvote(suggestion: Suggestion): Promise<void> {
    if (!myId.value) return
    // No user_id filter needed — the RLS delete policy scopes this to my own vote.
    const { error } = await supabase.from('votes').delete().eq('suggestion_id', suggestion.id)
    if (error) throw error
    await refresh()
  }

  async function removeSuggestion(suggestion: Suggestion): Promise<void> {
    const { error } = await supabase.from('suggestions').delete().eq('id', suggestion.id)
    if (error) throw error
    await refresh()
  }

  return { suggestions, alreadySuggested, suggest, vote, unvote, removeSuggestion }
}
