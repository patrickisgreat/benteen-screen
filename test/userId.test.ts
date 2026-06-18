import { describe, expect, it } from 'vitest'
import type { JwtPayload } from '@supabase/supabase-js'
import { claimsUserId, inviterNameFromClaims } from '../server/utils/userId'

describe('claimsUserId', () => {
  it('reads the id from the JWT `sub` claim (not `id`)', () => {
    const claims = { sub: '54d2d3f7-ad73-49c5-ad60-afecb2883747', email: 'a@x.com' } as unknown as JwtPayload
    expect(claimsUserId(claims)).toBe('54d2d3f7-ad73-49c5-ad60-afecb2883747')
  })

  it('returns null for a null user', () => {
    expect(claimsUserId(null)).toBeNull()
  })

  it('returns null when there is no sub (so we never query id=eq.undefined)', () => {
    // The regression: serverSupabaseUser returns claims, and reading `.id` gave
    // undefined → PostgREST 22P02. A claims object with an `id` but no `sub` must
    // still resolve to null, not the bogus id.
    const claims = { id: 'should-be-ignored', email: 'a@x.com' } as unknown as JwtPayload
    expect(claimsUserId(claims)).toBeNull()
  })

  it('returns null for a blank sub', () => {
    expect(claimsUserId({ sub: '' } as unknown as JwtPayload)).toBeNull()
  })
})

describe('inviterNameFromClaims', () => {
  it('prefers the full name', () => {
    expect(inviterNameFromClaims({ user_metadata: { full_name: 'Ada Lovelace', name: 'ada' }, email: 'a@b.c' }))
      .toBe('Ada Lovelace')
  })

  it('falls back to name, then email', () => {
    expect(inviterNameFromClaims({ user_metadata: { name: 'ada' }, email: 'a@b.c' })).toBe('ada')
    expect(inviterNameFromClaims({ user_metadata: {}, email: 'a@b.c' })).toBe('a@b.c')
    expect(inviterNameFromClaims({ user_metadata: null, email: 'a@b.c' })).toBe('a@b.c')
  })

  it('returns null when no name or email is present', () => {
    expect(inviterNameFromClaims({ user_metadata: null, email: null })).toBeNull()
    expect(inviterNameFromClaims({})).toBeNull()
  })
})
