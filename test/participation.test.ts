import { describe, expect, it } from 'vitest'
import { countUserSuggestions, countUserVotes, remaining } from '../app/utils/participation'

const suggestions = [
  { userReference: { id: 'alice' }, votes: [{ userId: 'alice' }, { userId: 'bob' }] },
  { userReference: { id: 'bob' }, votes: [{ userId: 'alice' }] },
  { userReference: { id: 'carol' }, votes: [] }
]

describe('countUserVotes', () => {
  it('counts suggestions the user has voted on', () => {
    expect(countUserVotes(suggestions, 'alice')).toBe(2)
    expect(countUserVotes(suggestions, 'bob')).toBe(1)
    expect(countUserVotes(suggestions, 'carol')).toBe(0)
  })

  it('tolerates missing votes arrays', () => {
    expect(countUserVotes([{ userReference: { id: 'x' } }], 'x')).toBe(0)
  })
})

describe('countUserSuggestions', () => {
  it('counts suggestions authored by the user', () => {
    expect(countUserSuggestions(suggestions, 'alice')).toBe(1)
    expect(countUserSuggestions(suggestions, 'dave')).toBe(0)
  })
})

describe('remaining', () => {
  it('returns the remaining allowance', () => {
    expect(remaining(3, 1)).toBe(2)
  })
  it('never returns a negative number', () => {
    expect(remaining(3, 5)).toBe(0)
  })
})
