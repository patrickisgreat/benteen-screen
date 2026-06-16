// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

let list: Array<Record<string, unknown>> = []
const ops = { inserted: [] as unknown[], deleted: [] as unknown[] }

// Thenable + chainable stub mirroring the PostgREST builder: awaiting the chain
// resolves to { data: list }; terminal single()/maybeSingle() resolve explicitly.
function builder(table: string) {
  const c: Record<string, unknown> = {
    select: () => c,
    eq: () => c,
    order: () => c,
    lt: () => c,
    limit: () => c,
    is: () => c,
    single: () => Promise.resolve({ data: { event_date: '2026-01-01' } }),
    maybeSingle: () => Promise.resolve({ data: null }),
    insert: (v: unknown) => { ops.inserted.push(v); return Promise.resolve({ error: null }) },
    delete: () => ({ eq: (_col: string, val: unknown) => { ops.deleted.push(val); return Promise.resolve({ error: null }) } }),
    then: (resolve: (v: unknown) => void) => resolve({ data: table === 'event_invites' ? list : [] })
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
})
