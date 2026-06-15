/**
 * Pure helpers for per-user participation counting, kept free of Firebase/Nuxt
 * types so the vote/suggestion-limit logic is trivially unit-testable.
 */
interface VoteLike { userId: string }
interface SuggestionLike {
  userReference?: { id?: string } | null
  votes?: VoteLike[] | null
}

export function countUserVotes(suggestions: readonly SuggestionLike[], uid: string): number {
  return suggestions.filter(s => (s.votes ?? []).some(v => v.userId === uid)).length
}

export function countUserSuggestions(suggestions: readonly SuggestionLike[], uid: string): number {
  return suggestions.filter(s => s.userReference?.id === uid).length
}

/** Remaining allowance for a limit, never negative. */
export function remaining(limit: number, used: number): number {
  return Math.max(0, limit - used)
}
