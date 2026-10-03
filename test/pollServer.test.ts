import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PollVoteError, buildPollMails, castPollVote, createPoll, pollVoteUrl } from '../server/utils/poll'

type Row = Record<string, unknown>
type Db = Parameters<typeof castPollVote>[0]

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('buildPollMails', () => {
  const base = {
    origin: 'https://x',
    pollId: 'poll-1',
    options: [{ id: 'opt-yes', label: 'Yes' }, { id: 'opt-no', label: 'No' }],
    question: 'Move to Saturday?',
    note: null,
    eventTitle: 'Jaws',
    eventDate: null,
    hostName: 'Pat'
  }
  const guests = [
    { id: 'inv-a', email: 'a@x.com', display_name: 'Ada Byron', token: 'tok-a' },
    { id: 'inv-b', email: 'b@x.com', display_name: null, token: 'tok-b' }
  ]

  it('gives each guest vote links carrying their own token', () => {
    const [ada, bo] = buildPollMails({ ...base, guests })
    expect(ada!.html).toContain('https://x/poll?token=tok-a&amp;poll=poll-1&amp;option=opt-yes')
    expect(ada!.html).not.toContain('tok-b')
    expect(bo!.html).toContain('https://x/poll?token=tok-b&amp;poll=poll-1&amp;option=opt-no')
  })

  it('addresses each copy to its guest and ties it to their guest row for tracking', () => {
    const mails = buildPollMails({ ...base, guests })
    expect(mails.map(m => [m.email, m.inviteId])).toEqual([['a@x.com', 'inv-a'], ['b@x.com', 'inv-b']])
    expect(mails[0]!.html).toContain('Hi Ada,')
  })

  it('builds the vote link from origin, token, poll and option', () => {
    expect(pollVoteUrl('https://x', 'tok', 'p1', 'o1')).toBe('https://x/poll?token=tok&poll=p1&option=o1')
  })
})

describe('createPoll', () => {
  function makeDb(errors: { poll?: string, options?: string } = {}) {
    const calls = { options: [] as Row[][], deleted: [] as string[] }
    const from = (table: string) => {
      if (table === 'polls') {
        return {
          insert: () => ({ select: () => ({ single: () => Promise.resolve(errors.poll ? { data: null, error: { message: errors.poll } } : { data: { id: 'poll-1' }, error: null }) }) }),
          delete: () => ({
            eq: (_column: string, id: string) => {
              calls.deleted.push(id)
              return Promise.resolve({ error: null })
            }
          })
        }
      }
      return {
        insert: (rows: Row[]) => {
          calls.options.push(rows)
          return {
            // Returned out of order on purpose: the result must follow `position`.
            select: () => Promise.resolve(errors.options
              ? { data: null, error: { message: errors.options } }
              : { data: [...rows].reverse().map(r => ({ id: `opt-${String(r.position)}`, label: r.label, position: r.position })), error: null })
          }
        }
      }
    }
    return { db: { from } as unknown as Db, calls }
  }
  const poll = { eventId: 'evt-1', question: 'Q', options: ['Yes', 'No'], createdBy: 'admin-1' }

  it('saves the choices in the order written and returns them that way', async () => {
    const { db, calls } = makeDb()
    const created = await createPoll(db, poll)
    expect(calls.options[0]).toEqual([{ poll_id: 'poll-1', label: 'Yes', position: 0 }, { poll_id: 'poll-1', label: 'No', position: 1 }])
    expect(created).toEqual({ id: 'poll-1', options: [{ id: 'opt-0', label: 'Yes' }, { id: 'opt-1', label: 'No' }] })
  })

  it('removes the poll again if its choices could not be saved', async () => {
    const { db, calls } = makeDb({ options: 'boom' })
    await expect(createPoll(db, poll)).rejects.toThrow('boom')
    expect(calls.deleted).toEqual(['poll-1'])
  })

  it('surfaces a failure to create the poll', async () => {
    await expect(createPoll(makeDb({ poll: 'denied' }).db, poll)).rejects.toThrow('denied')
  })
})

