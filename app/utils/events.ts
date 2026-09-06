import { isUpcoming } from './datetime'
import type { MovieEvent } from '#shared/types/event'

/**
 * Admin ordering for the events list: upcoming events first (soonest first),
 * then past events descending (most recent first → oldest last).
 */
export function sortEventsForAdmin(events: readonly MovieEvent[]): MovieEvent[] {
  const ms = (e: MovieEvent): number => new Date(e.event_date).getTime()
  const upcoming = events.filter(e => isUpcoming(e.event_date)).sort((a, b) => ms(a) - ms(b))
  const past = events.filter(e => !isUpcoming(e.event_date)).sort((a, b) => ms(b) - ms(a))
  return [...upcoming, ...past]
}

/**
 * "Idle mode": the club is between screenings — nothing is scheduled for today
 * or any later date, so there is no event to e-vite anyone to. `isUpcoming`
 * counts today as upcoming, so an event happening right now keeps us out of idle.
 */
export function isIdle(events: readonly MovieEvent[]): boolean {
  return !events.some(e => isUpcoming(e.event_date))
}
