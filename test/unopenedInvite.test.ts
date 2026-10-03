import { describe, expect, it } from 'vitest'
import { isUnopenedInvite, type InviteTracking } from '../shared/utils/unopenedInvite'

const invite = (over: Partial<InviteTracking> = {}): InviteTracking => ({
  sent_at: '2026-10-01T00:00:00Z', opened_at: null, clicked_at: null, bounced_at: null, rsvp: null, ...over
})

describe('isUnopenedInvite', () => {
  it('is true for a sent e-vite with no sign it was seen', () => {
    expect(isUnopenedInvite(invite())).toBe(true)
  })

  it('is false once they opened it', () => {
    expect(isUnopenedInvite(invite({ opened_at: 't' }))).toBe(false)
  })

  it('is false when they clicked its RSVP link, even with no open recorded (images off)', () => {
    expect(isUnopenedInvite(invite({ clicked_at: 't' }))).toBe(false)
  })

  it('is false when they already replied, by any route', () => {
    expect(isUnopenedInvite(invite({ rsvp: 'going' }))).toBe(false)
    expect(isUnopenedInvite(invite({ rsvp: 'no' }))).toBe(false)
  })

  it('is false for a bounced address — another copy would bounce too', () => {
    expect(isUnopenedInvite(invite({ bounced_at: 't' }))).toBe(false)
  })

  it('is false for a guest who was never sent the e-vite', () => {
    expect(isUnopenedInvite(invite({ sent_at: null }))).toBe(false)
  })
})
