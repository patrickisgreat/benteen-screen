import { describe, expect, it } from 'vitest'
import { mergeGuestCandidates, searchGuestCandidates } from '../shared/utils/guestDirectory'

const members = [
  { email: 'Ada@x.com', display_name: 'Ada' },
  { email: 'bo@x.com', display_name: null },
  { email: null, display_name: 'Ghost' }
]
const roster = [
  { email: 'bo@x.com', display_name: 'Bo' },
  { email: 'cy@x.com', display_name: 'Cy' }
]
const pastGuests = [
  { email: 'ada@x.com', display_name: 'Ada Lovelace' },
  { email: 'dee@x.com', display_name: '  ' },
  { email: 'dee@x.com', display_name: 'Dee' }
]

describe('mergeGuestCandidates', () => {
  it('dedupes by email regardless of case and tags the highest-precedence source', () => {
    const merged = mergeGuestCandidates(members, roster, pastGuests)
    const ada = merged.find(c => c.email === 'ada@x.com')
    expect(ada).toMatchObject({ source: 'member', display_name: 'Ada' })
    expect(merged.filter(c => c.email === 'ada@x.com')).toHaveLength(1)
  })

  it('fills a missing name from a lower-precedence source', () => {
    const merged = mergeGuestCandidates(members, roster, pastGuests)
    expect(merged.find(c => c.email === 'bo@x.com')).toMatchObject({ source: 'member', display_name: 'Bo' })
    expect(merged.find(c => c.email === 'dee@x.com')).toMatchObject({ source: 'past-guest', display_name: 'Dee' })
  })

  it('drops rows without an email and sorts by name', () => {
    const merged = mergeGuestCandidates(members, roster, pastGuests)
    expect(merged.some(c => c.display_name === 'Ghost')).toBe(false)
    expect(merged.map(c => c.display_name)).toEqual(['Ada', 'Bo', 'Cy', 'Dee'])
  })
})

describe('searchGuestCandidates', () => {
  const candidates = mergeGuestCandidates(members, roster, pastGuests)

  it('returns nothing for an empty query', () => {
    expect(searchGuestCandidates(candidates, '   ')).toEqual([])
  })

  it('matches on name or email, case-insensitively', () => {
    expect(searchGuestCandidates(candidates, 'ADA').map(c => c.email)).toEqual(['ada@x.com'])
    expect(searchGuestCandidates(candidates, 'cy@').map(c => c.email)).toEqual(['cy@x.com'])
  })

  it('hides people already on the guest list', () => {
    expect(searchGuestCandidates(candidates, 'x.com', ['ADA@x.com', 'bo@x.com']).map(c => c.email)).toEqual(['cy@x.com', 'dee@x.com'])
  })

  it('caps the number of matches', () => {
    expect(searchGuestCandidates(candidates, 'x.com', [], 2)).toHaveLength(2)
  })
})
