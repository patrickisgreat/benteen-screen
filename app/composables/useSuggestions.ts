import type { MaybeRefOrGetter } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'
import type { Suggestion } from '#shared/types/suggestion'
import type { TmdbMovie } from '#shared/types/movie'

// Rows as they come back from the suggestions query: votes carry `hidden_at` so we
// can drop the viewer's own soft-deleted (un-RSVP'd) votes before exposing them; the
// public count is merged in from the tally RPC below.
type RawVoteRow = { user_id: string, hidden_at: string | null }
type RawSuggestionRow = Omit<Suggestion, 'voteCount' | 'votes'> & { votes: RawVoteRow[] }

/**
 * Realtime suggestions for an event + the write actions. Vote *counts* come from
 * the `suggestion_vote_counts` tally (so non-admins never read who voted — see the
 * voter-privacy migration), while each suggestion's `votes` array carries only the
 * viewer's own vote, enough to answer "did I vote". Because the per-vote realtime
 * stream is no longer visible across users, live counts ride a lightweight broadcast
 * on a shared per-event topic: whoever votes pings it, everyone re-fetches the tally.
 */
export function useSuggestions(eventId: MaybeRefOrGetter<string | null | undefined>) {
  const supabase = useSupabaseClient<Database>()
  const myId = useMyId()

  const { data: suggestions, error, refresh } = useRealtimeQuery<Suggestion[]>({
    key: eventId,
    channel: 'suggestions',
    tables: [{ table: 'suggestions' }],
    empty: [],
    errorFallback: 'Failed to load suggestions',
    load: async (id) => {
      const [rows, counts] = await Promise.all([
        supabase
          .from('suggestions')
          .select('id, event_id, user_id, tmdb_movie, deleted, created_at, votes(user_id, hidden_at)')
          .eq('event_id', id)
          .eq('deleted', false)
          // Hidden because the author left "going" — off the ballot until they return.
          .is('rsvp_hidden_at', null),
        supabase.rpc('suggestion_vote_counts', { p_event_id: id })
      ])
      if (rows.error) throw rows.error
      if (counts.error) throw counts.error
      const countById = new Map((counts.data ?? []).map(c => [c.suggestion_id, Number(c.votes)]))
      return ((rows.data ?? []) as unknown as RawSuggestionRow[])
        .map(s => ({
          ...s,
          // Drop the viewer's own soft-deleted votes so "did I vote" and my budget
          // reflect live votes only (counts come from the tally, which also excludes them).
          votes: (s.votes ?? []).filter(v => v.hidden_at == null).map(v => ({ user_id: v.user_id })),
          voteCount: countById.get(s.id) ?? 0
        }))
        .sort((a, b) => {
          const diff = b.voteCount - a.voteCount
          return diff !== 0 ? diff : new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        })
    }
  })

  // Shared per-event topic so every viewer re-fetches the tally when anyone votes.
  // (Counts are derived server-side; the payload carries nothing sensitive.)
  let voteChannel: RealtimeChannel | null = null
  watch(() => toValue(eventId), (id) => {
    if (voteChannel) {
      supabase.removeChannel(voteChannel)
      voteChannel = null
    }
    if (!id) return
    voteChannel = supabase
      .channel(`votes:${id}`)
      .on('broadcast', { event: 'changed' }, () => void refresh())
      .subscribe()
  }, { immediate: true })
  onScopeDispose(() => {
    if (voteChannel) supabase.removeChannel(voteChannel)
  })

  function notifyVoteChange(): void {
    void voteChannel?.send({ type: 'broadcast', event: 'changed', payload: {} })
  }

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
    notifyVoteChange()
  }

  async function unvote(suggestion: Suggestion): Promise<void> {
    if (!myId.value) return
    // No user_id filter needed — the RLS delete policy scopes this to my own vote.
    const { error } = await supabase.from('votes').delete().eq('suggestion_id', suggestion.id)
    if (error) throw error
    await refresh()
    notifyVoteChange()
  }

  async function removeSuggestion(suggestion: Suggestion): Promise<void> {
    const { error } = await supabase.from('suggestions').delete().eq('id', suggestion.id)
    if (error) throw error
    await refresh()
  }

  return { suggestions, error, refresh, alreadySuggested, suggest, vote, unvote, removeSuggestion }
}
