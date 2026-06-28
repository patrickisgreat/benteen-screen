import { describe, expect, it } from 'vitest'
import type { Suggestion } from '../shared/types/suggestion'
import { computeEventStats } from '../shared/utils/eventStats'

const sug = (id: string, userId: string, voters: string[], title = id, deleted = false): Suggestion => ({
  id,
  event_id: 'e1',
  user_id: userId,
  tmdb_movie: { id: 1, title },
  deleted,
  created_at: '2026-01-01T00:00:00Z',
  voteCount: voters.length,
  votes: voters.map(user_id => ({ user_id }))
})

describe('computeEventStats', () => {
  it('counts live suggestions, total votes, and distinct submitters/voters', () => {
    const stats = computeEventStats({
      suggestions: [
        sug('s1', 'alice', ['x', 'y']),
        sug('s2', 'bob', ['x']),
        sug('s3', 'alice', []) // alice submitted twice → 2 distinct submitters
      ],
      rsvps: [],
      bringItems: []
    })
    expect(stats.suggestionCount).toBe(3)
    expect(stats.voteCount).toBe(3)
    expect(stats.submitterCount).toBe(2)
    expect(stats.voterCount).toBe(2) // x and y
  })

  it('excludes soft-deleted suggestions from every count', () => {
    const stats = computeEventStats({
      suggestions: [sug('s1', 'alice', ['x']), sug('gone', 'bob', ['y', 'z'], 'Gone', true)],
      rsvps: [],
      bringItems: []
    })
    expect(stats.suggestionCount).toBe(1)
    expect(stats.voteCount).toBe(1)
    expect(stats.submitterCount).toBe(1)
  })

  it('excludes soft-deleted (un-RSVP) votes from the distinct voter count', () => {
    const withHidden: Suggestion = {
      id: 's1',
      event_id: 'e1',
      user_id: 'alice',
      tmdb_movie: { id: 1, title: 'Heat' },
      deleted: false,
      created_at: '2026-01-01T00:00:00Z',
      voteCount: 1,
      votes: [{ user_id: 'live' }, { user_id: 'left', hidden_at: '2026-06-01T00:00:00Z' }]
    }
    const stats = computeEventStats({ suggestions: [withHidden], rsvps: [], bringItems: [] })
    expect(stats.voterCount).toBe(1) // only 'live' — 'left' soft-deleted their vote on un-RSVP
  })

  it('splits RSVPs into going / maybe / declined', () => {
    const stats = computeEventStats({
      suggestions: [],
      rsvps: [{ status: 'going' }, { status: 'going' }, { status: 'maybe' }, { status: 'no' }],
      bringItems: []
    })
    expect(stats.going).toBe(2)
    expect(stats.maybe).toBe(1)
    expect(stats.declined).toBe(1)
  })

  it('reports bring-list progress (claimed vs total)', () => {
    const stats = computeEventStats({
      suggestions: [],
      rsvps: [],
      bringItems: [{ user_id: 'a' }, { user_id: null }, { user_id: 'b' }]
    })
    expect(stats.bringTotal).toBe(3)
    expect(stats.bringClaimed).toBe(2)
  })

  it('lists the top-2 picks, most votes first', () => {
    const stats = computeEventStats({
      suggestions: [sug('s1', 'a', ['x'], 'One'), sug('s2', 'b', ['x', 'y', 'z'], 'Three'), sug('s3', 'c', ['x', 'y'], 'Two')],
      rsvps: [],
      bringItems: []
    })
    expect(stats.topPicks).toEqual([
      { title: 'Three', votes: 3 },
      { title: 'Two', votes: 2 }
    ])
  })

  it('returns an empty topPicks list when nothing has votes', () => {
    const stats = computeEventStats({
      suggestions: [sug('s1', 'a', []), sug('s2', 'b', [])],
      rsvps: [],
      bringItems: []
    })
    expect(stats.topPicks).toEqual([])
  })
})
