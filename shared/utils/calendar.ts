export interface CalendarEvent {
  title: string
  start: Date
  durationMinutes?: number
  location?: string | null
  description?: string | null
}

const DEFAULT_DURATION = 180

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** UTC basic format: YYYYMMDDTHHMMSSZ */
function toCalDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

function plain(html: string | null | undefined): string {
  return (html ?? '').replace(/<[^>]*>/g, '').trim()
}

function endOf(e: CalendarEvent): Date {
  return new Date(e.start.getTime() + (e.durationMinutes ?? DEFAULT_DURATION) * 60_000)
}

/**
 * Apply a freeform "7:30 PM" / "19:30" style time onto a date (local tz).
 * Returns a new Date; returns the date unchanged if the time can't be parsed.
 */
export function applyTime(date: Date, timeStr: string | null | undefined): Date {
  if (!timeStr) return date
  const m = timeStr.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i)
  if (!m) return date
  let h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  const ap = m[3]?.toLowerCase()
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  if (h > 23 || min > 59) return date
  const d = new Date(date)
  d.setHours(h, min, 0, 0)
  return d
}

/** "Add to Google Calendar" URL. */
export function googleCalendarUrl(e: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${toCalDate(e.start)}/${toCalDate(endOf(e))}`,
    details: plain(e.description),
    location: e.location ?? ''
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/** A safe `.ics` download filename derived from an event title. */
export function icsFilename(title: string | null | undefined): string {
  return `${(title || 'event').replace(/[^\w-]+/g, '-')}.ics`
}

/** ICS file content (for Apple Calendar / Outlook / .ics download). */
export function icsContent(e: CalendarEvent): string {
  const esc = (s: string): string => s.replace(/[\\;,]/g, m => `\\${m}`).replace(/\n/g, '\\n')
  const slug = e.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'event'
  // RFC 5545 requires UID + DTSTAMP. We don't track a separate creation time, so
  // the (stable) event start doubles as DTSTAMP — both are deterministic.
  const stamp = toCalDate(e.start)
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BSOTG//Movie Night//EN',
    'BEGIN:VEVENT',
    `UID:${stamp}-${slug}@benteenscreenonthegreen.com`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toCalDate(e.start)}`,
    `DTEND:${toCalDate(endOf(e))}`,
    `SUMMARY:${esc(e.title)}`,
    e.location ? `LOCATION:${esc(e.location)}` : '',
    e.description ? `DESCRIPTION:${esc(plain(e.description))}` : '',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean).join('\r\n')
}
