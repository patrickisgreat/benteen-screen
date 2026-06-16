import { describe, expect, it } from 'vitest'
import type { Suggestion } from '../shared/types/suggestion'
import { topWinners } from '../shared/utils/winners'

const make = (id: string, votes: number, created_at: string, deleted = false): Suggestion => ({
  id,
  event_id: 'e1',
  user_id: 'u1',
  tmdb_movie: { id: Number(id.replace(/\D/g, '')) || 0, title: id, release_date: '2000-01-01' },
  deleted,
  created_at,
  votes: Array.from({ length: votes }, (_, i) => ({ user_id: `voter-${i}` }))
})

describe('topWinners', () => {
  it('returns the two most-voted suggestions, most votes first', () => {
    const input = [
      make('a', 1, '2026-01-01T00:00:00Z'),
      make('b', 5, '2026-01-01T00:00:00Z'),
      make('c', 3, '2026-01-01T00:00:00Z')
    ]
    expect(topWinners(input).map(s => s.id)).toEqual(['b', 'c'])
  })

  it('breaks ties by earliest suggested so the result is stable', () => {
    const input = [
      make('late', 2, '2026-02-01T00:00:00Z'),
      make('early', 2, '2026-01-01T00:00:00Z')
    ]
    expect(topWinners(input).map(s => s.id)).toEqual(['early', 'late'])
  })

  it('excludes deleted suggestions', () => {
    const input = [
      make('gone', 9, '2026-01-01T00:00:00Z', true),
      make('keep', 1, '2026-01-01T00:00:00Z')
    ]
    expect(topWinners(input).map(s => s.id)).toEqual(['keep'])
  })

  it('excludes suggestions with zero votes', () => {
    const input = [make('voted', 1, '2026-01-01T00:00:00Z'), make('unvoted', 0, '2026-01-01T00:00:00Z')]
    expect(topWinners(input).map(s => s.id)).toEqual(['voted'])
  })

  it('respects a custom winner count', () => {
    const input = [
      make('a', 5, '2026-01-01T00:00:00Z'),
      make('b', 4, '2026-01-01T00:00:00Z'),
      make('c', 3, '2026-01-01T00:00:00Z')
    ]
    expect(topWinners(input, 1).map(s => s.id)).toEqual(['a'])
    expect(topWinners(input, 3).map(s => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('returns fewer than requested when there are not enough voted suggestions', () => {
    expect(topWinners([make('only', 2, '2026-01-01T00:00:00Z')])).toHaveLength(1)
    expect(topWinners([])).toEqual([])
  })

  it('does not mutate the input array', () => {
    const input = [make('a', 1, '2026-01-01T00:00:00Z'), make('b', 2, '2026-01-01T00:00:00Z')]
    const snapshot = input.map(s => s.id)
    topWinners(input)
    expect(input.map(s => s.id)).toEqual(snapshot)
  })
})
