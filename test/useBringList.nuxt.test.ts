// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

interface InsertCall { payload: Record<string, unknown> }
interface UpdateCall { payload: Record<string, unknown>, filters: Record<string, unknown> }
interface DeleteCall { filters: Record<string, unknown> }
const calls = {
  inserts: [] as InsertCall[],
  updates: [] as UpdateCall[],
  deletes: [] as DeleteCall[]
}

const filteredChain = (record: (filters: Record<string, unknown>) => void) => {
  const filters: Record<string, unknown> = {}
  const chain = {
    eq: (col: string, val: unknown) => {
      filters[col] = val
      return chain
    },
    then: (onFulfilled: (r: { error: null }) => unknown) => {
      record(filters)
      return Promise.resolve({ error: null }).then(onFulfilled)
    }
  }
  return chain
}

const supabase = {
  from() {
    return {
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [] }) }) }),
      insert: (payload: Record<string, unknown>) => {
        calls.inserts.push({ payload })
        return Promise.resolve({ error: null })
      },
      update: (payload: Record<string, unknown>) =>
        filteredChain(filters => calls.updates.push({ payload, filters })),
      delete: () => filteredChain(filters => calls.deletes.push({ filters }))
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

beforeEach(() => {
  calls.inserts = []
  calls.updates = []
  calls.deletes = []
})

describe('useBringList', () => {
  it('addItem inserts a label claimed by me, omitting created_by (the DB defaults it)', async () => {
    const { addItem } = useBringList(ref('e1'))
    await addItem('Chips')
    expect(calls.inserts).toHaveLength(1)
    expect(calls.inserts[0]!.payload).toEqual({ event_id: 'e1', label: 'Chips', note: null, user_id: 'me' })
    expect(calls.inserts[0]!.payload).not.toHaveProperty('created_by')
  })

  it('addItem can leave a slot open (unclaimed)', async () => {
    const { addItem } = useBringList(ref('e1'))
    await addItem('Drinks', undefined, false)
    expect(calls.inserts[0]!.payload).toMatchObject({ label: 'Drinks', user_id: null })
  })

  it('claim sets user_id to me on the row', async () => {
    const { claim } = useBringList(ref('e1'))
    await claim({ id: 'b1' } as never)
    expect(calls.updates[0]).toEqual({ payload: { user_id: 'me' }, filters: { id: 'b1' } })
  })

  it('unclaim clears user_id', async () => {
    const { unclaim } = useBringList(ref('e1'))
    await unclaim({ id: 'b1' } as never)
    expect(calls.updates[0]).toEqual({ payload: { user_id: null }, filters: { id: 'b1' } })
  })

  it('remove deletes the row by id', async () => {
    const { remove } = useBringList(ref('e1'))
    await remove({ id: 'b1' } as never)
    expect(calls.deletes[0]!.filters).toEqual({ id: 'b1' })
  })
})
