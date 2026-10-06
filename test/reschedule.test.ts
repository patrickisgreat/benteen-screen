import { describe, expect, it } from 'vitest'
import { isRescheduled, parseRescheduleRequest } from '../shared/utils/reschedule'

describe('parseRescheduleRequest', () => {
  const eventDate = '2026-10-18T04:00:00.000Z'

  it('accepts a new date, emailing everyone by default', () => {
    expect(parseRescheduleRequest({ eventDate })).toEqual({ ok: true, value: { eventDate, startTime: null, note: null, notify: true } })
  })

  it('keeps a start time and note, trimmed, and treats blanks as none', () => {
    expect(parseRescheduleRequest({ eventDate, startTime: ' 8pm ', note: ' Rain on Friday ' }))
      .toMatchObject({ value: { startTime: '8pm', note: 'Rain on Friday' } })
    expect(parseRescheduleRequest({ eventDate, startTime: '  ', note: '  ' }))
      .toMatchObject({ value: { startTime: null, note: null } })
  })

  it('lets the admin move it quietly', () => {
    expect(parseRescheduleRequest({ eventDate, notify: false })).toMatchObject({ value: { notify: false } })
  })

  it('rejects a missing or malformed date', () => {
    expect(parseRescheduleRequest({}).ok).toBe(false)
    expect(parseRescheduleRequest({ eventDate: 'next saturday' }).ok).toBe(false)
    expect(parseRescheduleRequest(null).ok).toBe(false)
  })
})

describe('isRescheduled', () => {
  const current = { event_date: '2026-10-17T04:00:00+00:00', start_time: '8pm' }

  it('is false for the date and time it already has, however the timestamp is written', () => {
    expect(isRescheduled(current, { eventDate: '2026-10-17T04:00:00.000Z', startTime: '8pm' })).toBe(false)
  })

  it('is true for a different day', () => {
    expect(isRescheduled(current, { eventDate: '2026-10-18T04:00:00.000Z', startTime: '8pm' })).toBe(true)
  })

  it('is true for the same day at a different time', () => {
    expect(isRescheduled(current, { eventDate: '2026-10-17T04:00:00.000Z', startTime: '9pm' })).toBe(true)
    expect(isRescheduled({ ...current, start_time: null }, { eventDate: '2026-10-17T04:00:00.000Z', startTime: null })).toBe(false)
  })
})
