import type { Forecast } from '#shared/types/weather'
import type { GeocodedPlace, NominatimResult } from '#shared/utils/weather'

// Proxies Open-Meteo (free, no API key) so the client gets a small, predictable
// forecast and we can defend against the upstream's full payload. Treats the
// external response as untrusted — any miss returns { available: false } rather
// than throwing, so the UI degrades quietly.

interface GeoResponse {
  results?: Array<{ latitude: number, longitude: number, name: string }>
}

// Nominatim (OpenStreetMap) resolves street addresses ("1447 Benteen Ave SE"),
// which Open-Meteo's name-only geocoder cannot — a comma-less address used to
// produce zero usable candidates and the card silently blanked out. Their usage
// policy requires an identifying User-Agent.
async function geocode(location: string): Promise<GeocodedPlace | null> {
  const nominatim = await $fetch<NominatimResult[]>('https://nominatim.openstreetmap.org/search', {
    query: { q: location, format: 'jsonv2', limit: 1 },
    headers: { 'User-Agent': 'benteen-screen-on-the-green/1.0 (event weather card)' }
  }).catch(() => null)
  const place = parseNominatimPlace(nominatim)
  if (place) return place

  // Fallback: Open-Meteo's place-name geocoder, trying the full location then
  // progressively simpler comma segments (venue → city → state).
  for (const candidate of geocodeCandidates(location)) {
    const geo = await $fetch<GeoResponse>('https://geocoding-api.open-meteo.com/v1/search', {
      query: { name: candidate, count: 1, language: 'en', format: 'json' }
    })
    const hit = geo.results?.[0]
    if (hit) return { latitude: hit.latitude, longitude: hit.longitude, name: hit.name }
  }
  return null
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
    const place = await geocode(location)
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
