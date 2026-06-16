// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

let list: Array<Record<string, unknown>> = [] // current event's invites (refresh)
let eventsList: Array<Record<string, unknown>> = [] // other events (seed)
let poolList: Array<Record<string, unknown>> = [] // invites across other events (seed pool)
const ops = { inserted: [] as unknown[], deleted: [] as unknown[] }

// Thenable + chainable stub mirroring the PostgREST builder. event_invites resolves
// to the seed `poolList` when filtered with .in() (the pool query) and `list`
// otherwise (the per-event refresh); events resolves to `eventsList`.
function builder(table: string) {
  let usedIn = false
  const c: Record<string, unknown> = {
    select: () => c,
    eq: () => c,
    order: () => c,
    lt: () => c,
    limit: () => c,
    is: () => c,
    neq: () => c,
    in: () => {
      usedIn = true
      return c
    },
    single: () => Promise.resolve({ data: { event_date: '2026-01-01' } }),
    maybeSingle: () => Promise.resolve({ data: null }),
    insert: (v: unknown) => {
      ops.inserted.push(v)
      return Promise.resolve({ error: null })
    },
    delete: () => ({
      eq: (_col: string, val: unknown) => {
        ops.deleted.push(val)
        return Promise.resolve({ error: null })
      }
    }),
    then: (resolve: (v: unknown) => void) => {
      const data = table === 'events' ? eventsList : table === 'event_invites' ? (usedIn ? poolList : list) : []
      resolve({ data })
    }
  }
  return c
}

const supabase = {
  from: (table: string) => builder(table),
  channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
  removeChannel: () => {}
}
mockNuxtImport('useSupabaseClient', () => () => supabase)

beforeEach(() => {
  list = []
  eventsList = []
  poolList = []
  ops.inserted = []
  ops.deleted = []
})

describe('useEventInvites', () => {
  it('loads invites and computes Evite tracking stats', async () => {
    list = [
      { id: 'a', event_id: 'e', email: 'a@x', rsvp: 'going', sent_at: 't', opened_at: 't', clicked_at: null, display_name: null, token: '1' },
      { id: 'b', event_id: 'e', email: 'b@x', rsvp: null, sent_at: 't', opened_at: null, clicked_at: null, display_name: null, token: '2' }
    ]
    const { stats } = useEventInvites(ref('e'))
    await flushPromises()
    expect(stats.value.invited).toBe(2)
    expect(stats.value.going).toBe(1)
    expect(stats.value.opened).toBe(1)
    expect(stats.value.noReply).toBe(1)
  })

  it('addInvite inserts the email for the event', async () => {
    const { addInvite } = useEventInvites(ref('e'))
    await flushPromises()
    await addInvite('New@X.com', 'New')
    expect(ops.inserted.some(i => (i as { email?: string }).email === 'New@X.com')).toBe(true)
  })

  it('removeInvite deletes by id', async () => {
    const { removeInvite } = useEventInvites(ref('e'))
    await flushPromises()
    await removeInvite('a')
    expect(ops.deleted).toContain('a')
  })

  it('seedFromLastEvent pulls from the most recent other event that has a list', async () => {
    // Current event ('e') has no invites; an older event ('prev') does.
    list = []
    eventsList = [{ id: 'prev' }]
    poolList = [{ event_id: 'prev', email: 'guest@x', display_name: 'Guest' }]
    const { seedFromLastEvent } = useEventInvites(ref('e'))
    await flushPromises()
    const added = await seedFromLastEvent()
    expect(added).toBe(1)
    expect(ops.inserted.flat().some(i => (i as { email?: string }).email === 'guest@x')).toBe(true)
  })

  it('seedFromLastEvent returns 0 when no other event has a list', async () => {
    eventsList = [{ id: 'prev' }]
    poolList = []
    const { seedFromLastEvent } = useEventInvites(ref('e'))
    await flushPromises()
    expect(await seedFromLastEvent()).toBe(0)
  })
})
