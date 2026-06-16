import type { Forecast } from '#shared/types/weather'

// Proxies Open-Meteo (free, no API key) so the client gets a small, predictable
// forecast and we can defend against the upstream's full payload. Treats the
// external response as untrusted — any miss returns { available: false } rather
// than throwing, so the UI degrades quietly.

interface GeoResponse {
  results?: Array<{ latitude: number, longitude: number, name: string }>
}
interface ForecastResponse {
  daily?: {
    weather_code?: number[]
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
    precipitation_probability_max?: Array<number | null>
  }
}

const UNAVAILABLE: Forecast = { available: false, high: null, low: null, precipProbability: null, code: null, place: null }

export default defineEventHandler(async (event): Promise<Forecast> => {
  const query = getQuery(event)
  const location = (query.location ?? '').toString().trim().slice(0, 120)
  const date = (query.date ?? '').toString().slice(0, 10)

  if (!location || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return UNAVAILABLE
  if (!withinForecastWindow(date, new Date())) return UNAVAILABLE

  try {
    const geo = await $fetch<GeoResponse>('https://geocoding-api.open-meteo.com/v1/search', {
      query: { name: location, count: 1, language: 'en', format: 'json' }
    })
    const place = geo.results?.[0]
    if (!place) return UNAVAILABLE

    const fc = await $fetch<ForecastResponse>('https://api.open-meteo.com/v1/forecast', {
      query: {
        latitude: place.latitude,
        longitude: place.longitude,
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
        temperature_unit: 'fahrenheit',
        timezone: 'auto',
        start_date: date,
        end_date: date
      }
    })
    const daily = fc.daily
    const high = daily?.temperature_2m_max?.[0]
    const low = daily?.temperature_2m_min?.[0]
    const code = daily?.weather_code?.[0]
    if (high == null || low == null || code == null) return UNAVAILABLE

    return {
      available: true,
      high: Math.round(high),
      low: Math.round(low),
      precipProbability: daily?.precipitation_probability_max?.[0] ?? null,
      code,
      place: place.name
    }
  } catch {
    return UNAVAILABLE
  }
})
