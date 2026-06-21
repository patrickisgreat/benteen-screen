import type { Suggestion } from '#shared/types/suggestion'

/**
 * Per-event participation caps, mirrored from the server-side triggers in
 * supabase/migrations (Product Invariant 3 — keep these two in sync). The DB is
 * the real enforcer; these drive the UI (disable controls + warn at the cap).
 */
export const SUGGESTION_LIMIT = 5
export const VOTE_LIMIT = 3

/** How many of this event's (non-deleted) suggestions are mine. */
export function countMySuggestions(suggestions: ReadonlyArray<Suggestion>, myId: string | null): number {
  if (!myId) return 0
  return suggestions.filter(s => s.user_id === myId && !s.deleted).length
}

/** How many of this event's suggestions I've voted for (= my votes this event). */
export function countMyVotes(suggestions: ReadonlyArray<Suggestion>, myId: string | null): number {
  if (!myId) return 0
  return suggestions.filter(s => (s.votes ?? []).some(v => v.user_id === myId)).length
}
