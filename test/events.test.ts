import { describe, expect, it } from 'vitest'
import { sortEventsForAdmin } from '../app/utils/events'

const DAY = 86_400_000
const at = (offsetDays: number): string => new Date(Date.now() + offsetDays * DAY).toISOString()
const ev = (id: string, offsetDays: number) => ({
  id,
  title: id,
  description: '',
  event_date: at(offsetDays),
  start_time: null,
  location: null,
  location_url: null,
  poster_url: null,
  created_at: at(0)
})

describe('sortEventsForAdmin', () => {
  it('lists upcoming first (soonest first), then past descending (oldest last)', () => {
    const input = [ev('past-old', -30), ev('future-far', 30), ev('past-recent', -2), ev('future-near', 2)]
    expect(sortEventsForAdmin(input).map(e => e.id)).toEqual(['future-near', 'future-far', 'past-recent', 'past-old'])
  })

  it('does not mutate the input array', () => {
    const input = [ev('a', 5), ev('b', -5)]
    const snapshot = [...input]
    sortEventsForAdmin(input)
    expect(input).toEqual(snapshot)
  })

  it('returns an empty array when there are no events', () => {
    expect(sortEventsForAdmin([])).toEqual([])
  })
})
