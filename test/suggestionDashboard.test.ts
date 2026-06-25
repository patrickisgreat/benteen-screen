import { describe, expect, it } from 'vitest'
import type { AdminSuggestion } from '../shared/types/suggestion'
import { computeSuggestionDashboard } from '../shared/utils/suggestionDashboard'

// Build an admin suggestion: author + named voters, vote count derived from voters.
function sug(
  id: string,
  author: { id: string, name: string },
  voters: Array<{ id: string, name: string }>,
  opts: { title?: string, deleted?: boolean } = {}
): AdminSuggestion {
  return {
    id,
    event_id: 'e1',
    user_id: author.id,
    tmdb_movie: { id: Number(id.replace(/\D/g, '')) || 1, title: opts.title ?? id },
    deleted: opts.deleted ?? false,
    created_at: '2026-01-01T00:00:00Z',
    voteCount: voters.length,
    author: { display_name: author.name, email: `${author.id}@x.com` },
    votes: voters.map(v => ({ user_id: v.id, voter: { display_name: v.name } }))
  }
}

describe('computeSuggestionDashboard', () => {
  it('pivots per person: what each suggested and voted for', () => {
    const { byPerson } = computeSuggestionDashboard({
      suggestions: [
        sug('s1', { id: 'ada', name: 'Ada' }, [{ id: 'bo', name: 'Bo' }, { id: 'ada', name: 'Ada' }], { title: 'Heat' }),
        sug('s2', { id: 'bo', name: 'Bo' }, [{ id: 'ada', name: 'Ada' }], { title: 'Casino' })
      ]
    })
    const ada = byPerson.find(p => p.userId === 'ada')!
    expect(ada.suggested.map(m => m.title)).toEqual(['Heat'])
    expect(ada.votedFor.map(m => m.title).sort()).toEqual(['Casino', 'Heat'])
    const bo = byPerson.find(p => p.userId === 'bo')!
    expect(bo.suggested.map(m => m.title)).toEqual(['Casino'])
    expect(bo.votedFor.map(m => m.title)).toEqual(['Heat'])
  })

  it('summarizes totals, most-voted, and top voters', () => {
    const { summary } = computeSuggestionDashboard({
      suggestions: [
        sug('s1', { id: 'ada', name: 'Ada' }, [{ id: 'bo', name: 'Bo' }, { id: 'cy', name: 'Cy' }], { title: 'Heat' }),
        sug('s2', { id: 'bo', name: 'Bo' }, [{ id: 'bo', name: 'Bo' }], { title: 'Casino' })
      ]
    })
    expect(summary.suggestions).toBe(2)
    expect(summary.votes).toBe(3)
    expect(summary.submitters).toBe(2) // ada, bo
    expect(summary.voters).toBe(2) // distinct voters: bo, cy
    expect(summary.mostVoted).toEqual({ title: 'Heat', votes: 2 })
    expect(summary.topVoters[0]).toMatchObject({ name: 'Bo', votes: 2 })
  })

  it('excludes hidden suggestions from every figure', () => {
    const { summary, byPerson } = computeSuggestionDashboard({
      suggestions: [
        sug('s1', { id: 'ada', name: 'Ada' }, [{ id: 'bo', name: 'Bo' }], { title: 'Live' }),
        sug('gone', { id: 'cy', name: 'Cy' }, [{ id: 'ada', name: 'Ada' }], { title: 'Gone', deleted: true })
      ]
    })
    expect(summary.suggestions).toBe(1)
    expect(summary.votes).toBe(1)
    expect(byPerson.some(p => p.userId === 'cy')).toBe(false)
  })

  it('marks winners on the suggester', () => {
    const { byPerson } = computeSuggestionDashboard({
      suggestions: [sug('s1', { id: 'ada', name: 'Ada' }, [{ id: 'bo', name: 'Bo' }], { title: 'Heat' })],
      winnerIds: ['s1']
    })
    expect(byPerson.find(p => p.userId === 'ada')!.suggested[0]!.won).toBe(true)
  })

  it('flags expected people who have not suggested and/or voted', () => {
    const { gaps } = computeSuggestionDashboard({
      suggestions: [sug('s1', { id: 'ada', name: 'Ada' }, [{ id: 'ada', name: 'Ada' }], { title: 'Heat' })],
      expected: [
        { userId: 'ada', name: 'Ada' }, // suggested + voted → not a gap
        { userId: 'bo', name: 'Bo' }, // did nothing → gap (both false)
        { userId: 'cy', name: 'Cy' }
      ]
    })
    expect(gaps.map(g => g.userId).sort()).toEqual(['bo', 'cy'])
    expect(gaps.find(g => g.userId === 'bo')).toMatchObject({ suggested: false, voted: false })
    expect(gaps.find(g => g.userId === 'ada')).toBeUndefined()
  })
})
