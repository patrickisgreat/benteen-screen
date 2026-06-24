import type { Suggestion } from '#shared/types/suggestion'

/** The top-voted suggestions, most votes first — the "double feature" is the
 *  top 2. Excludes deleted and zero-vote entries; ties break by earliest
 *  suggested so the result is stable. */
export function topWinners(suggestions: Suggestion[], count = 2): Suggestion[] {
  return suggestions
    .filter(s => !s.deleted && (s.voteCount ?? 0) > 0)
    .slice()
    .sort((a, b) =>
      (b.voteCount ?? 0) - (a.voteCount ?? 0)
      || (a.created_at ?? '').localeCompare(b.created_at ?? '')
    )
    .slice(0, count)
}
