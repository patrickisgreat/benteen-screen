// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

interface Row { [k: string]: unknown }
const data = {
  suggestions: [] as Row[],
  rsvps: [] as Row[],
  bring: [] as Row[],
  error: null as { message: string } | null
}

function builder(table: string) {
  const c: Record<string, unknown> = {
    select: () => c,
    eq: () => c,
    then: (resolve: (v: unknown) => void) => {
      if (table === 'suggestions') return resolve({ data: data.suggestions, error: data.error })
      if (table === 'rsvps') return resolve({ data: data.rsvps, error: null })
      if (table === 'bring_items') return resolve({ data: data.bring, error: null })
      return resolve({ data: [], error: null })
    }
  }
  return c
}

const supabase = { from: (table: string) => builder(table) }
mockNuxtImport('useSupabaseClient', () => () => supabase)

beforeEach(() => {
  data.suggestions = []
  data.rsvps = []
  data.bring = []
  data.error = null
})

describe('useEventStats', () => {
  it('aggregates suggestions, votes, rsvps and bring-list for the event', async () => {
    data.suggestions = [
      { id: 's1', event_id: 'e1', user_id: 'alice', tmdb_movie: { title: 'Heat' }, deleted: false, created_at: '2026-01-01', votes: [{ user_id: 'x' }, { user_id: 'y' }] },
      { id: 's2', event_id: 'e1', user_id: 'bob', tmdb_movie: { title: 'Casino' }, deleted: false, created_at: '2026-01-02', votes: [{ user_id: 'x' }] }
    ]
    data.rsvps = [{ status: 'going' }, { status: 'no' }]
    data.bring = [{ user_id: 'a' }, { user_id: null }]
    const { stats } = useEventStats(ref('e1'))
    await flushPromises()
    expect(stats.value).toMatchObject({
      suggestionCount: 2,
      voteCount: 3,
      submitterCount: 2,
      voterCount: 2,
      going: 1,
      declined: 1,
      bringTotal: 2,
      bringClaimed: 1
    })
    expect(stats.value?.topPicks[0]).toEqual({ title: 'Heat', votes: 2 })
  })

  it('surfaces an error and leaves stats null', async () => {
    data.error = { message: 'nope' }
    const { stats, error } = useEventStats(ref('e1'))
    await flushPromises()
    expect(error.value).toBe('nope')
    expect(stats.value).toBeNull()
  })

  it('clears stats when the event id becomes null', async () => {
    data.rsvps = [{ status: 'going' }]
    const id = ref<string | null>('e1')
    const { stats } = useEventStats(id)
    await flushPromises()
    expect(stats.value).not.toBeNull()
    id.value = null
    await flushPromises()
    expect(stats.value).toBeNull()
  })
})
