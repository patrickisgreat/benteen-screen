// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

interface Row { [k: string]: unknown }
const data = {
  rsvps: [] as Row[],
  submissions: [] as Row[], // suggestions filtered by user_id
  votesCount: 0,
  brought: [] as Row[],
  lockedEvents: [] as Row[],
  pool: [] as Row[] // suggestions (with votes) for locked events
}

// Chainable thenable mirroring the PostgREST builder. The two suggestions reads
// are told apart by `.in()` (the locked-event pool uses .in('event_id', …); the
// user's own submissions use .eq('user_id', …)).
function builder(table: string) {
  let usedIn = false
  let isCount = false
  const c: Record<string, unknown> = {
    select: (_cols: string, opts?: { head?: boolean }) => {
      if (opts?.head) isCount = true
      return c
    },
    eq: () => c,
    in: () => {
      usedIn = true
      return c
    },
    not: () => c,
    then: (resolve: (v: unknown) => void) => {
      if (table === 'rsvps') return resolve({ data: data.rsvps, error: null })
      if (table === 'votes') return resolve({ count: isCount ? data.votesCount : null, error: null })
      if (table === 'bring_items') return resolve({ data: data.brought, error: null })
      if (table === 'events') return resolve({ data: data.lockedEvents, error: null })
      if (table === 'suggestions') return resolve({ data: usedIn ? data.pool : data.submissions, error: null })
      return resolve({ data: [], error: null })
    }
  }
  return c
}

const supabase = { from: (table: string) => builder(table) }
mockNuxtImport('useSupabaseClient', () => () => supabase)

beforeEach(() => {
  data.rsvps = []
  data.submissions = []
  data.votesCount = 0
  data.brought = []
  data.lockedEvents = []
  data.pool = []
})

describe('useUserStats', () => {
  it('aggregates a member\'s rsvps, submissions, votes and brought items', async () => {
    data.rsvps = [{ status: 'going' }, { status: 'no' }]
    data.submissions = [{ id: 's1', event_id: 'e1', tmdb_movie: { title: 'Heat' }, created_at: '2026-01-01' }]
    data.votesCount = 4
    data.brought = [{ label: 'Chips' }]
    const { stats } = useUserStats(ref('u1'))
    await flushPromises()
    expect(stats.value).toMatchObject({ going: 1, declined: 1, votesCast: 4, brought: ['Chips'] })
    expect(stats.value?.submitted).toEqual([{ id: 's1', eventId: 'e1', title: 'Heat', won: false }])
    expect(stats.value?.wins).toBe(0)
  })

  it('marks a submission a win when it is a top-2 pick in a locked event', async () => {
    data.submissions = [{ id: 's1', event_id: 'e1', tmdb_movie: { title: 'Heat' }, created_at: '2026-01-01' }]
    data.lockedEvents = [{ id: 'e1' }]
    data.pool = [
      { id: 's1', event_id: 'e1', deleted: false, created_at: '2026-01-01', tmdb_movie: { title: 'Heat' }, votes: [{ user_id: 'a' }, { user_id: 'b' }] },
      { id: 's2', event_id: 'e1', deleted: false, created_at: '2026-01-02', tmdb_movie: { title: 'Other' }, votes: [{ user_id: 'a' }] }
    ]
    const { stats } = useUserStats(ref('u1'))
    await flushPromises()
    expect(stats.value?.submitted[0]?.won).toBe(true)
    expect(stats.value?.wins).toBe(1)
  })

  it('does not count a win for an event whose voting is not locked', async () => {
    data.submissions = [{ id: 's1', event_id: 'e1', tmdb_movie: { title: 'Heat' }, created_at: '2026-01-01' }]
    data.lockedEvents = [] // e1 is still open
    const { stats } = useUserStats(ref('u1'))
    await flushPromises()
    expect(stats.value?.wins).toBe(0)
    expect(stats.value?.submitted[0]?.won).toBe(false)
  })

  it('clears stats when the target user becomes null', async () => {
    data.rsvps = [{ status: 'going' }]
    const id = ref<string | null>('u1')
    const { stats } = useUserStats(id)
    await flushPromises()
    expect(stats.value).not.toBeNull()
    id.value = null
    await flushPromises()
    expect(stats.value).toBeNull()
  })
})
