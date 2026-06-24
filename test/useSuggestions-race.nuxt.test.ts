// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

// Deferred read responses keyed by event id, so we can resolve them out of order.
const resolvers: Record<string, (rows: unknown[]) => void> = {}

const supabase = {
  from() {
    let eventId = ''
    const chain = {
      select: () => chain,
      eq: (col: string, val: string) => {
        if (col === 'event_id') eventId = val
        return chain
      },
      // `await`-ing the query registers a resolver for its event id.
      then: (onFulfilled: (r: { data: unknown[] }) => unknown) =>
        new Promise<{ data: unknown[] }>((resolve) => {
          resolvers[eventId] = rows => resolve({ data: rows })
        }).then(onFulfilled)
    }
    return chain
  },
  // Tally resolves immediately; the suggestions select (above) gates the race.
  rpc: () => Promise.resolve({ data: [], error: null }),
  channel() {
    const ch = { on: () => ch, subscribe: () => ch, send: () => Promise.resolve('ok') }
    return ch
  },
  removeChannel() {}
}

mockNuxtImport('useSupabaseClient', () => () => supabase)
mockNuxtImport('useState', () => () => ref('me'))

const row = (id: string, eventId: string) => ({
  id,
  event_id: eventId,
  user_id: 'u',
  deleted: false,
  created_at: '2026-01-01T00:00:00Z',
  tmdb_movie: { id: 1, title: id },
  votes: []
})

describe('useSuggestions stale-response guard', () => {
  it('keeps the newly-selected event when an older request resolves last', async () => {
    const eventId = ref('A')
    const { suggestions } = useSuggestions(eventId) // immediate watcher → refresh('A') in flight
    await nextTick()
    eventId.value = 'B' // → refresh('B') in flight
    await nextTick()

    // 'B' resolves first, then the stale 'A' — 'A' must not overwrite 'B'.
    resolvers.B?.([row('s-b', 'B')])
    resolvers.A?.([row('s-a', 'A')])
    await new Promise(resolve => setTimeout(resolve))

    expect(suggestions.value.map(s => s.id)).toEqual(['s-b'])
  })
})
