// @vitest-environment nuxt
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

// The privacy model: a non-admin sees only their own vote in each suggestion's
// `votes`, while the public count comes from the `suggestion_vote_counts` tally.
// This pins both: voteCount tracks the tally (not votes.length), and a vote pings
// the shared broadcast topic so other viewers re-fetch.
const sendSpy = vi.fn(() => Promise.resolve('ok'))
let lastChannelName = ''

const ownVoteRow = {
  id: 's1',
  event_id: 'e1',
  user_id: 'author',
  tmdb_movie: { id: 1, title: 'Heat' },
  deleted: false,
  created_at: '2026-01-01T00:00:00Z',
  votes: [{ user_id: 'me' }] // only MY vote is visible to me
}

const supabase = {
  from() {
    return {
      select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [ownVoteRow], error: null }) }) }),
      insert: () => Promise.resolve({ error: null }),
      delete: () => ({ eq: () => Promise.resolve({ error: null }) })
    }
  },
  // Tally reports the TRUE total (7) even though I can only see my own vote.
  rpc: () => Promise.resolve({ data: [{ suggestion_id: 's1', votes: 7 }], error: null }),
  channel(name: string) {
    lastChannelName = name
    const ch = { on: () => ch, subscribe: () => ch, send: sendSpy }
    return ch
  },
  removeChannel() {}
}

mockNuxtImport('useSupabaseClient', () => () => supabase)
mockNuxtImport('useState', () => () => ref('me'))

async function loaded(suggestions: { value: { voteCount: number, votes: unknown[] }[] }): Promise<void> {
  await vi.waitFor(() => {
    if (!suggestions.value.length) throw new Error('not loaded yet')
  })
}

describe('useSuggestions — voter privacy', () => {
  it('counts from the tally, not the viewer-visible votes array', async () => {
    const { suggestions } = useSuggestions(ref('e1'))
    await loaded(suggestions)
    // Public count is the tally's 7…
    expect(suggestions.value[0]!.voteCount).toBe(7)
    // …even though I can only read my own single vote row.
    expect(suggestions.value[0]!.votes).toHaveLength(1)
  })

  it('subscribes to the shared per-event topic for live counts', async () => {
    const { suggestions } = useSuggestions(ref('e1'))
    await loaded(suggestions)
    expect(lastChannelName).toBe('votes:e1')
  })

  it('broadcasts a change when I vote so other viewers re-fetch', async () => {
    sendSpy.mockClear()
    const { vote } = useSuggestions(ref('e1'))
    await vote({ id: 's1', votes: [] } as never)
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'broadcast', event: 'changed' }))
  })

  it('broadcasts a change when I unvote', async () => {
    sendSpy.mockClear()
    const { unvote } = useSuggestions(ref('e1'))
    await unvote({ id: 's1', votes: [{ user_id: 'me' }] } as never)
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'broadcast', event: 'changed' }))
  })
})
