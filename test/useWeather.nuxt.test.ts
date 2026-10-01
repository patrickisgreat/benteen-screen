// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { fakeApi } from './utils/fakeApi'

const soon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
const api = fakeApi(['/api/weather'], () => ({ available: true, high: 80, low: 60, precipProbability: 10, code: 0, place: 'Town' }))

beforeEach(() => api.reset())

describe('useWeather', () => {
  it('fetches the forecast for a location within the window', async () => {
    const { forecast } = useWeather('Birmingham, AL', soon)
    // The faked route answers asynchronously; wait for the forecast to land.
    await vi.waitFor(() => expect(forecast.value?.available).toBe(true))
    expect(api.calls[0]?.url).toBe('/api/weather')
    expect(api.calls[0]?.query).toMatchObject({ location: 'Birmingham, AL' })
  })

  it('skips the fetch when there is no location', async () => {
    const { forecast } = useWeather(null, soon)
    await flushPromises()
    expect(api.calls).toHaveLength(0)
    expect(forecast.value).toBeNull()
  })

  it('skips the fetch for a past date (outside the window)', async () => {
    const { forecast } = useWeather('Birmingham, AL', '2000-01-01')
    await flushPromises()
    expect(api.calls).toHaveLength(0)
    expect(forecast.value).toBeNull()
  })
})
