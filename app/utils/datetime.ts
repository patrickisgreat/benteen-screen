import type { Timestamp } from 'firebase/firestore'

type TimestampLike = Timestamp | { seconds: number, nanoseconds: number } | null | undefined

/** Convert a Firestore Timestamp (or plain {seconds,nanoseconds}) to a Date. */
export function toDate(ts: TimestampLike): Date | null {
  if (!ts) return null
  if (typeof (ts as Timestamp).toDate === 'function') return (ts as Timestamp).toDate()
  const plain = ts as { seconds: number, nanoseconds: number }
  return new Date(plain.seconds * 1000 + Math.floor(plain.nanoseconds / 1e6))
}

export function formatDate(ts: TimestampLike, options: Intl.DateTimeFormatOptions = { dateStyle: 'long' }): string {
  const date = toDate(ts)
  return date ? date.toLocaleDateString(undefined, options) : ''
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  )
}

/** True when the event date is today or in the future. */
export function isUpcoming(ts: TimestampLike): boolean {
  const date = toDate(ts)
  if (!date) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return date.getTime() >= today.getTime()
}
