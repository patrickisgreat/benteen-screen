import { describe, expect, it } from 'vitest'
import { applyTime, googleCalendarUrl, icsContent } from '../shared/utils/calendar'

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
})

describe('applyTime', () => {
  const base = new Date(2026, 6, 4, 0, 0, 0, 0)

  it('parses 12-hour times', () => {
    expect(applyTime(base, '7:30 PM').getHours()).toBe(19)
    expect(applyTime(base, '7:30 PM').getMinutes()).toBe(30)
    expect(applyTime(base, '12:00 AM').getHours()).toBe(0)
    expect(applyTime(base, '12 PM').getHours()).toBe(12)
  })

  it('parses 24-hour times', () => {
    const d = applyTime(base, '19:45')
    expect(d.getHours()).toBe(19)
    expect(d.getMinutes()).toBe(45)
  })

  it('returns the date unchanged for empty or unparseable input', () => {
    expect(applyTime(base, null).getTime()).toBe(base.getTime())
    expect(applyTime(base, '').getTime()).toBe(base.getTime())
    expect(applyTime(base, 'soon-ish').getTime()).toBe(base.getTime())
    expect(applyTime(base, '99:99').getTime()).toBe(base.getTime())
  })

  it('does not mutate the input date', () => {
    applyTime(base, '8:00 PM')
    expect(base.getHours()).toBe(0)
  })
})
