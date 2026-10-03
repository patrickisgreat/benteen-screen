import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'
import type { PollBallot } from '../../shared/utils/poll'
import { buildPollEmail } from '../../shared/utils/email'
import type { AnnounceMail } from './email'

type Db = SupabaseClient<Database>

/** A guest who can be polled: their row id, address, name, and vote token. */
export interface PollGuest {
  readonly id: string
  readonly email: string
  readonly display_name: string | null
  readonly token: string
}

/** A guest's link to pick one option: opening it records (or changes) their vote. */
export function pollVoteUrl(origin: string, token: string, pollId: string, optionId: string): string {
  return `${origin}/poll?token=${token}&poll=${pollId}&option=${optionId}`
}

/** Builds each guest's own copy of a poll email — their name, their vote links. */
export function buildPollMails(opts: {
  readonly guests: readonly PollGuest[]
  readonly origin: string
  readonly pollId: string
  readonly options: readonly { id: string, label: string }[]
  readonly question: string
  readonly note: string | null
  readonly eventTitle: string
  readonly eventDate: string | null
  readonly hostName: string | null
}): AnnounceMail[] {
  return opts.guests.map((guest) => {
    const mail = buildPollEmail({
      eventTitle: opts.eventTitle,
      eventDate: opts.eventDate,
      hostName: opts.hostName,
      recipientName: guest.display_name,
      question: opts.question,
      note: opts.note,
      options: opts.options.map(o => ({ label: o.label, url: pollVoteUrl(opts.origin, guest.token, opts.pollId, o.id) }))
    })
    return { email: guest.email, inviteId: guest.id, ...mail }
  })
}

/**
 * Creates a poll and its options. Two inserts with no transaction between them,
 * so a failed options insert removes the poll again rather than leaving a
 * question with no choices.
 */
export async function createPoll(
  db: Db,
  poll: { eventId: string, question: string, options: readonly string[], createdBy: string }
): Promise<{ id: string, options: { id: string, label: string }[] }> {
  const { data: created, error } = await db
    .from('polls')
    .insert({ event_id: poll.eventId, question: poll.question, created_by: poll.createdBy })
    .select('id')
    .single()
  if (error || !created) throw new Error(`Could not create the poll: ${error?.message ?? 'no row returned'}`)

  const { data: options, error: optionsError } = await db
    .from('poll_options')
    .insert(poll.options.map((label, position) => ({ poll_id: created.id, label, position })))
    .select('id, label, position')
  if (optionsError || !options) {
    const { error: cleanupError } = await db.from('polls').delete().eq('id', created.id)
    if (cleanupError) console.error('[polls] could not remove a poll left without options -', cleanupError.message)
    throw new Error(`Could not save the poll's choices: ${optionsError?.message ?? 'no rows returned'}`)
  }
  const ordered = [...options].sort((a, b) => a.position - b.position)
  return { id: created.id, options: ordered.map(o => ({ id: o.id, label: o.label })) }
}

/** Why a vote could not be cast, mapped to an HTTP status by the route. */
export class PollVoteError extends Error {
  constructor(readonly statusCode: 400 | 404, message: string) {
    super(message)
  }
}

/**
 * Casts (or changes) one guest's vote from their email link and returns the poll
 * with their answer. The guest is whoever the token belongs to, so the vote can
 * only ever be recorded as them, and only on a poll for their own event — a
 * poll id from another event is "not found", never a hint that it exists.
 * A closed poll records nothing and reports what they had picked.
 */
export async function castPollVote(
  db: Db,
  invite: { id: string, event_id: string },
  pollId: string,
  optionId: string,
  now: Date = new Date()
): Promise<PollBallot> {
  const { data: poll, error: pollError } = await db
    .from('polls')
    .select('id, event_id, question, closed_at')
    .eq('id', pollId)
    .maybeSingle()
  if (pollError) throw new Error(pollError.message)
  if (!poll || poll.event_id !== invite.event_id) throw new PollVoteError(404, 'Poll not found')

  const { data: optionRows, error: optionsError } = await db
    .from('poll_options')
    .select('id, label, position')
    .eq('poll_id', pollId)
    .order('position')
  if (optionsError) throw new Error(optionsError.message)
  const options = (optionRows ?? []).map(o => ({ id: o.id, label: o.label }))

  if (poll.closed_at) {
    const { data: existing, error: existingError } = await db
      .from('poll_votes')
      .select('option_id')
      .eq('poll_id', pollId)
      .eq('invite_id', invite.id)
      .maybeSingle()
    if (existingError) throw new Error(existingError.message)
    return { question: poll.question, options, chosen: existing?.option_id ?? null, closed: true }
  }

  if (!options.some(o => o.id === optionId)) throw new PollVoteError(400, 'That is not one of the choices')

  const stamp = now.toISOString()
  const { error: voteError } = await db
    .from('poll_votes')
    .upsert({ poll_id: pollId, invite_id: invite.id, option_id: optionId, voted_at: stamp }, { onConflict: 'poll_id,invite_id' })
  if (voteError) throw new Error(voteError.message)

  // They followed a link from an email about this night, so they have seen it —
  // count that toward the guest row like an e-vite click. Best-effort.
  const { error: clickError } = await db.from('event_invites').update({ clicked_at: stamp }).eq('id', invite.id).is('clicked_at', null)
  if (clickError) console.warn('[polls] could not mark the guest as engaged -', clickError.message)

  return { question: poll.question, options, chosen: optionId, closed: false }
}
