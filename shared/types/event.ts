/** A movie-night event row. `event_date` is an ISO timestamptz string. */
export interface MovieEvent {
  id: string
  title: string
  description: string
  event_date: string
  created_at: string
}

/** Shape used when creating/editing an event. */
export interface EventDraft {
  title: string
  description: string
}
