import type { Suggestion } from '#shared/types/suggestion'

/** Key stats for one event's admin drill-down. */
export interface EventStats {
  suggestionCount: number
  voteCount: number
  submitterCount: number
  voterCount: number
  going: number
  maybe: number
  declined: number
  bringTotal: number
  bringClaimed: number
  /** Top-2 vote-getters (the "double feature"), most votes first. */
  topPicks: { title: string, votes: number }[]
}

/** Aggregate one event's participation. Pure — the composable does the I/O and
 *  hands the rows in, so the counting is unit-testable. */
export function computeEventStats(input: {
  suggestions: ReadonlyArray<Suggestion>
  rsvps: ReadonlyArray<{ status: string }>
  bringItems: ReadonlyArray<{ user_id: string | null }>
}): EventStats {
  const live = input.suggestions.filter(s => !s.deleted)
  const submitters = new Set(live.map(s => s.user_id))
  const voters = new Set<string>()
  for (const s of live) {
    for (const v of s.votes ?? []) voters.add(v.user_id)
  }
  const countStatus = (status: string): number => input.rsvps.filter(r => r.status === status).length
  return {
    suggestionCount: live.length,
    voteCount: live.reduce((n, s) => n + (s.voteCount ?? 0), 0),
    submitterCount: submitters.size,
    voterCount: voters.size,
    going: countStatus('going'),
    maybe: countStatus('maybe'),
    declined: countStatus('no'),
    bringTotal: input.bringItems.length,
    bringClaimed: input.bringItems.filter(b => b.user_id !== null).length,
    topPicks: topWinners([...live]).map(s => ({ title: s.tmdb_movie.title, votes: s.voteCount ?? 0 }))
  }
}
