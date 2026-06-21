import type { TmdbMovie } from './movie'

/**
 * A suggestion as read for the overview. `votes` is the normalized vote rows for
 * the suggestion; the vote count is just `votes.length` and "did I vote" is a
 * membership check — no separate counter to drift (was Product Invariant 3).
 */
export interface Suggestion {
  id: string
  event_id: string
  user_id: string
  tmdb_movie: TmdbMovie
  deleted: boolean
  created_at: string
  votes: { user_id: string }[]
}

/**
 * A suggestion as read for the admin view — a richer Suggestion that adds the
 * author and overrides `votes` with each voter's display name. The override is a
 * narrowing (admin votes are a subtype of base votes), which `extends` permits.
 */
export interface AdminSuggestion extends Suggestion {
  author: { display_name: string | null, email: string | null } | null
  votes: { user_id: string, voter: { display_name: string | null } | null }[]
}
