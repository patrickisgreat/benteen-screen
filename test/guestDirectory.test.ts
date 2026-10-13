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
  { email: 'ada@x.com', display_name: 'Ada Lovelace', phone: '+15551230001' },
  { email: 'dee@x.com', display_name: '  ', phone: null },
  { email: 'dee@x.com', display_name: 'Dee', phone: '+15551230002' },
  { email: 'dee@x.com', display_name: 'Dee', phone: '+15559999999' }
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

  it('carries a phone from a past guest list onto the person, first known number wins', () => {
    const merged = mergeGuestCandidates(members, roster, pastGuests)
    expect(merged.find(c => c.email === 'ada@x.com')?.phone).toBe('+15551230001')
    expect(merged.find(c => c.email === 'dee@x.com')?.phone).toBe('+15551230002')
    expect(merged.find(c => c.email === 'bo@x.com')?.phone).toBeNull()
  })

  it('drops rows without an email and sorts by name', () => {
    const merged = mergeGuestCandidates(members, roster, pastGuests)
    expect(merged.some(c => c.display_name === 'Ghost')).toBe(false)
    expect(merged.map(c => c.display_name)).toEqual(['Ada', 'Bo', 'Cy', 'Dee'])
  })
})

describe('mergeGuestCandidates with contacts', () => {
  it('the contact record\'s number overrides a stale guest-list number', () => {
    const merged = mergeGuestCandidates(
      [{ email: 'ada@x.com', display_name: 'Ada' }],
      [],
      [{ email: 'ada@x.com', display_name: null, phone: '+15550000001' }],
      [{ email: 'ADA@x.com', display_name: null, phone: '+15550000002' }]
    )
    expect(merged).toEqual([{ email: 'ada@x.com', display_name: 'Ada', phone: '+15550000002', source: 'member' }])
  })

  it('gives a member their number even when no guest list ever had it', () => {
    const merged = mergeGuestCandidates([{ email: 'bo@x.com', display_name: 'Bo' }], [], [], [{ email: 'bo@x.com', display_name: null, phone: '+15550000003' }])
    expect(merged[0]?.phone).toBe('+15550000003')
  })

  it('ignores a contact without a number', () => {
    const merged = mergeGuestCandidates([{ email: 'bo@x.com', display_name: 'Bo' }], [], [], [{ email: 'bo@x.com', display_name: null, phone: null }])
    expect(merged[0]?.phone).toBeNull()
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
