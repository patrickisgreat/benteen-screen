import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatDate, fromInputDate, isSameDay, isUpcoming, toDate, toInputDate } from '../app/utils/datetime'

// Midnight Eastern on Halloween — 9 pm the night before in the suite's Pacific zone.
const halloween = '2026-10-31T04:00:00.000Z'

describe('toDate', () => {
  it('returns null for nullish or invalid input', () => {
    expect(toDate(null)).toBeNull()
    expect(toDate(undefined)).toBeNull()
    expect(toDate('not-a-date')).toBeNull()
  })

  it('parses an ISO timestamp string', () => {
    expect(toDate('2026-05-04T00:00:00.000Z')?.toISOString()).toBe('2026-05-04T00:00:00.000Z')
  })

  it('passes a Date through unchanged', () => {
    const now = new Date()
    expect(toDate(now)).toBe(now)
  })
})

describe('isSameDay', () => {
  it('is true for two times on the same event-zone day', () => {
    expect(isSameDay(new Date('2026-06-15T13:00:00Z'), new Date('2026-06-16T03:59:00Z'))).toBe(true)
  })
  it('is false across an Eastern midnight even when Pacific is still the same day', () => {
    expect(isSameDay(new Date('2026-06-16T03:59:00Z'), new Date('2026-06-16T04:00:00Z'))).toBe(false)
  })
})

describe('toInputDate', () => {
  it('formats the event-zone day as zero-padded YYYY-MM-DD', () => {
    expect(toInputDate(new Date('2026-01-05T05:00:00Z'))).toBe('2026-01-05')
  })
  it('pre-fills the edit form with the day the host picked, not the viewer\'s local day', () => {
    expect(toInputDate(new Date(halloween))).toBe('2026-10-31')
  })
})

describe('fromInputDate', () => {
  it('stores the picked day as Eastern midnight from any browser zone', () => {
    expect(fromInputDate('2026-10-31').toISOString()).toBe(halloween)
  })
  it('round-trips with toInputDate', () => {
    expect(toInputDate(fromInputDate('2026-03-08'))).toBe('2026-03-08')
  })
})

describe('formatDate', () => {
  it('returns an empty string for nullish input', () => {
    expect(formatDate(null)).toBe('')
  })
  it('shows the event-zone day, not the day it is on the viewer\'s phone', () => {
    expect(formatDate(halloween, { month: 'long', day: 'numeric' })).toBe('October 31')
  })
  it('keeps caller options while pinning the zone', () => {
    expect(formatDate(halloween, { weekday: 'short', month: 'short', day: 'numeric' })).toBe('Sat, Oct 31')
  })
})

describe('isUpcoming', () => {
  afterEach(() => vi.useRealTimers())

  it('is true for a future date and false for a past one', () => {
    expect(isUpcoming(new Date(Date.now() + 86_400_000).toISOString())).toBe(true)
    expect(isUpcoming(new Date(Date.now() - 86_400_000).toISOString())).toBe(false)
  })

  it('still counts the event as upcoming on the day itself for a viewer west of the event zone', () => {
    // Noon Pacific on Halloween: the event started 15 hours ago as an instant,
    // but it is still today in Atlanta.
    vi.useFakeTimers({ now: new Date('2026-10-31T19:00:00Z') })
    expect(isUpcoming(halloween)).toBe(true)
  })

  it('is false once Eastern midnight has passed, even while the viewer\'s clock says it is still the event day', () => {
    // 10 pm Pacific on Halloween is 1 am Nov 1 in Atlanta.
    vi.useFakeTimers({ now: new Date('2026-11-01T05:00:00Z') })
    expect(isUpcoming(halloween)).toBe(false)
  })

  it('is false for nullish input', () => {
    expect(isUpcoming(null)).toBe(false)
  })
})
