import { describe, expect, it } from 'vitest'
import { DEFAULT_INVITE_OPTIONS } from '../shared/types/invite-options'
import { normalizeInviteOptions } from '../shared/utils/invite-options'

describe('normalizeInviteOptions', () => {
  it('returns the defaults for null/garbage input', () => {
    expect(normalizeInviteOptions(null)).toEqual(DEFAULT_INVITE_OPTIONS)
    expect(normalizeInviteOptions('nope')).toEqual(DEFAULT_INVITE_OPTIONS)
    expect(normalizeInviteOptions(42)).toEqual(DEFAULT_INVITE_OPTIONS)
  })

  it('keeps valid values', () => {
    const input = { theme: 'neon', accent: 'red', message: 'hi', showPoster: false, showDetails: true, textMessage: 'Hey {name}' }
    expect(normalizeInviteOptions(input)).toEqual(input)
  })

  it('falls back per-field for invalid theme/accent and wrong types', () => {
    const result = normalizeInviteOptions({ theme: 'bogus', accent: 'purple', message: 123, showPoster: 'yes' })
    expect(result.theme).toBe(DEFAULT_INVITE_OPTIONS.theme)
    expect(result.accent).toBe(DEFAULT_INVITE_OPTIONS.accent)
    expect(result.message).toBe('')
    expect(result.showPoster).toBe(DEFAULT_INVITE_OPTIONS.showPoster)
  })

  it('treats a missing or non-string text template as empty (use the default at send time)', () => {
    expect(normalizeInviteOptions({ theme: 'neon' }).textMessage).toBe('')
    expect(normalizeInviteOptions({ textMessage: ['nope'] }).textMessage).toBe('')
  })
})
