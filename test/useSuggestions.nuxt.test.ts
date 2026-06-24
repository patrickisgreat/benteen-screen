// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

interface InsertCall { table: string, payload: Record<string, unknown> }
interface DeleteCall { table: string, filters: Record<string, unknown> }
const calls: { inserts: InsertCall[], deletes: DeleteCall[] } = { inserts: [], deletes: [] }

// Minimal Supabase stub that records inserts/deletes and satisfies refresh()+realtime.
const supabase = {
  from(table: string) {
    return {
      insert: (payload: Record<string, unknown>) => {
        calls.inserts.push({ table, payload })
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
            calls.deletes.push({ table, filters })
            return Promise.resolve({ error: null }).then(onFulfilled)
          }
        }
        return chain
      },
      select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [] }) }) })
    }
  },
  rpc: () => Promise.resolve({ data: [], error: null }),
  channel() {
    const ch = { on: () => ch, subscribe: () => ch, send: () => Promise.resolve('ok') }
    return ch
  },
  removeChannel() {}
}

mockNuxtImport('useSupabaseClient', () => () => supabase)
mockNuxtImport('useState', () => (key: string) => ref(key === 'my-id' ? 'me' : null))

beforeEach(() => {
  calls.inserts = []
  calls.deletes = []
})

describe('useSuggestions write path', () => {
  it('suggest() inserts without user_id (the DB trigger stamps it)', async () => {
    const { suggest } = useSuggestions(ref('e1'))
    await suggest({ id: 7, title: 'Heat' } as never)
    const insert = calls.inserts.find(i => i.table === 'suggestions')
    expect(insert?.payload).toEqual({ event_id: 'e1', tmdb_movie: { id: 7, title: 'Heat' }, deleted: false })
    expect(insert?.payload).not.toHaveProperty('user_id')
  })

  it('vote() inserts only suggestion_id (no user_id)', async () => {
    const { vote } = useSuggestions(ref('e1'))
    await vote({ id: 's1', votes: [] } as never)
    const insert = calls.inserts.find(i => i.table === 'votes')
    expect(insert?.payload).toEqual({ suggestion_id: 's1' })
    expect(insert?.payload).not.toHaveProperty('user_id')
  })

  it('vote() is a no-op when the user already voted', async () => {
    const { vote } = useSuggestions(ref('e1'))
    await vote({ id: 's1', votes: [{ user_id: 'me' }] } as never)
    expect(calls.inserts.find(i => i.table === 'votes')).toBeUndefined()
  })

  it('unvote() deletes by suggestion_id only — RLS scopes it to my row', async () => {
    const { unvote } = useSuggestions(ref('e1'))
    await unvote({ id: 's1', votes: [{ user_id: 'me' }] } as never)
    const del = calls.deletes.find(d => d.table === 'votes')
    expect(del?.filters).toEqual({ suggestion_id: 's1' })
    expect(del?.filters).not.toHaveProperty('user_id')
  })
})
