import { describe, expect, it } from 'vitest'
import { formatDate, isSameDay, isUpcoming, toDate, toInputDate } from '../app/utils/datetime'

describe('toDate', () => {
  it('returns null for nullish input', () => {
    expect(toDate(null)).toBeNull()
    expect(toDate(undefined)).toBeNull()
  })

  it('uses a Firestore Timestamp.toDate() when available', () => {
    const expected = new Date('2026-05-04T00:00:00Z')
    const stamp = { seconds: 0, nanoseconds: 0, toDate: () => expected }
    expect(toDate(stamp as never)).toBe(expected)
  })

  it('converts a plain {seconds, nanoseconds} correctly (nanoseconds → ms)', () => {
    // 1000s + 0.5s of nanoseconds = 1_000_500 ms
    const date = toDate({ seconds: 1000, nanoseconds: 500_000_000 })
    expect(date?.getTime()).toBe(1_000_500)
  })
})

describe('isSameDay', () => {
  it('is true for two times on the same calendar day', () => {
    expect(isSameDay(new Date(2026, 5, 15, 9), new Date(2026, 5, 15, 23))).toBe(true)
  })
  it('is false across a day boundary', () => {
    expect(isSameDay(new Date(2026, 5, 15), new Date(2026, 5, 16))).toBe(false)
  })
})

describe('toInputDate', () => {
  it('formats a Date as zero-padded YYYY-MM-DD', () => {
    expect(toInputDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('formatDate', () => {
  it('returns an empty string for nullish input', () => {
    expect(formatDate(null)).toBe('')
  })
  it('formats a valid timestamp', () => {
    const stamp = { seconds: 0, nanoseconds: 0, toDate: () => new Date(2026, 4, 4) }
    expect(formatDate(stamp as never)).not.toBe('')
  })
})

describe('isUpcoming', () => {
  it('is true for a future date and false for a past one', () => {
    const future = { seconds: 0, nanoseconds: 0, toDate: () => new Date(Date.now() + 86_400_000) }
    const past = { seconds: 0, nanoseconds: 0, toDate: () => new Date(Date.now() - 86_400_000) }
    expect(isUpcoming(future as never)).toBe(true)
    expect(isUpcoming(past as never)).toBe(false)
  })
})
