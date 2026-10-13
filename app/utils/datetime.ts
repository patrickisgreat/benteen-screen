import { EVENT_TIME_ZONE, eventZoneTime, toEventDay } from '#shared/utils/event-day'

type DateInput = string | Date | null | undefined

/** Parse an ISO timestamp string (or Date) to a Date. */
export function toDate(value: DateInput): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** An event date, shown as the calendar day it is in the event zone — the
 *  same day for every viewer, wherever their phone thinks it is. */
export function formatDate(value: DateInput, options: Intl.DateTimeFormatOptions = { dateStyle: 'long' }): string {
  const date = toDate(value)
  return date ? date.toLocaleDateString(undefined, { timeZone: EVENT_TIME_ZONE, ...options }) : ''
}

/** Date + time (uses toLocaleString, which supports timeStyle — formatDate does not). */
export function formatDateTime(value: DateInput, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }): string {
  const date = toDate(value)
  return date ? date.toLocaleString(undefined, options) : ''
}

/** True when both instants fall on the same calendar day in the event zone. */
export function isSameDay(a: Date, b: Date): boolean {
  return toEventDay(a) === toEventDay(b)
}

/** Format a Date as `YYYY-MM-DD` (event zone) for an `<input type="date">`. */
export function toInputDate(date: Date): string {
  return toEventDay(date)
}

/** The instant an `<input type="date">` value names: midnight on that day in
 *  the event zone, so saving from any browser stores the same day. */
export function fromInputDate(day: string): Date {
  return eventZoneTime(day)
}

/** True when the event's day (event zone) is today or in the future. */
export function isUpcoming(value: DateInput): boolean {
  const date = toDate(value)
  return date ? toEventDay(date) >= toEventDay(new Date()) : false
}
