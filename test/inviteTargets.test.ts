import { describe, expect, it } from 'vitest'
import { parseInviteTargets } from '../shared/utils/inviteTargets'

describe('parseInviteTargets', () => {
  it('means "everyone unsent" when the body carries no filter', () => {
    expect(parseInviteTargets(undefined)).toBeNull()
    expect(parseInviteTargets(null)).toBeNull()
    expect(parseInviteTargets({})).toBeNull()
  })

  it('normalizes and dedupes the emails', () => {
    expect(parseInviteTargets({ emails: [' Ada@X.com ', 'ada@x.com', 'bo@x.com'] })).toEqual(['ada@x.com', 'bo@x.com'])
  })

  it('rejects malformed or empty filters instead of silently sending to everyone', () => {
    expect(() => parseInviteTargets({ emails: [] })).toThrow()
    expect(() => parseInviteTargets({ emails: ['not-an-email'] })).toThrow()
    expect(() => parseInviteTargets({ emails: 'ada@x.com' })).toThrow()
  })
})
