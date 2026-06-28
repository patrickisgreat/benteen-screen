// @vitest-environment nuxt
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

// A suggestion whose embedded votes include the viewer's own *soft-deleted* vote
// (hidden_at set, because they left "going"). useSuggestions must drop it so
// "did I vote" and the vote budget reflect only live votes — counts come from the
// tally, which excludes hidden votes server-side too.
const rowWithHiddenVote = {
  id: 's1',
  event_id: 'e1',
  user_id: 'author',
  tmdb_movie: { id: 1, title: 'Heat' },
  deleted: false,
  created_at: '2026-01-01T00:00:00Z',
  votes: [{ user_id: 'me', hidden_at: '2026-06-01T00:00:00Z' }]
}

const supabase = {
  from() {
    return {
      select: () => {
        const chain = {
          eq: () => chain,
          is: () => chain,
          then: (onFulfilled: (r: { data: unknown[], error: null }) => unknown) =>
            Promise.resolve({ data: [rowWithHiddenVote], error: null }).then(onFulfilled)
        }
        return chain
      }
    }
  },
  rpc: () => Promise.resolve({ data: [{ suggestion_id: 's1', votes: 0 }], error: null }),
  channel() {
    const ch = { on: () => ch, subscribe: () => ch, send: () => Promise.resolve('ok') }
    return ch
  },
  removeChannel() {}
}

mockNuxtImport('useSupabaseClient', () => () => supabase)
mockNuxtImport('useState', () => () => ref('me'))

async function loaded(suggestions: { value: { votes: unknown[] }[] }): Promise<void> {
  await vi.waitFor(() => {
    if (!suggestions.value.length) throw new Error('not loaded yet')
  })
}

describe('useSuggestions — soft-deleted (un-RSVP) votes', () => {
  it('drops the viewer’s own hidden_at vote from the votes array', async () => {
    const { suggestions } = useSuggestions(ref('e1'))
    await loaded(suggestions)
    // The only embedded vote is soft-deleted, so the live votes array is empty.
    expect(suggestions.value[0]!.votes).toHaveLength(0)
  })
})
