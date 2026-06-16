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
