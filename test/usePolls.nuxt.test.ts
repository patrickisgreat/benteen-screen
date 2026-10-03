// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import type { PollResults } from '../shared/utils/poll'
import { fakeApi } from './utils/fakeApi'

type Row = Record<string, unknown>

let pollRows: Row[] = []
let optionRows: Row[] = []
let voteRows: Row[] = []
let guestRows: Row[] = []
const writes = { updates: [] as Array<{ patch: Row, id: string }>, deletes: [] as string[] }

const api = fakeApi(['/api/events/e1/polls'], () => ({ ok: true, pollId: 'p-new', sent: 3, failed: 0, error: null }))

const supabase = {
  from(table: string) {
    if (table === 'polls') {
      return {
        select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: pollRows, error: null }) }) }),
        update: (patch: Row) => ({
          eq: (_column: string, id: string) => {
            writes.updates.push({ patch, id })
            return Promise.resolve({ error: null })
          }
        }),
        delete: () => ({
          eq: (_column: string, id: string) => {
            writes.deletes.push(id)
            return Promise.resolve({ error: null })
          }
        })
      }
    }
    if (table === 'poll_options') {
      return { select: () => ({ in: () => ({ order: () => Promise.resolve({ data: optionRows, error: null }) }) }) }
    }
    if (table === 'poll_votes') {
      return { select: () => ({ in: () => Promise.resolve({ data: voteRows, error: null }) }) }
    }
    // event_invites
    return { select: () => ({ eq: () => Promise.resolve({ data: guestRows, error: null }) }) }
  },
  channel() {
    const ch = { on: () => ch, subscribe: () => ch }
    return ch
  },
  removeChannel() {}
}

mockNuxtImport('useSupabaseClient', () => () => supabase)

async function settle(polls: { value: PollResults[] }): Promise<void> {
  await vi.waitFor(() => {
    if (pollRows.length > 0 && polls.value.length === 0) throw new Error('not loaded')
  })
  await nextTick()
}

beforeEach(() => {
  api.reset()
  writes.updates.length = 0
  writes.deletes.length = 0
  pollRows = [{ id: 'p1', question: 'Move to Saturday?', closed_at: null, created_at: '2026-10-04T00:00:00Z' }]
  optionRows = [
    { id: 'yes', poll_id: 'p1', label: 'Yes', position: 0 },
    { id: 'no', poll_id: 'p1', label: 'No', position: 1 }
  ]
  voteRows = [
    { poll_id: 'p1', option_id: 'yes', invite_id: 'inv-a' },
    { poll_id: 'p1', option_id: 'yes', invite_id: 'inv-b' },
    { poll_id: 'p1', option_id: 'no', invite_id: 'inv-gone' }
  ]
  guestRows = [
    { id: 'inv-a', display_name: 'Ada', email: 'ada@x.com' },
    { id: 'inv-b', display_name: null, email: 'bo@x.com' }
  ]
})

describe('usePolls', () => {
  it('tallies each choice with who picked it, naming guests by name or email', async () => {
    const { polls } = usePolls(ref('e1'))
    await settle(polls)
    expect(polls.value).toEqual([{
      id: 'p1',
      question: 'Move to Saturday?',
      closedAt: null,
      createdAt: '2026-10-04T00:00:00Z',
      totalVotes: 3,
      options: [
        { id: 'yes', label: 'Yes', votes: 2, voters: ['Ada', 'bo@x.com'] },
        // A voter whose guest row can't be resolved still counts.
        { id: 'no', label: 'No', votes: 1, voters: ['A guest'] }
      ]
    }])
  })

  it('shows a poll nobody has answered yet with zero counts', async () => {
    voteRows = []
    const { polls } = usePolls(ref('e1'))
    await settle(polls)
    expect(polls.value[0]).toMatchObject({ totalVotes: 0, options: [{ votes: 0, voters: [] }, { votes: 0, voters: [] }] })
  })

  it('is empty for an event with no polls', async () => {
    pollRows = []
    const { polls, error } = usePolls(ref('e1'))
    await nextTick()
    expect(polls.value).toEqual([])
    expect(error.value).toBeNull()
  })

  it('sendPoll posts the poll to the server route and reports how many it reached', async () => {
    const { polls, sendPoll } = usePolls(ref('e1'))
    await settle(polls)
    const result = await sendPoll({ question: 'Q', options: ['a', 'b'], note: null })
    expect(api.calls[0]).toMatchObject({ url: '/api/events/e1/polls', method: 'POST', body: { question: 'Q', options: ['a', 'b'], note: null } })
    expect(result).toEqual({ sent: 3, failed: 0, error: null })
  })

  it('sendPoll does nothing without a selected event', async () => {
    const { sendPoll } = usePolls(ref(null))
    expect(await sendPoll({ question: 'Q', options: ['a', 'b'], note: null })).toEqual({ sent: 0, failed: 0, error: null })
    expect(api.calls).toHaveLength(0)
  })

  it('closePoll stamps closed_at on that poll; removePoll deletes it', async () => {
    const { polls, closePoll, removePoll } = usePolls(ref('e1'))
    await settle(polls)
    await closePoll('p1')
    expect(writes.updates).toEqual([{ patch: { closed_at: expect.any(String) }, id: 'p1' }])
    await removePoll('p1')
    expect(writes.deletes).toEqual(['p1'])
  })
})
