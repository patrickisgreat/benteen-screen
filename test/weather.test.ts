import { describe, expect, it } from 'vitest'
import { describeWeather, forecastDaysAway, geocodeCandidates, parseNominatimPlace, withinForecastWindow } from '../shared/utils/weather'

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

describe('parseNominatimPlace', () => {
  it('parses a street-address hit (lat/lon arrive as strings)', () => {
    // The regression: "1447 Benteen Ave SE" has no commas, so the Open-Meteo
    // candidate fallback had nothing to try — Nominatim resolves it directly.
    expect(parseNominatimPlace([{
      lat: '33.7146957',
      lon: '-84.3669406',
      display_name: '1447, Benteen Avenue Southeast, Atlanta, Georgia, United States'
    }])).toEqual({
      latitude: 33.7146957,
      longitude: -84.3669406,
      name: '1447, Benteen Avenue Southeast, Atlanta, Georgia, United States'
    })
  })

  it('returns null when there are no results', () => {
    expect(parseNominatimPlace([])).toBeNull()
    expect(parseNominatimPlace(null)).toBeNull()
    expect(parseNominatimPlace(undefined)).toBeNull()
  })

  it('returns null when lat/lon are missing or not numeric', () => {
    expect(parseNominatimPlace([{ display_name: 'Somewhere' }])).toBeNull()
    expect(parseNominatimPlace([{ lat: 'abc', lon: '-84.4' }])).toBeNull()
    expect(parseNominatimPlace([{ lat: '33.7', lon: '' }])).toBeNull()
  })

  it('nulls out a missing or blank display name', () => {
    expect(parseNominatimPlace([{ lat: '33.7', lon: '-84.4' }])?.name).toBeNull()
    expect(parseNominatimPlace([{ lat: '33.7', lon: '-84.4', display_name: '  ' }])?.name).toBeNull()
  })
})

describe('geocodeCandidates', () => {
  it('tries the full location first, then each comma segment left-to-right', () => {
    expect(geocodeCandidates('Benteen Park, Atlanta, GA')).toEqual([
      'Benteen Park, Atlanta, GA',
      'Benteen Park',
      'Atlanta',
      'GA'
    ])
  })

  it('trims whitespace around each segment', () => {
    expect(geocodeCandidates('1900 Lakewood Ave SE ,  Atlanta ')).toEqual([
      '1900 Lakewood Ave SE ,  Atlanta',
      '1900 Lakewood Ave SE',
      'Atlanta'
    ])
  })

  it('returns a single candidate when there are no commas', () => {
    expect(geocodeCandidates('Atlanta')).toEqual(['Atlanta'])
  })

  it('dedupes segments case-insensitively so a place is not queried twice', () => {
    // Both segments collapse to one candidate; only the full string differs.
    expect(geocodeCandidates('Atlanta, ATLANTA')).toEqual(['Atlanta, ATLANTA', 'Atlanta'])
  })

  it('caps the number of candidates so a long address cannot fan out', () => {
    expect(geocodeCandidates('a, b, c, d, e, f')).toEqual(['a, b, c, d, e, f', 'a', 'b', 'c'])
  })

  it('ignores empty segments from trailing or doubled commas', () => {
    expect(geocodeCandidates('Benteen Park, Atlanta,')).toEqual([
      'Benteen Park, Atlanta,',
      'Benteen Park',
      'Atlanta'
    ])
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
