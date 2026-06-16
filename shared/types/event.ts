/** A movie-night event row. `event_date` is an ISO timestamptz string. */
export interface MovieEvent {
  id: string
  title: string
  description: string
  event_date: string
  start_time: string | null
  location: string | null
  location_url: string | null
  poster_url: string | null
  created_at: string
}

/** Shape used when creating/editing an event. */
export interface EventDraft {
  title: string
  description: string
  start_time?: string | null
  location?: string | null
  location_url?: string | null
  poster_url?: string | null
}