describe('castPollVote', () => {
  const invite = { id: 'inv-a', event_id: 'evt-1' }
  const now = new Date('2026-10-04T12:00:00Z')
  const options = [{ id: 'opt-yes', label: 'Yes', position: 0 }, { id: 'opt-no', label: 'No', position: 1 }]

  function makeDb(state: { poll?: Row | null, existingVote?: string | null, voteError?: string }) {
    const calls = { upserts: [] as Array<{ row: Row, opts: Row }>, clicked: [] as Row[] }
    const from = (table: string) => {
      if (table === 'polls') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: state.poll ?? null, error: null }) }) }) }
      }
      if (table === 'poll_options') {
        return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: options, error: null }) }) }) }
      }
      if (table === 'poll_votes') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: state.existingVote ? { option_id: state.existingVote } : null, error: null }) }) }) }),
          upsert: (row: Row, opts: Row) => {
            calls.upserts.push({ row, opts })
            return Promise.resolve({ error: state.voteError ? { message: state.voteError } : null })
          }
        }
      }
      // event_invites: mark the guest as engaged
      return {
        update: (patch: Row) => ({
          eq: () => ({
            is: () => {
              calls.clicked.push(patch)
              return Promise.resolve({ error: null })
            }
          })
        })
      }
    }
    return { db: { from } as unknown as Db, calls }
  }
  const openPoll = { id: 'poll-1', event_id: 'evt-1', question: 'Move to Saturday?', closed_at: null }

  it('records the vote as the token\'s guest and returns the poll with their answer', async () => {
    const { db, calls } = makeDb({ poll: openPoll })
    const ballot = await castPollVote(db, invite, 'poll-1', 'opt-yes', now)
    expect(calls.upserts).toEqual([{
      row: { poll_id: 'poll-1', invite_id: 'inv-a', option_id: 'opt-yes', voted_at: '2026-10-04T12:00:00.000Z' },
      // One row per guest per poll: a second tap changes the answer, never adds one.
      opts: { onConflict: 'poll_id,invite_id' }
    }])
    expect(ballot).toEqual({
      question: 'Move to Saturday?',
      options: [{ id: 'opt-yes', label: 'Yes' }, { id: 'opt-no', label: 'No' }],
      chosen: 'opt-yes',
      closed: false
    })
  })

  it('counts the tap as the guest having seen an email about the night', async () => {
    const { db, calls } = makeDb({ poll: openPoll })
    await castPollVote(db, invite, 'poll-1', 'opt-yes', now)
    expect(calls.clicked).toEqual([{ clicked_at: '2026-10-04T12:00:00.000Z' }])
  })

  it('treats a poll from another event as not found, and records nothing', async () => {
    const { db, calls } = makeDb({ poll: { ...openPoll, event_id: 'evt-other' } })
    await expect(castPollVote(db, invite, 'poll-1', 'opt-yes', now)).rejects.toMatchObject({ statusCode: 404 })
    expect(calls.upserts).toHaveLength(0)
  })

  it('reports a missing poll as not found', async () => {
    await expect(castPollVote(makeDb({ poll: null }).db, invite, 'nope', 'opt-yes', now)).rejects.toBeInstanceOf(PollVoteError)
  })

  it('rejects an option that is not one of the poll\'s choices', async () => {
    const { db, calls } = makeDb({ poll: openPoll })
    await expect(castPollVote(db, invite, 'poll-1', 'opt-from-another-poll', now)).rejects.toMatchObject({ statusCode: 400 })
    expect(calls.upserts).toHaveLength(0)
  })

  it('records nothing on a closed poll and reports what they had picked', async () => {
    const { db, calls } = makeDb({ poll: { ...openPoll, closed_at: '2026-10-03T00:00:00Z' }, existingVote: 'opt-no' })
    const ballot = await castPollVote(db, invite, 'poll-1', 'opt-yes', now)
    expect(calls.upserts).toHaveLength(0)
    expect(ballot).toMatchObject({ closed: true, chosen: 'opt-no' })
  })

  it('reports no answer when the poll closed before they voted', async () => {
    const { db } = makeDb({ poll: { ...openPoll, closed_at: '2026-10-03T00:00:00Z' }, existingVote: null })
    expect(await castPollVote(db, invite, 'poll-1', 'opt-yes', now)).toMatchObject({ closed: true, chosen: null })
  })

  it('surfaces a failed write instead of confirming a vote that was not saved', async () => {
    const { db } = makeDb({ poll: openPoll, voteError: 'This poll is closed' })
    await expect(castPollVote(db, invite, 'poll-1', 'opt-yes', now)).rejects.toThrow('This poll is closed')
  })
})
