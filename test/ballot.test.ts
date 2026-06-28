import { describe, expect, it } from 'vitest'
import { liveVoteCount } from '../shared/utils/ballot'

describe('liveVoteCount', () => {
  it('counts only votes without a hidden_at timestamp', () => {
    expect(liveVoteCount([{ hidden_at: null }, { hidden_at: '2026-06-01T00:00:00Z' }, {}])).toBe(2)
  })

  it('treats a missing hidden_at as live', () => {
    expect(liveVoteCount([{}, {}])).toBe(2)
  })

  it('returns 0 for empty / null / undefined', () => {
    expect(liveVoteCount([])).toBe(0)
    expect(liveVoteCount(null)).toBe(0)
    expect(liveVoteCount(undefined)).toBe(0)
  })
})
