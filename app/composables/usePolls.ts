import type { MaybeRefOrGetter } from 'vue'
import type { PollOptionResult, PollRequest, PollResults } from '#shared/utils/poll'
import type { Database } from '~/types/database.types'

/** What sending a poll reports back: how many guests it reached. */
export interface PollSendResult {
  sent: number
  failed: number
  error: string | null
}

/**
 * Admin-only polls for an event, with live results. Reads go straight through
 * the admin's RLS-scoped client (the poll tables are admin-only); creating one
 * also emails the guest list, so that goes through the server route (the Resend
 * key is server-only). Votes arrive from guests' email links and stream in via
 * realtime.
 */
export function usePolls(eventId: MaybeRefOrGetter<string | null | undefined>): {
  polls: Ref<PollResults[]>
  error: Ref<string | null>
  sendPoll: (poll: PollRequest) => Promise<PollSendResult>
  closePoll: (pollId: string) => Promise<void>
  removePoll: (pollId: string) => Promise<void>
} {
  const supabase = useSupabaseClient<Database>()

  const { data: polls, error, refresh } = useRealtimeQuery<PollResults[]>({
    key: eventId,
    channel: 'polls',
    // poll_votes has no event_id column to filter on, so watch it whole.
    tables: [{ table: 'polls' }, { table: 'poll_votes', global: true }],
    empty: [],
    errorFallback: 'Failed to load polls',
    load: async (id) => {
      const { data: pollRows, error: pollsError } = await supabase
        .from('polls')
        .select('id, question, closed_at, created_at')
        .eq('event_id', id)
        .order('created_at', { ascending: false })
      if (pollsError) throw pollsError
      if (!pollRows?.length) return []
      const pollIds = pollRows.map(p => p.id)

      const [options, votes, guests] = await Promise.all([
        supabase.from('poll_options').select('id, poll_id, label, position').in('poll_id', pollIds).order('position'),
        supabase.from('poll_votes').select('poll_id, option_id, invite_id').in('poll_id', pollIds),
        supabase.from('event_invites').select('id, display_name, email').eq('event_id', id)
      ])
      if (options.error) throw options.error
      if (votes.error) throw votes.error
      if (guests.error) throw guests.error

      const guestName = new Map((guests.data ?? []).map(g => [g.id, g.display_name || g.email]))
      const votersByOption = new Map<string, string[]>()
      for (const vote of votes.data ?? []) {
        const voters = votersByOption.get(vote.option_id) ?? []
        voters.push(guestName.get(vote.invite_id) ?? 'A guest')
        votersByOption.set(vote.option_id, voters)
      }

      return pollRows.map((poll) => {
        const pollOptions: PollOptionResult[] = (options.data ?? [])
          .filter(o => o.poll_id === poll.id)
          .map((o) => {
            const voters = votersByOption.get(o.id) ?? []
            return { id: o.id, label: o.label, votes: voters.length, voters }
          })
        return {
          id: poll.id,
          question: poll.question,
          closedAt: poll.closed_at,
          createdAt: poll.created_at,
          totalVotes: pollOptions.reduce((sum, o) => sum + o.votes, 0),
          options: pollOptions
        }
      })
    }
  })

  /** Create the poll and email it to the guest list. */
  async function sendPoll(poll: PollRequest): Promise<PollSendResult> {
    const id = toValue(eventId)
    if (!id) return { sent: 0, failed: 0, error: null }
    const result = await $fetch<PollSendResult & { ok: boolean }>(`/api/events/${id}/polls`, { method: 'POST', body: poll })
    await refresh()
    return { sent: result.sent, failed: result.failed, error: result.error }
  }

  /** Stop taking votes; the results stay. */
  async function closePoll(pollId: string): Promise<void> {
    const { error: closeError } = await supabase.from('polls').update({ closed_at: new Date().toISOString() }).eq('id', pollId)
    if (closeError) throw closeError
    await refresh()
  }

  async function removePoll(pollId: string): Promise<void> {
    const { error: removeError } = await supabase.from('polls').delete().eq('id', pollId)
    if (removeError) throw removeError
    await refresh()
  }

  return { polls, error, sendPoll, closePoll, removePoll }
}
