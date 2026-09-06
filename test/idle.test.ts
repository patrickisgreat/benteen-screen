import { describe, expect, it } from 'vitest'
import { isIdle } from '../app/utils/events'
import type { MovieEvent } from '../shared/types/event'

const at = (date: Date): MovieEvent => ({ event_date: date.toISOString() } as MovieEvent)
const daysFromNow = (n: number): Date => new Date(Date.now() + n * 24 * 60 * 60 * 1000)

describe('isIdle', () => {
  it('is idle when there are no events at all', () => {
    expect(isIdle([])).toBe(true)
  })

  it('is idle when every event is in the past', () => {
    expect(isIdle([at(daysFromNow(-30)), at(daysFromNow(-2))])).toBe(true)
  })

  it('is not idle when a night is scheduled ahead', () => {
    expect(isIdle([at(daysFromNow(-30)), at(daysFromNow(5))])).toBe(false)
  })

  it('is not idle during the event happening today', () => {
    expect(isIdle([at(new Date())])).toBe(false)
  })
})
