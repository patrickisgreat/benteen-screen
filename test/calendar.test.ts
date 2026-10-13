import { describe, expect, it } from 'vitest'
import { applyTime, googleCalendarUrl, icsContent, icsFilename } from '../shared/utils/calendar'

// A fixed UTC instant keeps the UTC-formatted output deterministic across timezones.
const start = new Date('2026-07-04T23:00:00Z')

describe('googleCalendarUrl', () => {
  it('builds a TEMPLATE url with UTC start/end (default 3h) and stripped details', () => {
    const url = new URL(googleCalendarUrl({
      title: 'Movie Night',
      start,
      location: 'Benteen Park',
      description: '<p>Bring a <b>blanket</b></p>'
    }))
    expect(url.searchParams.get('action')).toBe('TEMPLATE')
    expect(url.searchParams.get('text')).toBe('Movie Night')
    // 23:00Z + 180min → 02:00Z next day
    expect(url.searchParams.get('dates')).toBe('20260704T230000Z/20260705T020000Z')
    expect(url.searchParams.get('location')).toBe('Benteen Park')
    expect(url.searchParams.get('details')).toBe('Bring a blanket')
  })

  it('honours a custom duration', () => {
    const url = new URL(googleCalendarUrl({ title: 'X', start, durationMinutes: 60 }))
    expect(url.searchParams.get('dates')).toBe('20260704T230000Z/20260705T000000Z')
  })
})

describe('icsContent', () => {
  it('produces a valid VEVENT with CRLF line breaks', () => {
    const ics = icsContent({ title: 'Movie Night', start, location: 'Benteen Park' })
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('DTSTART:20260704T230000Z')
    expect(ics).toContain('DTEND:20260705T020000Z')
    expect(ics).toContain('SUMMARY:Movie Night')
    expect(ics).toContain('LOCATION:Benteen Park')
    expect(ics).toContain('END:VCALENDAR')
    expect(ics).toContain('\r\n')
  })

  it('escapes special characters and strips html from the description', () => {
    const ics = icsContent({ title: 'A; B, C', start, description: '<p>Line one</p>' })
    expect(ics).toContain('SUMMARY:A\\; B\\, C')
    expect(ics).toContain('DESCRIPTION:Line one')
  })

  it('omits optional lines when absent', () => {
    const ics = icsContent({ title: 'Bare', start })
    expect(ics).not.toContain('LOCATION:')
    expect(ics).not.toContain('DESCRIPTION:')
  })

  it('includes a stable UID and DTSTAMP (RFC 5545 requires both)', () => {
    const ics = icsContent({ title: 'Movie Night', start })
    expect(ics).toMatch(/UID:20260704T230000Z-movie-night@/)
    expect(ics).toContain('DTSTAMP:20260704T230000Z')
  })
})

describe('icsFilename', () => {
  it('slugifies the title and appends .ics', () => {
    expect(icsFilename('Movie Night: Heat!')).toBe('Movie-Night-Heat-.ics')
    expect(icsFilename('already-fine_2026')).toBe('already-fine_2026.ics')
  })

  it('falls back to "event" when there is no title', () => {
    expect(icsFilename('')).toBe('event.ics')
    expect(icsFilename(null)).toBe('event.ics')
    expect(icsFilename(undefined)).toBe('event.ics')
  })
})

describe('applyTime', () => {
  // Midnight Eastern on July 4 (EDT, UTC-4).
  const base = new Date('2026-07-04T04:00:00Z')

  it('parses 12-hour times as Eastern wall-clock times', () => {
    expect(applyTime(base, '7:30 PM').toISOString()).toBe('2026-07-04T23:30:00.000Z')
    expect(applyTime(base, '12:00 AM').toISOString()).toBe('2026-07-04T04:00:00.000Z')
    expect(applyTime(base, '12 PM').toISOString()).toBe('2026-07-04T16:00:00.000Z')
  })

  it('parses 24-hour times', () => {
    expect(applyTime(base, '19:45').toISOString()).toBe('2026-07-04T23:45:00.000Z')
  })

  it('keeps the event day for a viewer whose local day is still the one before', () => {
    // Midnight Eastern is 9 pm Pacific the previous evening; the calendar entry
    // must still land on July 4 at 8 pm Atlanta time.
    expect(applyTime(base, '8:00 PM').toISOString()).toBe('2026-07-05T00:00:00.000Z')
  })

  it('returns the date unchanged for empty or unparseable input', () => {
    expect(applyTime(base, null).getTime()).toBe(base.getTime())
    expect(applyTime(base, '').getTime()).toBe(base.getTime())
    expect(applyTime(base, 'soon-ish').getTime()).toBe(base.getTime())
    expect(applyTime(base, '99:99').getTime()).toBe(base.getTime())
  })

  it('does not mutate the input date', () => {
    applyTime(base, '8:00 PM')
    expect(base.toISOString()).toBe('2026-07-04T04:00:00.000Z')
  })
})
