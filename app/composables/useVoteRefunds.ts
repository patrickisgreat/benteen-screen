import type { MaybeRefOrGetter } from 'vue'
import type { Database } from '~/types/database.types'

/**
 * One-time "you've got a vote back" nudges for an event. When a movie a member
 * voted for leaves the ballot (culled, or its suggester left "going"), their vote
 * is refunded — claim_freed_votes returns the freed picks not yet acknowledged and
 * marks them seen in the same call, so each fires exactly once. Checked on load and
 * whenever the active event changes; toasts one per freed pick.
 */
export function useVoteRefunds(eventId: MaybeRefOrGetter<string | null | undefined>): void {
  const supabase = useSupabaseClient<Database>()
  const toast = useToast()

  async function check(id: string): Promise<void> {
    const { data, error } = await supabase.rpc('claim_freed_votes', { p_event_id: id })
    if (error || !data?.length) return
    for (const pick of data) {
      toast.add({
        title: 'You’ve got a vote back',
        description: `“${pick.title ?? 'A pick'}” left the running — spend your vote on another movie.`,
        icon: 'i-lucide-ticket',
        color: 'info'
      })
    }
  }

  watch(() => toValue(eventId), (id) => {
    if (id) void check(id)
  }, { immediate: true })
}
