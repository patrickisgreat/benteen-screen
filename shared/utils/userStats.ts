/** A movie a person suggested, plus whether it ended up a "winner" (top-voted in
 *  a finished/locked event). */
export interface SubmittedMovie {
  id: string
  eventId: string
  title: string
  won: boolean
}

/** Everything the admin people drill-down shows for one person. */
export interface UserStats {
  going: number
  maybe: number
  declined: number
  votesCast: number
  submitted: SubmittedMovie[]
  wins: number
  brought: string[]
}

/** Aggregate one person's participation across the app. Pure — the composable
 *  does the I/O and hands the rows in, so the counting logic is unit-testable.
 *  `winningSuggestionIds` is the set of suggestion ids that won their event
 *  (computed from locked events only — see useUserStats). */
export function computeUserStats(input: {
  rsvps: ReadonlyArray<{ status: string }>
  submissions: ReadonlyArray<{ id: string, event_id: string, tmdb_movie: { title: string } }>
  votesCast: number
  brought: ReadonlyArray<{ label: string }>
  winningSuggestionIds: ReadonlySet<string>
}): UserStats {
  const countStatus = (status: string): number => input.rsvps.filter(r => r.status === status).length
  const submitted: SubmittedMovie[] = input.submissions.map(s => ({
    id: s.id,
    eventId: s.event_id,
    title: s.tmdb_movie.title,
    won: input.winningSuggestionIds.has(s.id)
  }))
  return {
    going: countStatus('going'),
    maybe: countStatus('maybe'),
    declined: countStatus('no'),
    votesCast: input.votesCast,
    submitted,
    wins: submitted.filter(s => s.won).length,
    brought: input.brought.map(b => b.label)
  }
}
