import { describe, expect, it } from 'vitest'
import { ANNOUNCE_SCOPES, ANNOUNCE_SCOPE_OPTIONS, DEFAULT_ANNOUNCE_SCOPE, announceIncludesRsvpButtons, parseAnnounceRequest } from '../shared/utils/announce'

const eventId = '11111111-1111-4111-8111-111111111111'
const base = { eventId, message: '<p>Doors at 7</p>', scope: 'guests' }

describe('announce scopes', () => {
  it('describes every scope exactly once, in the order the composer lists them', () => {
    expect(ANNOUNCE_SCOPE_OPTIONS.map(o => o.value)).toEqual([...ANNOUNCE_SCOPES])
    for (const o of ANNOUNCE_SCOPE_OPTIONS) expect(o.description.length).toBeGreaterThan(10)
  })

  it('offers the guests who haven\'t opened the e-vite as an audience', () => {
    expect(ANNOUNCE_SCOPES).toContain('unopened')
    expect(parseAnnounceRequest({ eventId, scope: 'unopened', preview: true })).toMatchObject({ ok: true, value: { scope: 'unopened' } })
  })

  it('gives RSVP buttons only to the audience that hasn\'t seen the e-vite', () => {
    expect(ANNOUNCE_SCOPES.filter(announceIncludesRsvpButtons)).toEqual(['unopened'])
  })

  it('defaults to this night\'s guest list, not the whole club', () => {
    expect(DEFAULT_ANNOUNCE_SCOPE).toBe('guests')
  })
})

describe('parseAnnounceRequest', () => {
  it('accepts a send with a real message', () => {
    const r = parseAnnounceRequest(base)
    expect(r).toMatchObject({ ok: true, value: { eventId, scope: 'guests', preview: false, message: '<p>Doors at 7</p>', emails: [] } })
  })

  it('rejects a send whose message is only empty markup', () => {
    expect(parseAnnounceRequest({ ...base, message: '<p></p>' })).toEqual({ ok: false, error: 'Write a message' })
    expect(parseAnnounceRequest({ ...base, message: undefined })).toEqual({ ok: false, error: 'Write a message' })
  })

  it('accepts a preview without any message', () => {
    const r = parseAnnounceRequest({ eventId, scope: 'members', preview: true })
    expect(r).toMatchObject({ ok: true, value: { scope: 'members', preview: true } })
  })

  it('requires at least one person for a custom audience, even in preview', () => {
    expect(parseAnnounceRequest({ eventId, scope: 'custom', preview: true })).toEqual({ ok: false, error: 'Pick at least one person' })
    expect(parseAnnounceRequest({ ...base, scope: 'custom', emails: [] })).toEqual({ ok: false, error: 'Pick at least one person' })
  })

  it('normalizes and dedupes hand-picked emails', () => {
    const r = parseAnnounceRequest({ ...base, scope: 'custom', emails: [' Ada@X.com ', 'ada@x.com', 'bo@x.com'] })
    expect(r.ok && r.value.emails).toEqual(['ada@x.com', 'bo@x.com'])
  })

  it('rejects malformed emails, unknown scopes and a non-uuid event', () => {
    expect(parseAnnounceRequest({ ...base, scope: 'custom', emails: ['not-an-email'] }).ok).toBe(false)
    expect(parseAnnounceRequest({ ...base, scope: 'everyone' }).ok).toBe(false)
    expect(parseAnnounceRequest({ ...base, eventId: 'e1' }).ok).toBe(false)
  })
})
