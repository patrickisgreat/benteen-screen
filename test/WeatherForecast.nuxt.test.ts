// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import WeatherForecast from '../app/components/WeatherForecast.vue'

const soon = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
const farOut = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10)
const unavailable = { available: false, high: null, low: null, precipProbability: null, code: null, place: null }

const forecast = ref<unknown>(null)
mockNuxtImport('useWeather', () => () => ({ forecast, pending: ref(false) }))

describe('WeatherForecast', () => {
  it('shows the condition, temps and rain chance when a forecast is available', async () => {
    forecast.value = { available: true, high: 82, low: 61, precipProbability: 20, code: 61, place: 'Town' }
    const w = await mountSuspended(WeatherForecast, { props: { location: 'Town', date: soon } })
    expect(w.text()).toContain('Rain')
    expect(w.text()).toContain('82')
    expect(w.text()).toContain('20% rain')
  })

  it('renders nothing inside the window when no forecast is available', async () => {
    forecast.value = unavailable
    const w = await mountSuspended(WeatherForecast, { props: { location: 'Town', date: soon } })
    expect(w.text().trim()).toBe('')
  })

  it('shows a Farmer\'s Almanac quip for events beyond the forecast window', async () => {
    forecast.value = unavailable
    const w = await mountSuspended(WeatherForecast, { props: { location: 'Town', date: farOut } })
    expect(w.text()).toContain('Farmer\'s Almanac')
  })
})
