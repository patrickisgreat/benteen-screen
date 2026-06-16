// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import WeatherForecast from '../app/components/WeatherForecast.vue'

const forecast = ref<unknown>(null)
mockNuxtImport('useWeather', () => () => ({ forecast, pending: ref(false) }))

describe('WeatherForecast', () => {
  it('shows the condition, temps and rain chance when available', async () => {
    forecast.value = { available: true, high: 82, low: 61, precipProbability: 20, code: 61, place: 'Town' }
    const w = await mountSuspended(WeatherForecast, { props: { location: 'Town', date: '2026-07-01' } })
    expect(w.text()).toContain('Rain')
    expect(w.text()).toContain('82')
    expect(w.text()).toContain('20% rain')
  })

  it('renders nothing when no forecast is available', async () => {
    forecast.value = { available: false, high: null, low: null, precipProbability: null, code: null, place: null }
    const w = await mountSuspended(WeatherForecast, { props: { location: 'Town', date: '2026-07-01' } })
    expect(w.text().trim()).toBe('')
  })
})
