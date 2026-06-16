// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

interface UpsertCall { payload: Record<string, unknown>, opts: unknown }
interface DeleteCall { filters: Record<string, unknown> }
const calls: { upserts: UpsertCall[], deletes: DeleteCall[] } = { upserts: [], deletes: [] }
let rows: { user_id: string, status: string }[] = []

// Minimal Supabase stub that records upserts/deletes and feeds refresh()/realtime.
const supabase = {
  from() {
    return {
      select: () => ({ eq: () => Promise.resolve({ data: rows }) }),
      upsert: (payload: Record<string, unknown>, opts: unknown) => {
        calls.upserts.push({ payload, opts })
        return Promise.resolve({ error: null })
      },
      delete: () => {
        const filters: Record<string, unknown> = {}
        const chain = {
          eq: (col: string, val: unknown) => {
            filters[col] = val
            return chain
          },
          then: (onFulfilled: (r: { error: null }) => unknown) => {
            calls.deletes.push({ filters })
            return Promise.resolve({ error: null }).then(onFulfilled)
          }
        }
        return chain
      }
    }
  },
  channel() {
    const ch = { on: () => ch, subscribe: () => ch }
    return ch
  },
  removeChannel() {}
}

mockNuxtImport('useSupabaseClient', () => () => supabase)
mockNuxtImport('useState', () => (key: string) => ref(key === 'my-id' ? 'me' : null))

// Flush the immediate-watch refresh (a microtask) before asserting derived state.
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve))

beforeEach(() => {
  calls.upserts = []
  calls.deletes = []
  rows = []
})

describe('useRsvp', () => {
  it('counts going/maybe/no and resolves my own status', async () => {
    rows = [{ user_id: 'me', status: 'going' }, { user_id: 'a', status: 'going' }, { user_id: 'b', status: 'maybe' }]
    const { counts, myStatus } = useRsvp(ref('e1'))
    await tick()
    expect(counts.value).toEqual({ going: 2, maybe: 1, no: 0 })
    expect(myStatus.value).toBe('going')
  })

  it('setStatus upserts the new status with the composite conflict target', async () => {
    const { setStatus } = useRsvp(ref('e1'))
    await tick()
    await setStatus('going')
    expect(calls.upserts).toHaveLength(1)
    expect(calls.upserts[0]!.payload).toMatchObject({ event_id: 'e1', user_id: 'me', status: 'going' })
    expect(calls.upserts[0]!.opts).toEqual({ onConflict: 'event_id,user_id' })
  })

  it('setStatus clears my RSVP when I tap the status I already have', async () => {
    rows = [{ user_id: 'me', status: 'going' }]
    const { setStatus } = useRsvp(ref('e1'))
    await tick()
    await setStatus('going')
    expect(calls.deletes).toHaveLength(1)
    expect(calls.deletes[0]!.filters).toEqual({ event_id: 'e1', user_id: 'me' })
    expect(calls.upserts).toHaveLength(0)
  })
})
