/**
 * Pure helpers for per-user participation counting, kept free of Supabase types
 * so the vote/suggestion-limit logic is trivially unit-testable.
 */
interface VoteLike { user_id: string }
interface SuggestionLike {
  user_id?: string | null
  votes?: VoteLike[] | null
}

export function countUserVotes(suggestions: readonly SuggestionLike[], uid: string): number {
  return suggestions.filter(s => (s.votes ?? []).some(v => v.user_id === uid)).length
}

export function countUserSuggestions(suggestions: readonly SuggestionLike[], uid: string): number {
  return suggestions.filter(s => s.user_id === uid).length
}

/** Remaining allowance for a limit, never negative. */
export function remaining(limit: number, used: number): number {
  return Math.max(0, limit - used)
}
