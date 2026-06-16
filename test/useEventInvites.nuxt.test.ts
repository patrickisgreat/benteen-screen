// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

let list: Array<Record<string, unknown>> = [] // current event's invites (refresh)
let eventsList: Array<Record<string, unknown>> = [] // other events (seed)
let poolList: Array<Record<string, unknown>> = [] // invites across other events (seed pool)
let rosterList: Array<Record<string, unknown>> = [] // allowlist roster (seed fallback)
let profilesList: Array<Record<string, unknown>> = [] // profiles (seed name enrichment)
const ops = { inserted: [] as unknown[], deleted: [] as unknown[] }

// Thenable + chainable stub mirroring the PostgREST builder. event_invites resolves
// to the seed `poolList` when filtered with .in() (the pool query) and `list`
// otherwise (the per-event refresh); events resolves to `eventsList`; invites (the
// allowlist roster, used as the seed fallback) resolves to `rosterList`.
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
      },
      in: (_col: string, vals: unknown[]) => {
        ops.deleted.push(...vals)
        return Promise.resolve({ error: null })
      }
    }),
    then: (resolve: (v: unknown) => void) => {
      const data = table === 'events'
        ? eventsList
        : table === 'event_invites'
          ? (usedIn ? poolList : list)
          : table === 'invites'
            ? rosterList
            : table === 'profiles' ? profilesList : []
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
  rosterList = []
  profilesList = []
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

  it('removeInvites deletes several ids at once', async () => {
    const { removeInvites } = useEventInvites(ref('e'))
    await flushPromises()
    await removeInvites(['a', 'b', 'c'])
    expect(ops.deleted).toEqual(expect.arrayContaining(['a', 'b', 'c']))
  })

  it('removeInvites is a no-op for an empty selection', async () => {
    const { removeInvites } = useEventInvites(ref('e'))
    await flushPromises()
    await removeInvites([])
    expect(ops.deleted).toHaveLength(0)
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

  it('seedFromLastEvent returns 0 when no prior event has a list and the roster is empty', async () => {
    eventsList = [{ id: 'prev' }]
    poolList = []
    rosterList = []
    const { seedFromLastEvent } = useEventInvites(ref('e'))
    await flushPromises()
    expect(await seedFromLastEvent()).toBe(0)
  })

  it('seedFromLastEvent falls back to the allowlist roster when no prior event has a list', async () => {
    // First-ever event: no other event has a guest list, but the household roster does.
    list = []
    eventsList = []
    poolList = []
    rosterList = [
      { email: 'mom@x', display_name: 'Mom' },
      { email: 'dad@x', display_name: 'Dad' }
    ]
    const { seedFromLastEvent } = useEventInvites(ref('e'))
    await flushPromises()
    const added = await seedFromLastEvent()
    expect(added).toBe(2)
    const emails = ops.inserted.flat().map(i => (i as { email?: string }).email)
    expect(emails).toContain('mom@x')
    expect(emails).toContain('dad@x')
  })

  it('seedFromLastEvent skips roster entries already invited to this event', async () => {
    list = [{ id: 'x', event_id: 'e', email: 'mom@x', rsvp: null, sent_at: null, opened_at: null, clicked_at: null, display_name: 'Mom', token: 't' }]
    eventsList = []
    rosterList = [{ email: 'mom@x', display_name: 'Mom' }, { email: 'dad@x', display_name: 'Dad' }]
    const { seedFromLastEvent } = useEventInvites(ref('e'))
    await flushPromises()
    const added = await seedFromLastEvent()
    expect(added).toBe(1)
    const emails = ops.inserted.flat().map(i => (i as { email?: string }).email)
    expect(emails).toContain('dad@x')
    expect(emails).not.toContain('mom@x')
  })

  it('seedFromLastEvent enriches seeded guests with profile display names', async () => {
    // The source list only has emails (no names); profiles knows them by email.
    eventsList = []
    rosterList = [{ email: 'mom@x', display_name: null }, { email: 'dad@x', display_name: null }]
    profilesList = [{ email: 'mom@x', display_name: 'Mom Bennett' }, { email: 'dad@x', display_name: 'Dad Bennett' }]
    const { seedFromLastEvent } = useEventInvites(ref('e'))
    await flushPromises()
    await seedFromLastEvent()
    const inserted = ops.inserted.flat() as Array<{ email?: string, display_name?: string | null }>
    expect(inserted.find(i => i.email === 'mom@x')?.display_name).toBe('Mom Bennett')
    expect(inserted.find(i => i.email === 'dad@x')?.display_name).toBe('Dad Bennett')
  })

  it('seedFromLastEvent keeps the source name when no profile name exists', async () => {
    eventsList = []
    rosterList = [{ email: 'guest@x', display_name: 'Guest' }]
    profilesList = [] // no profile for this email
    const { seedFromLastEvent } = useEventInvites(ref('e'))
    await flushPromises()
    await seedFromLastEvent()
    const inserted = ops.inserted.flat() as Array<{ email?: string, display_name?: string | null }>
    expect(inserted.find(i => i.email === 'guest@x')?.display_name).toBe('Guest')
  })
})
