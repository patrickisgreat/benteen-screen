// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

const soon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
const calls: Array<{ url: string, query: unknown }> = []

beforeEach(() => {
  calls.length = 0
  vi.stubGlobal('$fetch', (url: string, opts: { query: unknown }) => {
    calls.push({ url, query: opts.query })
    return Promise.resolve({ available: true, high: 80, low: 60, precipProbability: 10, code: 0, place: 'Town' })
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('useWeather', () => {
  it('fetches the forecast for a location within the window', async () => {
    const { forecast } = useWeather('Birmingham, AL', soon)
    await flushPromises()
    expect(calls[0]?.url).toBe('/api/weather')
    expect(forecast.value?.available).toBe(true)
  })

  it('skips the fetch when there is no location', async () => {
    const { forecast } = useWeather(null, soon)
    await flushPromises()
    expect(calls).toHaveLength(0)
    expect(forecast.value).toBeNull()
  })

  it('skips the fetch for a past date (outside the window)', async () => {
    const { forecast } = useWeather('Birmingham, AL', '2000-01-01')
    await flushPromises()
    expect(calls).toHaveLength(0)
    expect(forecast.value).toBeNull()
  })
})
