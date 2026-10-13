/** Movie nights happen in Atlanta, so an event's date is a calendar day there.
 *  The `events.event_date` column stores the instant that day begins, and every
 *  read or write of it goes through this zone — a guest in Las Vegas sees
 *  "October 31", not the 30th that instant falls on in Pacific time. */
export const EVENT_TIME_ZONE = 'America/New_York'

const wallClock = new Intl.DateTimeFormat('en-US', {
  timeZone: EVENT_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
})

/** The instant's wall-clock reading in the event zone, as a UTC timestamp of
 *  the same digits — the gap between that and the real instant is the zone's
 *  offset at that moment. */
function wallClockAsUtc(date: Date): number {
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(wallClock.formatToParts(date).find(p => p.type === type)?.value)
  return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'))
}

/** `YYYY-MM-DD` of the instant in the event zone. */
export function toEventDay(date: Date): string {
  return new Date(wallClockAsUtc(date)).toISOString().slice(0, 10)
}

/** The instant at `hour:minute` on `day` (`YYYY-MM-DD`) in the event zone.
 *  An invalid `day` yields an invalid Date, which `toDate` turns into null. */
export function eventZoneTime(day: string, hour = 0, minute = 0): Date {
  const [year, month, dayOfMonth] = day.split('-').map(Number)
  if (!year || !month || !dayOfMonth) return new Date(Number.NaN)
  // Read the digits as UTC, then shift by the zone's offset at that moment.
  const asUtc = Date.UTC(year, month - 1, dayOfMonth, hour, minute)
  const offset = wallClockAsUtc(new Date(asUtc)) - asUtc
  return new Date(asUtc - offset)
}
