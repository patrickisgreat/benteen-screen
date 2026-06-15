import type { Timestamp } from 'firebase/firestore'

/** A movie-night event. `date` is derived from the Firestore `timestamp` for convenience. */
export interface MovieEvent {
  id: string
  title: string
  description: string
  timestamp: Timestamp
  date: Date
}

/** Shape used when creating/editing an event (no id/derived fields yet). */
export interface EventDraft {
  title: string
  description: string
}
