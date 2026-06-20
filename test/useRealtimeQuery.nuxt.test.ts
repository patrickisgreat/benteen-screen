// @vitest-environment nuxt
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

// Fake Supabase channel: records the postgres_changes configs and is chainable.
interface ChangeConfig { table: string, filter?: string }
const state = {
  channelsCreated: 0,
  removed: 0,
  onConfigs: [] as ChangeConfig[]
}
function fakeChannel() {
  const ch = {
    on: (_event: string, cfg: ChangeConfig) => {
      state.onConfigs.push(cfg)
      return ch
    },
    subscribe: () => ch
  }
  return ch
}
const supabase = {
  channel: () => {
    state.channelsCreated++
    return fakeChannel()
  },
  removeChannel: () => { state.removed++ }
}
mockNuxtImport('useSupabaseClient', () => () => supabase)

afterEach(() => {
  state.channelsCreated = 0
  state.removed = 0
  state.onConfigs = []
})

const baseOpts = { channel: 't', tables: [{ table: 'things' }], empty: [] as string[] }

describe('useRealtimeQuery', () => {
  it('loads on key set and subscribes a channel filtered by the key', async () => {
    const { data, pending } = useRealtimeQuery({
      ...baseOpts,
      key: ref('e1'),
      load: async (id: string) => [`row:${id}`]
    })
    await flushPromises()
    expect(data.value).toEqual(['row:e1'])
    expect(pending.value).toBe(false)
    expect(state.channelsCreated).toBe(1)
    expect(state.onConfigs).toContainEqual({ event: '*', schema: 'public', table: 'things', filter: 'event_id=eq.e1' })
  })

  it('does not scope a global table to the key', async () => {
    useRealtimeQuery({
      ...baseOpts,
      tables: [{ table: 'votes', global: true }],
      key: ref('e1'),
      load: async () => []
    })
    await flushPromises()
    expect(state.onConfigs).toContainEqual({ event: '*', schema: 'public', table: 'votes' })
  })

  it('clears to empty and tears down the channel when the key becomes null', async () => {
    const key = ref<string | null>('e1')
    const { data } = useRealtimeQuery({ ...baseOpts, key, load: async () => ['x'] })
    await flushPromises()
    expect(data.value).toEqual(['x'])
    key.value = null
    await nextTick()
    expect(data.value).toEqual([])
    expect(state.removed).toBeGreaterThan(0)
  })

  it('surfaces a load error instead of swallowing it', async () => {
    const failing = async (): Promise<string[]> => {
      throw new Error('boom')
    }
    const { data, error } = useRealtimeQuery({ ...baseOpts, key: ref('e1'), errorFallback: 'fail', load: failing })
    await flushPromises()
    expect(error.value).toBe('boom')
    expect(data.value).toEqual([])
  })

  it('drops a stale response when the key changed mid-flight', async () => {
    const resolvers: Record<string, (v: string[]) => void> = {}
    const load = (id: string) => new Promise<string[]>((resolve) => {
      resolvers[id] = resolve
    })
    const key = ref('a')
    const { data } = useRealtimeQuery({ ...baseOpts, key, load })
    key.value = 'b'
    await nextTick()

    resolvers.a!(['stale']) // resolve the no-longer-current request
    await flushPromises()
    expect(data.value).toEqual([]) // stale result discarded

    resolvers.b!(['fresh'])
    await flushPromises()
    expect(data.value).toEqual(['fresh'])
  })
})
