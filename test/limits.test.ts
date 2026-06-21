import { describe, expect, it } from 'vitest'
import { SUGGESTION_LIMIT, VOTE_LIMIT, countMySuggestions, countMyVotes } from '../shared/utils/limits'
import type { Suggestion } from '../shared/types/suggestion'

function mk(partial: Partial<Suggestion>): Suggestion {
  return {
    id: Math.random().toString(36).slice(2),
    event_id: 'e1',
    user_id: 'bob',
    tmdb_movie: { id: 1, title: 'X' },
    deleted: false,
    created_at: '2026-01-01T00:00:00Z',
    votes: [],
    ...partial
  }
}

describe('participation limits', () => {
  it('mirror the DB caps: 5 suggestions, 3 votes', () => {
    expect(SUGGESTION_LIMIT).toBe(5)
    expect(VOTE_LIMIT).toBe(3)
  })

  it('countMySuggestions counts my non-deleted suggestions only', () => {
    const list = [mk({ user_id: 'me' }), mk({ user_id: 'me', deleted: true }), mk({ user_id: 'bob' })]
    expect(countMySuggestions(list, 'me')).toBe(1)
    expect(countMySuggestions(list, 'bob')).toBe(1)
    expect(countMySuggestions(list, null)).toBe(0)
  })

  it('countMyVotes counts the suggestions I voted for', () => {
    const list = [
      mk({ votes: [{ user_id: 'me' }] }),
      mk({ votes: [{ user_id: 'bob' }] }),
      mk({ votes: [{ user_id: 'me' }, { user_id: 'x' }] })
    ]
    expect(countMyVotes(list, 'me')).toBe(2)
    expect(countMyVotes(list, null)).toBe(0)
  })
})
