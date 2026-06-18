// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'

describe('useOnDemandStats', () => {
  it('loads on id set, exposing the loader result', async () => {
    const { stats, pending, error } = useOnDemandStats(ref('a'), async id => `stats:${id}`)
    await flushPromises()
    expect(stats.value).toBe('stats:a')
    expect(pending.value).toBe(false)
    expect(error.value).toBeNull()
  })

  it('clears stats when the id becomes null', async () => {
    const id = ref<string | null>('a')
    const { stats } = useOnDemandStats(id, async i => `stats:${i}`)
    await flushPromises()
    expect(stats.value).toBe('stats:a')
    id.value = null
    await nextTick()
    expect(stats.value).toBeNull()
  })

  it('surfaces a loader error and leaves stats null', async () => {
    const { stats, error } = useOnDemandStats(ref('a'), async () => { throw new Error('boom') }, 'Failed!')
    await flushPromises()
    expect(error.value).toBe('boom')
    expect(stats.value).toBeNull()
  })

  it('drops a stale response when the id changed mid-flight', async () => {
    const resolvers: Record<string, (v: string) => void> = {}
    const loader = (id: string) => new Promise<string>((resolve) => { resolvers[id] = resolve })

    const id = ref('a')
    const { stats } = useOnDemandStats(id, loader) // immediate watch fires load('a')
    id.value = 'b'
    await nextTick() // watcher fires load('b')

    resolvers.a!('stale-a') // resolve the no-longer-current request
    await flushPromises()
    expect(stats.value).toBeNull() // stale result discarded

    resolvers.b!('fresh-b')
    await flushPromises()
    expect(stats.value).toBe('fresh-b')
  })
})
