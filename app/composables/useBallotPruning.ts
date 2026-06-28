import type { MaybeRefOrGetter } from 'vue'
import type { Database } from '~/types/database.types'

/**
 * Admin ballot pruning for an event. Both actions call admin-only SECURITY DEFINER
 * RPCs (the is_admin gate lives in the database — Invariant 1) and return how many
 * titles were cut. Culls are permanent; a cut title's votes are refunded to their
 * voters' budgets server-side.
 */
export function useBallotPruning(eventId: MaybeRefOrGetter<string | null | undefined>) {
  const supabase = useSupabaseClient<Database>()

  /** Cut every title with no live votes. */
  async function cullZeroVotes(): Promise<number> {
    const id = toValue(eventId)
    if (!id) return 0
    const { data, error } = await supabase.rpc('cull_zero_votes', { p_event_id: id })
    if (error) throw error
    return data ?? 0
  }

  /** Keep only the top `keep` titles by votes (ties → earliest-suggested); cut the rest. */
  async function cullToTop(keep: number): Promise<number> {
    const id = toValue(eventId)
    if (!id) return 0
    const { data, error } = await supabase.rpc('cull_to_top', { p_event_id: id, p_keep: keep })
    if (error) throw error
    return data ?? 0
  }

  return { cullZeroVotes, cullToTop }
}
