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
