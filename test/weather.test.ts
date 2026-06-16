import { describe, expect, it } from 'vitest'
import { describeWeather, forecastDaysAway, withinForecastWindow } from '../shared/utils/weather'

describe('describeWeather', () => {
  it('maps representative WMO codes to labels', () => {
    expect(describeWeather(0).label).toBe('Clear')
    expect(describeWeather(2).label).toBe('Partly cloudy')
    expect(describeWeather(3).label).toBe('Overcast')
    expect(describeWeather(61).label).toBe('Rain')
    expect(describeWeather(71).label).toBe('Snow')
    expect(describeWeather(95).label).toBe('Thunderstorm')
  })

  it('always returns a lucide icon', () => {
    for (const code of [0, 2, 45, 61, 71, 82, 95]) {
      expect(describeWeather(code).icon).toMatch(/^i-lucide-/)
    }
  })
})

describe('forecast window', () => {
  const now = new Date('2026-06-16T12:00:00Z')

  it('counts whole days to the event', () => {
    expect(forecastDaysAway('2026-06-16', now)).toBe(0)
    expect(forecastDaysAway('2026-06-19', now)).toBe(3)
    expect(forecastDaysAway('2026-06-15', now)).toBe(-1)
  })

  it('is within window for today through 15 days out', () => {
    expect(withinForecastWindow('2026-06-16', now)).toBe(true)
    expect(withinForecastWindow('2026-07-01', now)).toBe(true) // 15 days
    expect(withinForecastWindow('2026-07-02', now)).toBe(false) // 16 days — beyond
    expect(withinForecastWindow('2026-06-15', now)).toBe(false) // past
  })

  it('tolerates a full timestamp and junk input', () => {
    expect(withinForecastWindow('2026-06-19T19:00:00Z', now)).toBe(true)
    expect(forecastDaysAway('not-a-date', now)).toBeNull()
    expect(withinForecastWindow('not-a-date', now)).toBe(false)
  })
})
