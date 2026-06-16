import type { MaybeRefOrGetter } from 'vue'
import type { Forecast } from '#shared/types/weather'

/** Fetches the event-day forecast for a location, but only when the date is
 *  inside Open-Meteo's forecast window (skips past/far-future events). */
export function useWeather(location: MaybeRefOrGetter<string | null>, date: MaybeRefOrGetter<string | null>) {
  const forecast = ref<Forecast | null>(null)
  const pending = ref(false)

  watchEffect(async () => {
    const loc = toValue(location)
    const day = toValue(date)
    if (!loc || !day || !withinForecastWindow(day, new Date())) {
      forecast.value = null
      return
    }
    pending.value = true
    try {
      forecast.value = await $fetch<Forecast>('/api/weather', { query: { location: loc, date: day.slice(0, 10) } })
    } catch {
      forecast.value = null
    } finally {
      pending.value = false
    }
  })

  return { forecast, pending }
}
