/** WMO weather code → human label + lucide icon (Open-Meteo returns WMO codes). */
export interface WeatherDescription {
  label: string
  icon: string
}

export function describeWeather(code: number): WeatherDescription {
  if (code === 0) return { label: 'Clear', icon: 'i-lucide-sun' }
  if (code <= 2) return { label: 'Partly cloudy', icon: 'i-lucide-cloud-sun' }
  if (code === 3) return { label: 'Overcast', icon: 'i-lucide-cloud' }
  if (code <= 48) return { label: 'Fog', icon: 'i-lucide-cloud-fog' }
  if (code <= 57) return { label: 'Drizzle', icon: 'i-lucide-cloud-drizzle' }
  if (code <= 67) return { label: 'Rain', icon: 'i-lucide-cloud-rain' }
  if (code <= 77) return { label: 'Snow', icon: 'i-lucide-cloud-snow' }
  if (code <= 82) return { label: 'Showers', icon: 'i-lucide-cloud-rain-wind' }
  if (code <= 86) return { label: 'Snow showers', icon: 'i-lucide-cloud-snow' }
  return { label: 'Thunderstorm', icon: 'i-lucide-cloud-lightning' }
}

/** A resolved location, whichever geocoder produced it. */
export interface GeocodedPlace {
  latitude: number
  longitude: number
  name: string | null
}

/** Minimal shape of a Nominatim search hit. lat/lon arrive as strings. */
export interface NominatimResult {
  lat?: string
  lon?: string
  display_name?: string
}

/**
 * Parse the first Nominatim hit defensively — every field may be missing and
 * lat/lon are strings that may not be numeric. Nominatim resolves street
 * addresses ("1447 Benteen Ave SE"), which Open-Meteo's name-only geocoder
 * can't, so it is the primary geocoder for event locations.
 */
export function parseNominatimPlace(results: readonly NominatimResult[] | null | undefined): GeocodedPlace | null {
  const first = results?.[0]
  if (!first) return null
  const latitude = Number(first.lat)
  const longitude = Number(first.lon)
  if (!first.lat || !first.lon || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return { latitude, longitude, name: first.display_name?.trim() || null }
}

/**
 * Fallback candidates for Open-Meteo's geocoder (used when Nominatim misses),
 * which resolves place *names*, not street addresses. Try the full string
 * first, then each comma-separated segment left-to-right — a park/venue name
 * beats the city, the city beats the state/ZIP — and the caller stops at the
 * first that geocodes. Capped so a long address can't fan out into many
 * upstream requests. Deduped case-insensitively.
 */
export function geocodeCandidates(location: string, limit = 4): string[] {
  const seen = new Set<string>()
  const candidates: string[] = []
  const push = (value: string): void => {
    const trimmed = value.trim()
    const key = trimmed.toLowerCase()
    if (trimmed && !seen.has(key) && candidates.length < limit) {
      seen.add(key)
      candidates.push(trimmed)
    }
  }
  push(location)
  for (const segment of location.split(',')) push(segment)
  return candidates
}

/** Whole days from `now` until the event date (negative = past). */
export function forecastDaysAway(eventDate: string, now: Date): number | null {
  const target = new Date(`${eventDate.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(target.getTime())) return null
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((target.getTime() - start) / 86_400_000)
}

/** Open-Meteo gives daily forecasts ~16 days out — only fetch when the event is
 *  today..15 days away (not past, not beyond the horizon). */
export function withinForecastWindow(eventDate: string, now: Date): boolean {
  const days = forecastDaysAway(eventDate, now)
  return days !== null && days >= 0 && days <= 15
}
