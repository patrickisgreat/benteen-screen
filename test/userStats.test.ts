import { describe, expect, it } from 'vitest'
import { computeUserStats } from '../shared/utils/userStats'

const base = {
  rsvps: [] as { status: string }[],
  submissions: [] as { id: string, event_id: string, tmdb_movie: { title: string } }[],
  votesCast: 0,
  brought: [] as { label: string }[],
  winningSuggestionIds: new Set<string>()
}

describe('computeUserStats', () => {
  it('tallies RSVP statuses into going / maybe / declined', () => {
    const stats = computeUserStats({
      ...base,
      rsvps: [{ status: 'going' }, { status: 'going' }, { status: 'maybe' }, { status: 'no' }]
    })
    expect(stats.going).toBe(2)
    expect(stats.maybe).toBe(1)
    expect(stats.declined).toBe(1)
  })

  it('lists submitted movies with their titles', () => {
    const stats = computeUserStats({
      ...base,
      submissions: [
        { id: 's1', event_id: 'e1', tmdb_movie: { title: 'Heat' } },
        { id: 's2', event_id: 'e2', tmdb_movie: { title: 'Casino' } }
      ]
    })
    expect(stats.submitted.map(s => s.title)).toEqual(['Heat', 'Casino'])
    expect(stats.submitted[0]).toMatchObject({ id: 's1', eventId: 'e1', won: false })
  })

  it('flags a submission as won when its id is in the winning set, and counts wins', () => {
    const stats = computeUserStats({
      ...base,
      submissions: [
        { id: 's1', event_id: 'e1', tmdb_movie: { title: 'Heat' } },
        { id: 's2', event_id: 'e2', tmdb_movie: { title: 'Casino' } }
      ],
      winningSuggestionIds: new Set(['s1'])
    })
    expect(stats.submitted.find(s => s.id === 's1')?.won).toBe(true)
    expect(stats.submitted.find(s => s.id === 's2')?.won).toBe(false)
    expect(stats.wins).toBe(1)
  })

  it('passes through votes cast and the list of brought items', () => {
    const stats = computeUserStats({
      ...base,
      votesCast: 7,
      brought: [{ label: 'Chips' }, { label: 'Drinks' }]
    })
    expect(stats.votesCast).toBe(7)
    expect(stats.brought).toEqual(['Chips', 'Drinks'])
  })

  it('returns zeroed stats for a person with no activity', () => {
    const stats = computeUserStats(base)
    expect(stats).toEqual({
      going: 0,
      maybe: 0,
      declined: 0,
      votesCast: 0,
      submitted: [],
      wins: 0,
      brought: []
    })
  })
})
