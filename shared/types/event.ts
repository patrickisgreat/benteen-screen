import type { Timestamp } from 'firebase/firestore'

/** A movie-night event document (the `id` is attached by VueFire at read time). */
export interface MovieEvent {
  id: string
  title: string
  description: string
  timestamp: Timestamp
}

/** Shape used when creating/editing an event. */
export interface EventDraft {
  title: string
  description: string
}
