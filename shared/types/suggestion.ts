import type { TmdbMovie } from './movie'

/**
 * A suggestion as read for the overview.
 *
 * `voteCount` is the public total, served by the `suggestion_vote_counts` tally
 * (SECURITY DEFINER) so everyone sees accurate counts without seeing identities.
 * `votes` holds only the vote rows the current viewer is allowed to read — their
 * own for a normal user, all of them for an admin (RLS, see the voter-privacy
 * migration) — so it answers "did I vote" via a membership check but must NOT be
 * used for counting. Counts come from the tally, not `votes.length`: still no
 * stored counter to drift (Invariant 3), just no longer client-visible per voter.
 */
export interface Suggestion {
  id: string
  event_id: string
  user_id: string
  tmdb_movie: TmdbMovie
  deleted: boolean
  created_at: string
  voteCount: number
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
