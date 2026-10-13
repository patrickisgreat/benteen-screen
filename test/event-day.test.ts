import { describe, expect, it } from 'vitest'
import { eventZoneTime, toEventDay } from '../shared/utils/event-day'

// The suite runs as a Pacific-time viewer (see vitest.config.ts), three hours
// behind the event zone — the exact case that showed events a day early.
describe('toEventDay', () => {
  it('reads the calendar day in the event zone, not the viewer\'s', () => {
    // Midnight Eastern on Oct 31 is 9 pm Pacific on Oct 30.
    expect(toEventDay(new Date('2026-10-31T04:00:00Z'))).toBe('2026-10-31')
  })

  it('rolls over at Eastern midnight, not UTC midnight', () => {
    expect(toEventDay(new Date('2026-10-31T03:59:59Z'))).toBe('2026-10-30')
  })

  it('honors standard time once daylight saving ends', () => {
    expect(toEventDay(new Date('2026-12-05T04:30:00Z'))).toBe('2026-12-04')
    expect(toEventDay(new Date('2026-12-05T05:00:00Z'))).toBe('2026-12-05')
  })
})

describe('eventZoneTime', () => {
  it('builds Eastern midnight regardless of the browser\'s zone', () => {
    expect(eventZoneTime('2026-10-31').toISOString()).toBe('2026-10-31T04:00:00.000Z')
    expect(eventZoneTime('2026-12-05').toISOString()).toBe('2026-12-05T05:00:00.000Z')
  })

  it('applies a wall-clock time in the event zone', () => {
    expect(eventZoneTime('2026-10-31', 19, 30).toISOString()).toBe('2026-10-31T23:30:00.000Z')
  })

  it('round-trips through toEventDay', () => {
    expect(toEventDay(eventZoneTime('2026-02-28'))).toBe('2026-02-28')
  })

  it('yields an invalid Date for malformed input', () => {
    expect(Number.isNaN(eventZoneTime('soon').getTime())).toBe(true)
    expect(Number.isNaN(eventZoneTime('').getTime())).toBe(true)
  })
})
