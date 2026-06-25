import type { AdminSuggestion } from '#shared/types/suggestion'

/** What one person did for an event: the movies they suggested + the ones they voted for. */
export interface PersonActivity {
  userId: string
  name: string
  suggested: { id: string, title: string, votes: number, won: boolean }[]
  votedFor: { id: string, title: string }[]
}

export interface TopVoter { userId: string, name: string, votes: number }

export interface DashboardSummary {
  suggestions: number
  votes: number
  submitters: number
  voters: number
  mostVoted: { title: string, votes: number } | null
  topVoters: TopVoter[]
}

/** Someone expected at the event (RSVP'd) who hasn't fully engaged. */
export interface EngagementGap { userId: string, name: string, suggested: boolean, voted: boolean }

export interface SuggestionDashboard {
  byPerson: PersonActivity[]
  summary: DashboardSummary
  gaps: EngagementGap[]
}

const TOP_VOTERS = 5

/**
 * Pivots an event's admin suggestions (each carrying its author + named voters) into
 * the per-event dashboard: a per-person breakdown of what each person suggested and
 * voted for, headline summary stats, and engagement gaps. Pure — the composable does
 * the I/O and hands the rows in, so the pivots are unit-testable.
 *
 * Hidden (soft-deleted) suggestions are excluded from every figure. `winnerIds` marks
 * a person's suggestion as a win (top-2 once voting locked); `expected` is the people
 * who RSVP'd (going/maybe) — anyone there who hasn't suggested AND voted is a gap.
 */
export function computeSuggestionDashboard(input: {
  suggestions: ReadonlyArray<AdminSuggestion>
  winnerIds?: ReadonlyArray<string>
  expected?: ReadonlyArray<{ userId: string, name: string }>
}): SuggestionDashboard {
  const live = input.suggestions.filter(s => !s.deleted)
  const winners = new Set(input.winnerIds ?? [])
  const nameById = new Map<string, string>()
  const people = new Map<string, PersonActivity>()

  const ensure = (userId: string, name: string): PersonActivity => {
    if (name && name !== 'Unknown') nameById.set(userId, name)
    let person = people.get(userId)
    if (!person) {
      person = { userId, name, suggested: [], votedFor: [] }
      people.set(userId, person)
    }
    return person
  }

  let totalVotes = 0
  let mostVoted: { title: string, votes: number } | null = null
  const voteCountByUser = new Map<string, number>()
  const voters = new Set<string>()

  for (const s of live) {
    const votes = s.voteCount ?? s.votes?.length ?? 0
    totalVotes += votes
    if (!mostVoted || votes > mostVoted.votes) mostVoted = { title: s.tmdb_movie.title, votes }

    const authorName = s.author?.display_name ?? s.author?.email ?? 'Unknown'
    ensure(s.user_id, authorName).suggested.push({
      id: s.id,
      title: s.tmdb_movie.title,
      votes,
      won: winners.has(s.id)
    })

    for (const vote of s.votes ?? []) {
      voters.add(vote.user_id)
      voteCountByUser.set(vote.user_id, (voteCountByUser.get(vote.user_id) ?? 0) + 1)
      ensure(vote.user_id, vote.voter?.display_name ?? 'Unknown')
        .votedFor.push({ id: s.id, title: s.tmdb_movie.title })
    }
  }

  // A voter we first met as 'Unknown' may be named elsewhere (as an author or another
  // suggestion's voter) — backfill the best name we learned.
  for (const person of people.values()) person.name = nameById.get(person.userId) ?? person.name

  const byPerson = [...people.values()].sort((a, b) =>
    (b.suggested.length + b.votedFor.length) - (a.suggested.length + a.votedFor.length)
    || a.name.localeCompare(b.name)
  )

  const topVoters: TopVoter[] = [...voteCountByUser.entries()]
    .map(([userId, votes]) => ({ userId, name: nameById.get(userId) ?? 'Unknown', votes }))
    .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name))
    .slice(0, TOP_VOTERS)

  const gaps: EngagementGap[] = (input.expected ?? [])
    .map(e => ({ userId: e.userId, name: e.name, suggested: people.get(e.userId)?.suggested.length ? true : false, voted: voters.has(e.userId) }))
    .filter(g => !g.suggested || !g.voted)
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    byPerson,
    summary: {
      suggestions: live.length,
      votes: totalVotes,
      submitters: new Set(live.map(s => s.user_id)).size,
      voters: voters.size,
      mostVoted,
      topVoters
    },
    gaps
  }
}
