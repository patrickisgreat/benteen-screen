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
  /** When voting was ended (locked) by an admin; null = voting is open. */
  voting_locked_at: string | null
  /** Per-event e-vite customization (jsonb). Read via normalizeInviteOptions. */
  invite_options: Record<string, unknown> | null
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
